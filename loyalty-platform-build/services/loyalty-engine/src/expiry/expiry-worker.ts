/**
 * Points Expiry Worker — scheduled job that expires points credits
 * whose expires_at has passed, and sends pre-expiry warnings.
 */

import { randomUUID } from 'crypto';
import type { Logger } from '@loyalty/shared-logger';
import type { CacheClient, EventPublisher, LoyaltyDb } from '../deps';
import { computeExpirableCredits, calculateExpiresAt } from './expiry-calculator';

export interface ExpiryWorkerDeps {
  db: LoyaltyDb;
  cache: CacheClient;
  publisher: EventPublisher;
  logger: Logger;
  /** Optional list of tenant IDs to process. In production, loaded from control plane. */
  tenantIds?: string[];
}

export interface ExpiryRunResult {
  totalCreditsExpired: number;
  totalPointsExpired: number;
  tenantBreakdown: Array<{
    tenantId: string;
    creditsExpired: number;
    pointsExpired: number;
  }>;
}

export interface DryRunResult {
  totalCreditsToExpire: number;
  totalPointsToExpire: number;
  memberBreakdown: Array<{
    memberId: string;
    points: number;
    expiresAt: string;
  }>;
}

export interface BackfillResult {
  totalUpdated: number;
  entries: Array<{ ledgerId: string; expiresAt: string }>;
}

function balanceKey(tenantId: string, memberId: string): string {
  return `tenant:${tenantId}:member:${memberId}:balance`;
}

export class ExpiryWorker {
  constructor(private readonly deps: ExpiryWorkerDeps) {}

  /**
   * Run the expiry job for all configured tenants.
   * If dryRun is true, no ledger entries are written.
   */
  async runExpiry(tenantId: string, dryRun = false): Promise<ExpiryRunResult | DryRunResult> {
    const cfg = await this.deps.db.getProgramConfig(tenantId);
    if (!cfg.pointsExpiryMonths) {
      this.deps.logger.info({ tenantId }, 'expiry.skipped — no expiry configured');
      if (dryRun) {
        return { totalCreditsToExpire: 0, totalPointsToExpire: 0, memberBreakdown: [] };
      }
      return { totalCreditsExpired: 0, totalPointsExpired: 0, tenantBreakdown: [] };
    }

    const expiringCredits = await this.deps.db.getExpiringCredits(tenantId);
    const toExpire = computeExpirableCredits(expiringCredits);

    if (dryRun) {
      // Aggregate by member
      const byMember = new Map<string, { points: number; expiresAt: string }>();
      for (const item of toExpire) {
        const existing = byMember.get(item.memberId);
        if (existing) {
          existing.points += item.remainingDelta;
          if (item.expiresAt < existing.expiresAt) existing.expiresAt = item.expiresAt;
        } else {
          byMember.set(item.memberId, {
            points: item.remainingDelta,
            expiresAt: item.expiresAt,
          });
        }
      }
      return {
        totalCreditsToExpire: toExpire.length,
        totalPointsToExpire: toExpire.reduce((s, c) => s + c.remainingDelta, 0),
        memberBreakdown: Array.from(byMember.entries()).map(([memberId, { points, expiresAt }]) => ({
          memberId,
          points,
          expiresAt,
        })),
      };
    }

    let totalCredits = 0;
    let totalPoints = 0;
    const affectedMembers = new Set<string>();

    for (const credit of toExpire) {
      const ledgerId = randomUUID();
      await this.deps.db.withTransaction(tenantId, async (tx) => {
        const current = await tx.currentBalance(credit.memberId);
        const balanceAfter = current - credit.remainingDelta;
        await tx.insertLedgerEntry({
          id: ledgerId,
          tenantId,
          memberId: credit.memberId,
          delta: -credit.remainingDelta,
          balanceAfter,
          reasonCode: 'expire',
          refLedgerId: credit.ledgerId,
          note: `Expired credit ${credit.ledgerId}`,
        });
      });

      // Invalidate balance cache
      await this.deps.cache.del(balanceKey(tenantId, credit.memberId));
      affectedMembers.add(credit.memberId);

      totalCredits++;
      totalPoints += credit.remainingDelta;

      // Publish expiry event for notification trigger
      await this.deps.publisher.publish(
        'points.expired',
        'points.expired',
        {
          memberId: credit.memberId,
          ledgerId: credit.ledgerId,
          expiryLedgerId: ledgerId,
          pointsExpired: credit.remainingDelta,
          expiresAt: credit.expiresAt,
        },
        tenantId,
      );
    }

    this.deps.logger.info(
      { tenantId, totalCredits, totalPoints, affectedMembers: affectedMembers.size },
      'expiry.completed',
    );

    return {
      totalCreditsExpired: totalCredits,
      totalPointsExpired: totalPoints,
      tenantBreakdown: [{ tenantId, creditsExpired: totalCredits, pointsExpired: totalPoints }],
    };
  }

  /**
   * Send expiry warning notifications for credits expiring in N days.
   */
  async runExpiryWarnings(tenantId: string): Promise<number> {
    const cfg = await this.deps.db.getProgramConfig(tenantId);
    if (!cfg.pointsExpiryMonths || !cfg.expiryNotificationDays) {
      return 0;
    }

    const daysList = cfg.expiryNotificationDays
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    let totalNotifications = 0;

    for (const days of daysList) {
      const warnings = await this.deps.db.getCreditsExpiringInDays(tenantId, days);

      for (const warning of warnings) {
        const templateKey =
          days >= 30 ? 'points_expiry_reminder_30d' : 'points_expiry_reminder_7d';

        await this.deps.publisher.publish(
          'notification.send',
          'notification.send',
          {
            memberId: warning.memberId,
            templateKey,
            channel: 'email',
            variables: {
              expiringPoints: warning.totalExpiringPoints,
              expiryDate: warning.earliestExpiryDate,
              daysUntilExpiry: days,
            },
          },
          tenantId,
        );
        totalNotifications++;
      }
    }

    this.deps.logger.info(
      { tenantId, totalNotifications },
      'expiry.warnings.sent',
    );
    return totalNotifications;
  }

  /**
   * Backfill expires_at for existing ledger entries that don't have it.
   */
  async backfill(tenantId: string): Promise<BackfillResult> {
    const cfg = await this.deps.db.getProgramConfig(tenantId);
    if (!cfg.pointsExpiryMonths) {
      return { totalUpdated: 0, entries: [] };
    }

    const entries = await this.deps.db.getLedgerEntriesWithoutExpiry(tenantId);
    const updated: Array<{ ledgerId: string; expiresAt: string }> = [];

    for (const entry of entries) {
      const expiresAt = calculateExpiresAt(entry.createdAt, cfg.pointsExpiryMonths);
      await this.deps.db.setExpiresAt(tenantId, entry.id, expiresAt);
      updated.push({ ledgerId: entry.id, expiresAt });
    }

    this.deps.logger.info(
      { tenantId, totalUpdated: updated.length },
      'expiry.backfill.completed',
    );

    return { totalUpdated: updated.length, entries: updated };
  }
}
