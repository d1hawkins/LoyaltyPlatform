import type { TierRow } from './evaluator';

export interface MemberRecord {
  memberId: string;
  tenantId: string;
  tierId: string | null;
  lastTransactionAt: string | null;
}

export interface TierHistoryInsert {
  memberId: string;
  previousTierId: string | null;
  newTierId: string | null;
  rollingPoints: number;
  reason: 'auto_promotion' | 'auto_demotion' | 'manual';
  evaluatedAt: string;
  triggerEventId: string | null;
}

export interface TierRepository {
  /** Ensure internal tables (tier_history) exist. Idempotent. */
  ensureSchema(tenantId: string): Promise<void>;
  /** Sum of points_ledger.delta for the member over the last 12 months. */
  getRollingPoints(tenantId: string, memberId: string): Promise<number>;
  /** All active tiers for the tenant sorted ASC by min_points. */
  getTiers(tenantId: string): Promise<TierRow[]>;
  /** Load current member row (tier_id + last tx). Null if not found. */
  getMember(tenantId: string, memberId: string): Promise<MemberRecord | null>;
  /**
   * Atomically update members.tier_id and insert a tier_history audit row.
   * The implementation MUST wrap both statements in a single DB transaction.
   */
  applyTierChange(
    tenantId: string,
    memberId: string,
    newTierId: string | null,
    history: TierHistoryInsert,
  ): Promise<void>;
  /** Enumerate members whose last_transaction_at is older than cutoffDate. */
  listDemotionCandidates(tenantId: string, cutoffDate: Date): Promise<MemberRecord[]>;
  /** List all tenants that have been provisioned. Used by demotion cron. */
  listTenantIds(): Promise<string[]>;
}

/**
 * Note: the mssql-backed implementation is intentionally stubbed and will be
 * wired up once infra + A-03 migrations are available in the integration test
 * environment. The worker bootstraps in "in-memory" mode whenever the required
 * env vars are missing (see index.ts), exactly mirroring the loyalty-engine
 * pattern. Real implementation will live in repository.mssql.ts.
 */
