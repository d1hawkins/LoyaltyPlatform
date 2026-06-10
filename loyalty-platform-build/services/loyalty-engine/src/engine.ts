import { randomUUID } from 'crypto';
import type { Logger } from '@loyalty/shared-logger';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@loyalty/shared-errors';
import { calculate, CalculatorSkuLine } from './points-calculator';
import type { CacheClient, EventPublisher, LoyaltyDb, MemberClient } from './deps';
import type { FraudEngine as FraudEngineType, FraudCheckResult } from './fraud';

export interface EngineDeps {
  db: LoyaltyDb;
  cache: CacheClient;
  publisher: EventPublisher;
  memberClient: MemberClient;
  logger: Logger;
  fraudEngine?: FraudEngineType;
  fraudEnabled?: boolean;
}

export interface TransactionRequest {
  memberId: string;
  channel: string;
  amount: number;
  currency: string;
  skuList?: CalculatorSkuLine[];
  locationId?: string;
  occurredAt?: string;
  storeId?: string;
  storeName?: string;
  registerId?: string;
  associateId?: string;
  associateName?: string;
  sourceChannel?: string;
  sourceSystem?: string;
  orderRef?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionResponse {
  transactionId: string;
  pointsEarned: number;
  newBalance: number;
  tierId: string;
  appliedMultipliers: unknown[];
  fraudFlags?: Array<{ ruleCode: string; severity: string }>;
  earnMode?: 'per-dollar' | 'per-visit';
  qualifiedAsVisit?: boolean;
  dailyVisitCount?: number;
  maxVisitsPerDay?: number | null;
}

export interface VoidResponse {
  transactionId: string;
  pointsReversed: number;
  newBalance: number;
  negativeBalanceFlag: boolean;
}

export interface AdjustmentRequest {
  delta: number;
  reasonCode: 'adjust' | 'bonus';
  notes?: string;
}

export interface AdjustmentResponse {
  ledgerId: string;
  delta: number;
  newBalance: number;
}

export interface RedemptionRequest {
  memberId: string;
  offerId?: string;
  pointsToBurn: number;
  redemptionContext?: Record<string, unknown>;
}

export interface RedemptionResponse {
  redemptionId: string;
  pointsUsed: number;
  newBalance: number;
}

const BALANCE_TTL = 300;

function balanceKey(tenantId: string, memberId: string): string {
  return `tenant:${tenantId}:member:${memberId}:balance`;
}

function hashRequest(body: unknown): string {
  return JSON.stringify(body);
}

export class LoyaltyEngine {
  constructor(private readonly deps: EngineDeps) {}

  /**
   * Idempotency wrapper. If a prior response exists for (tenant,key):
   *  - same body hash → return cached response
   *  - different body → 409 Conflict
   * Otherwise runs `fn` and stores the result.
   */
  async withIdempotency<T extends { statusCode: number; body: unknown }>(
    tenantId: string,
    key: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const hash = hashRequest(body);
    const existing = await this.deps.db.getIdempotency(tenantId, key);
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ConflictError('Idempotency-Key reused with different request body');
      }
      return {
        statusCode: existing.statusCode,
        body: existing.responseBody,
      } as T;
    }
    const result = await fn();
    await this.deps.db.putIdempotency(tenantId, {
      idempotencyKey: key,
      requestHash: hash,
      statusCode: result.statusCode,
      responseBody: result.body,
      createdAt: new Date().toISOString(),
    });
    return result;
  }

  async getBalance(
    tenantId: string,
    memberId: string,
  ): Promise<{ balance: number; lastUpdated: string }> {
    const cached = await this.deps.cache.get(balanceKey(tenantId, memberId));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* fall through */
      }
    }
    const balance = await this.deps.db.getBalance(tenantId, memberId);
    const payload = { balance, lastUpdated: new Date().toISOString() };
    await this.deps.cache.set(balanceKey(tenantId, memberId), JSON.stringify(payload), BALANCE_TTL);
    return payload;
  }

  private async invalidateBalance(tenantId: string, memberId: string): Promise<void> {
    await this.deps.cache.del(balanceKey(tenantId, memberId));
  }

  async createTransaction(tenantId: string, req: TransactionRequest): Promise<TransactionResponse> {
    if (!req.memberId) throw new ValidationError('memberId required');
    if (typeof req.amount !== 'number' || req.amount < 0) {
      throw new ValidationError('amount must be a non-negative number');
    }

    const member = await this.deps.memberClient.getMember(tenantId, req.memberId);
    if (!member) throw new NotFoundError(`member ${req.memberId} not found`);
    if (member.status !== 'active') {
      throw new ForbiddenError(`member ${req.memberId} not active`);
    }

    // ── Fraud check (pre-processing) ──
    let fraudResult: FraudCheckResult | undefined;
    if (this.deps.fraudEnabled && this.deps.fraudEngine) {
      fraudResult = await this.deps.fraudEngine.checkTransaction(
        tenantId,
        req.memberId,
        { memberId: req.memberId, amount: req.amount, currency: req.currency || 'USD', channel: req.channel, locationId: req.locationId },
      );
      if (fraudResult.action === 'block') {
        // Persist flags and reject
        await this.deps.fraudEngine.persistFlags(tenantId, req.memberId, null, fraudResult.flags);
        throw new ForbiddenError('TRANSACTION_BLOCKED_FRAUD');
      }
    }

    const cfg = await this.deps.db.getProgramConfig(tenantId);

    let pointsEarned: number;
    let appliedMultipliers: unknown[] = [];
    let qualifiedAsVisit: boolean | undefined;
    let dailyVisitCount: number | undefined;

    if (cfg.earnMode === 'per-visit') {
      // Per-visit mode: flat points if transaction qualifies
      const amountCents = req.amount; // already in cents

      // Check minimum spend
      if (cfg.visitMinSpendCents && amountCents < cfg.visitMinSpendCents) {
        pointsEarned = 0;
        qualifiedAsVisit = false;
      } else {
        // Check daily visit cap
        if (cfg.maxVisitsPerDay) {
          const todayVisits = await this.deps.db.countTodayVisits(tenantId, req.memberId);
          dailyVisitCount = todayVisits + 1;
          if (todayVisits >= cfg.maxVisitsPerDay) {
            pointsEarned = 0;
            qualifiedAsVisit = false;
          } else {
            pointsEarned = cfg.pointsPerVisit ?? 10;
            qualifiedAsVisit = true;
          }
        } else {
          pointsEarned = cfg.pointsPerVisit ?? 10;
          qualifiedAsVisit = true;
        }
      }

      // Apply tier multiplier
      pointsEarned = Math.floor(pointsEarned * member.tierMultiplier);
    } else {
      // Existing per-dollar calculation via PointsCalculator
      const calc = calculate({
        amount: req.amount,
        currency: req.currency || cfg.currency,
        skuList: req.skuList ?? [],
        baseEarnRate: cfg.baseEarnRate,
        tierMultiplier: member.tierMultiplier,
        promoMultipliers: cfg.promoMultipliers,
        multiplierCap: cfg.multiplierCap,
      });
      pointsEarned = calc.totalPoints;
      appliedMultipliers = calc.appliedMultipliers;
    }

    const transactionId = randomUUID();
    const ledgerId = randomUUID();
    const occurredAt = req.occurredAt ?? new Date().toISOString();

    const newBalance = await this.deps.db.withTransaction(tenantId, async (tx) => {
      const current = await tx.currentBalance(req.memberId);
      const balanceAfter = current + pointsEarned;

      await tx.insertTransaction({
        id: transactionId,
        tenantId,
        memberId: req.memberId,
        channel: req.channel,
        amount: req.amount,
        currency: req.currency || cfg.currency,
        status: 'committed',
        pointsEarned,
        ledgerId,
        locationId: req.locationId,
        skuList: req.skuList ?? [],
        occurredAt,
        storeId: req.storeId,
        storeName: req.storeName,
        registerId: req.registerId,
        associateId: req.associateId,
        associateName: req.associateName,
        sourceChannel: req.sourceChannel,
        sourceSystem: req.sourceSystem,
        orderRef: req.orderRef,
        basketSize: req.skuList ? req.skuList.length : undefined,
        metadata: req.metadata,
      });

      let expiresAt: string | undefined;
      if (cfg.pointsExpiryMonths) {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() + cfg.pointsExpiryMonths);
        expiresAt = d.toISOString();
      }

      await tx.insertLedgerEntry({
        id: ledgerId,
        tenantId,
        memberId: req.memberId,
        transactionId,
        delta: pointsEarned,
        balanceAfter,
        reasonCode: 'earn',
        expiresAt,
      });

      return balanceAfter;
    });

    await this.invalidateBalance(tenantId, req.memberId);

    await this.deps.publisher.publish(
      'points.earned',
      'points.earned',
      {
        memberId: req.memberId,
        transactionId,
        ledgerId,
        delta: pointsEarned,
        newBalance,
        channel: req.channel,
        reasonCode: 'earn',
      },
      tenantId,
    );

    // ── Persist fraud flags (warn/quarantine) after successful transaction ──
    if (fraudResult && fraudResult.flags.length > 0 && this.deps.fraudEngine) {
      // Fire-and-forget to avoid adding latency to the response
      this.deps.fraudEngine.persistFlags(tenantId, req.memberId, transactionId, fraudResult.flags).catch((err) => {
        this.deps.logger.error({ err, tenantId, transactionId }, 'fraud.flag.persist_failed');
      });
    }

    // Fire-and-forget: check if this transaction triggered a visit milestone
    if (qualifiedAsVisit) {
      const offerServiceUrl = process.env.OFFER_SERVICE_URL;
      if (offerServiceUrl) {
        fetch(`${offerServiceUrl}/v1/internal/milestones/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'x-user-id': 'system' },
          body: JSON.stringify({ memberId: req.memberId, amountCents: req.amount }),
        }).catch(() => { /* best-effort */ });
      }
    }

    return {
      transactionId,
      pointsEarned,
      newBalance,
      tierId: member.tierId,
      appliedMultipliers,
      fraudFlags: fraudResult?.flags.length ? fraudResult.flags.map((f) => ({ ruleCode: f.ruleCode, severity: f.severity })) : undefined,
      earnMode: cfg.earnMode,
      qualifiedAsVisit,
      dailyVisitCount,
      maxVisitsPerDay: cfg.earnMode === 'per-visit' ? cfg.maxVisitsPerDay : undefined,
    };
  }

  async voidTransaction(
    tenantId: string,
    transactionId: string,
    reason: string,
  ): Promise<VoidResponse> {
    if (!reason) throw new ValidationError('reason required');

    const existing = await this.deps.db.getTransaction(tenantId, transactionId);
    if (!existing) throw new NotFoundError(`transaction ${transactionId} not found`);
    if (existing.status === 'voided') {
      throw new ConflictError('transaction already voided');
    }

    const cfg = await this.deps.db.getProgramConfig(tenantId);
    const ageHours = (Date.now() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > cfg.voidWindowHours) {
      throw new ForbiddenError('outside void window');
    }

    const reversalLedgerId = randomUUID();
    let negativeBalance = false;

    const newBalance = await this.deps.db.withTransaction(tenantId, async (tx) => {
      const current = await tx.currentBalance(existing.memberId);
      const balanceAfter = current - existing.pointsEarned;
      if (balanceAfter < 0) negativeBalance = true;

      await tx.updateTransactionStatus(transactionId, 'voided');
      await tx.insertLedgerEntry({
        id: reversalLedgerId,
        tenantId,
        memberId: existing.memberId,
        transactionId,
        delta: -existing.pointsEarned,
        balanceAfter,
        reasonCode: 'void',
        refLedgerId: existing.ledgerId,
      });
      return balanceAfter;
    });

    await this.invalidateBalance(tenantId, existing.memberId);

    if (negativeBalance) {
      this.deps.logger.warn(
        { tenantId, memberId: existing.memberId, transactionId, newBalance },
        'void.negative_balance',
      );
      await this.deps.publisher.publish(
        'points.void.negative_balance',
        'points.void.negative_balance',
        { memberId: existing.memberId, transactionId, newBalance },
        tenantId,
      );
    }

    await this.deps.publisher.publish(
      'transaction.voided',
      'transaction.voided',
      {
        memberId: existing.memberId,
        transactionId,
        originalLedgerId: existing.ledgerId,
        reversalLedgerId,
        delta: -existing.pointsEarned,
        newBalance,
        reason,
      },
      tenantId,
    );

    return {
      transactionId,
      pointsReversed: existing.pointsEarned,
      newBalance,
      negativeBalanceFlag: negativeBalance,
    };
  }

  async adjust(
    tenantId: string,
    memberId: string,
    req: AdjustmentRequest,
  ): Promise<AdjustmentResponse> {
    if (!Number.isFinite(req.delta) || req.delta === 0) {
      throw new ValidationError('delta must be a non-zero number');
    }
    const ledgerId = randomUUID();

    const newBalance = await this.deps.db.withTransaction(tenantId, async (tx) => {
      const current = await tx.currentBalance(memberId);
      const balanceAfter = current + req.delta;
      await tx.insertLedgerEntry({
        id: ledgerId,
        tenantId,
        memberId,
        delta: req.delta,
        balanceAfter,
        reasonCode: req.reasonCode ?? 'adjust',
        note: req.notes,
      });
      return balanceAfter;
    });

    await this.invalidateBalance(tenantId, memberId);

    const topic = req.delta > 0 ? 'points.earned' : 'points.redeemed';
    await this.deps.publisher.publish(
      topic,
      topic,
      {
        memberId,
        ledgerId,
        delta: req.delta,
        newBalance,
        reasonCode: req.reasonCode ?? 'adjust',
        notes: req.notes,
      },
      tenantId,
    );

    return { ledgerId, delta: req.delta, newBalance };
  }

  async redeem(tenantId: string, req: RedemptionRequest): Promise<RedemptionResponse> {
    if (!req.memberId) throw new ValidationError('memberId required');
    if (!Number.isInteger(req.pointsToBurn) || req.pointsToBurn <= 0) {
      throw new ValidationError('pointsToBurn must be positive integer');
    }

    const member = await this.deps.memberClient.getMember(tenantId, req.memberId);
    if (!member) throw new NotFoundError(`member ${req.memberId} not found`);
    if (member.status !== 'active') throw new ForbiddenError('member not active');

    const redemptionId = randomUUID();
    const ledgerId = randomUUID();

    const newBalance = await this.deps.db.withTransaction(tenantId, async (tx) => {
      const current = await tx.currentBalance(req.memberId);
      if (current < req.pointsToBurn) {
        throw new AppError('Insufficient points balance', 'INSUFFICIENT_BALANCE', 422);
      }
      const balanceAfter = current - req.pointsToBurn;
      await tx.insertLedgerEntry({
        id: ledgerId,
        tenantId,
        memberId: req.memberId,
        delta: -req.pointsToBurn,
        balanceAfter,
        reasonCode: 'redeem',
        note: req.offerId ? `offer:${req.offerId}` : undefined,
      });
      return balanceAfter;
    });

    await this.invalidateBalance(tenantId, req.memberId);

    await this.deps.publisher.publish(
      'points.redeemed',
      'points.redeemed',
      {
        memberId: req.memberId,
        redemptionId,
        ledgerId,
        delta: -req.pointsToBurn,
        newBalance,
        offerId: req.offerId,
      },
      tenantId,
    );

    return { redemptionId, pointsUsed: req.pointsToBurn, newBalance };
  }
}
