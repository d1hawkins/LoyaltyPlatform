/**
 * In-memory adapters used for dev mode and the unit/integration tests.
 * These intentionally model the same concurrency contract as the real
 * mssql implementation: `withTransaction` serializes per-tenant,
 * mirroring `BEGIN TRAN` semantics for the hot path tested here.
 */

import type {
  CacheClient,
  EventPublisher,
  ExpiringCredit,
  ExpiryWarningCredit,
  IdempotencyRecord,
  LedgerEntryRow,
  LoyaltyDb,
  LoyaltyTx,
  MemberClient,
  MemberRecord,
  ProgramConfig,
  TransactionRow,
} from './deps';

export class InMemoryDb implements LoyaltyDb {
  public transactions = new Map<string, TransactionRow>();
  public ledger: LedgerEntryRow[] = [];
  public idempotency = new Map<string, IdempotencyRecord>();
  private programConfig: ProgramConfig;
  private tenantLocks = new Map<string, Promise<unknown>>();

  // Hook for fault-injection tests
  public onLedgerInsert: ((row: Omit<LedgerEntryRow, 'createdAt'>) => void) | null = null;

  constructor(cfg?: Partial<ProgramConfig>) {
    this.programConfig = {
      baseEarnRate: 1,
      voidWindowHours: 168,
      multiplierCap: 5,
      currency: 'USD',
      promoMultipliers: [],
      earnMode: 'per-dollar',
      pointsPerVisit: null,
      visitMinSpendCents: null,
      maxVisitsPerDay: null,
      ...cfg,
    };
  }

  setProgramConfig(cfg: Partial<ProgramConfig>): void {
    this.programConfig = { ...this.programConfig, ...cfg };
  }

  async ensureIdempotencyTable(): Promise<void> {
    /* no-op */
  }

  async getProgramConfig(): Promise<ProgramConfig> {
    return this.programConfig;
  }

  async getBalance(_tenantId: string, memberId: string): Promise<number> {
    return this.ledger.filter((l) => l.memberId === memberId).reduce((sum, l) => sum + l.delta, 0);
  }

  async getTransaction(_tenantId: string, id: string): Promise<TransactionRow | null> {
    return this.transactions.get(id) ?? null;
  }

  async getLedgerEntry(_tenantId: string, id: string): Promise<LedgerEntryRow | null> {
    return this.ledger.find((l) => l.id === id) ?? null;
  }

  async getIdempotency(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(`${tenantId}:${key}`) ?? null;
  }

  async putIdempotency(tenantId: string, rec: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${tenantId}:${rec.idempotencyKey}`, rec);
  }

  async withTransaction<T>(tenantId: string, fn: (tx: LoyaltyTx) => Promise<T>): Promise<T> {
    // Serialize per-tenant to emulate BEGIN TRAN row locks on the member.
    const previous = this.tenantLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    this.tenantLocks.set(
      tenantId,
      previous.then(() => gate),
    );
    await previous;

    // Snapshot state for rollback on error.
    const txSnapshot = new Map(this.transactions);
    const ledgerSnapshot = [...this.ledger];

    const pendingTxInserts: TransactionRow[] = [];
    const pendingStatusUpdates: Array<[string, 'voided']> = [];
    const pendingLedger: LedgerEntryRow[] = [];

    const now = () => new Date().toISOString();
    const committedLedger = this.ledger;
    const onLedgerInsert = this.onLedgerInsert;

    const tx: LoyaltyTx = {
      insertTransaction: async (row) => {
        pendingTxInserts.push({ ...row, createdAt: now() });
      },
      updateTransactionStatus: async (id, status) => {
        pendingStatusUpdates.push([id, status]);
      },
      insertLedgerEntry: async (row) => {
        if (onLedgerInsert) onLedgerInsert(row);
        pendingLedger.push({ ...row, createdAt: now() });
      },
      currentBalance: async (memberId) => {
        // Include pending ledger so sequential inserts inside the same tx
        // see a monotonically-updated balance.
        const base = committedLedger
          .filter((l) => l.memberId === memberId)
          .reduce((s, l) => s + l.delta, 0);
        const pending = pendingLedger
          .filter((l) => l.memberId === memberId)
          .reduce((s, l) => s + l.delta, 0);
        return base + pending;
      },
    };

    try {
      const result = await fn(tx);
      // Commit
      for (const t of pendingTxInserts) this.transactions.set(t.id, t);
      for (const [id, status] of pendingStatusUpdates) {
        const existing = this.transactions.get(id);
        if (existing) this.transactions.set(id, { ...existing, status });
      }
      for (const l of pendingLedger) this.ledger.push(l);
      return result;
    } catch (err) {
      // Rollback — any fault during fn discards all pending writes.
      this.transactions = txSnapshot;
      this.ledger = ledgerSnapshot;
      throw err;
    } finally {
      release();
    }
  }

  async countTodayVisits(_tenantId: string, memberId: string): Promise<number> {
    const todayStr = new Date().toISOString().slice(0, 10);
    let count = 0;
    for (const t of this.transactions.values()) {
      if (t.memberId === memberId && t.status === 'committed' && t.occurredAt.slice(0, 10) === todayStr) {
        count++;
      }
    }
    return count;
  }

  async getExpiringCredits(_tenantId: string, asOfDate?: Date): Promise<ExpiringCredit[]> {
    const now = asOfDate ?? new Date();
    const credits = this.ledger.filter(
      (l) => l.delta > 0 && l.expiresAt && new Date(l.expiresAt) <= now,
    );
    const results: ExpiringCredit[] = [];
    for (const credit of credits) {
      // Check if already expired (has a debit referencing it with reason 'expire')
      const alreadyExpired = this.ledger.some(
        (l) => l.refLedgerId === credit.id && l.reasonCode === 'expire',
      );
      if (alreadyExpired) continue;

      // Calculate already used (redemptions/voids referencing this credit)
      const alreadyUsed = this.ledger
        .filter((l) => l.refLedgerId === credit.id && l.reasonCode !== 'expire' && l.delta < 0)
        .reduce((sum, l) => sum + Math.abs(l.delta), 0);

      results.push({
        ledgerId: credit.id,
        memberId: credit.memberId,
        delta: credit.delta,
        expiresAt: credit.expiresAt!,
        alreadyUsed,
      });
    }
    return results;
  }

  async getCreditsExpiringInDays(
    _tenantId: string,
    days: number,
    asOfDate?: Date,
  ): Promise<ExpiryWarningCredit[]> {
    const now = asOfDate ?? new Date();
    const windowStart = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + (days + 1) * 24 * 60 * 60 * 1000);

    const credits = this.ledger.filter((l) => {
      if (l.delta <= 0 || !l.expiresAt) return false;
      const exp = new Date(l.expiresAt);
      return exp >= windowStart && exp < windowEnd;
    });

    // Group by memberId
    const byMember = new Map<string, { total: number; earliest: string }>();
    for (const c of credits) {
      // Skip if already expired
      const alreadyExpired = this.ledger.some(
        (l) => l.refLedgerId === c.id && l.reasonCode === 'expire',
      );
      if (alreadyExpired) continue;

      const existing = byMember.get(c.memberId);
      const alreadyUsed = this.ledger
        .filter((l) => l.refLedgerId === c.id && l.reasonCode !== 'expire' && l.delta < 0)
        .reduce((sum, l) => sum + Math.abs(l.delta), 0);
      const remaining = c.delta - alreadyUsed;
      if (remaining <= 0) continue;

      if (existing) {
        existing.total += remaining;
        if (c.expiresAt! < existing.earliest) existing.earliest = c.expiresAt!;
      } else {
        byMember.set(c.memberId, { total: remaining, earliest: c.expiresAt! });
      }
    }

    return Array.from(byMember.entries()).map(([memberId, { total, earliest }]) => ({
      memberId,
      totalExpiringPoints: total,
      earliestExpiryDate: earliest,
    }));
  }

  async getLedgerEntriesWithoutExpiry(_tenantId: string): Promise<LedgerEntryRow[]> {
    return this.ledger.filter((l) => l.delta > 0 && l.reasonCode === 'earn' && !l.expiresAt);
  }

  async setExpiresAt(_tenantId: string, ledgerId: string, expiresAt: string): Promise<void> {
    const entry = this.ledger.find((l) => l.id === ledgerId);
    if (entry) entry.expiresAt = expiresAt;
  }
}

export class InMemoryCache implements CacheClient {
  private map = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string): Promise<string | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export interface CapturedEvent {
  topic: string;
  eventType: string;
  tenantId: string;
  payload: unknown;
}

export class InMemoryPublisher implements EventPublisher {
  public events: CapturedEvent[] = [];
  async publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<void> {
    this.events.push({ topic, eventType, tenantId, payload });
  }
}

export class InMemoryMemberClient implements MemberClient {
  private members = new Map<string, MemberRecord>();
  put(m: MemberRecord): void {
    this.members.set(`${m.tenantId}:${m.memberId}`, m);
  }
  async getMember(tenantId: string, memberId: string): Promise<MemberRecord | null> {
    return this.members.get(`${tenantId}:${memberId}`) ?? null;
  }
}
