/**
 * Fraud detection types used across the fraud engine, rules, and repository.
 */

export interface FraudCheckResult {
  passed: boolean;
  flags: FraudFlag[];
  action: 'allow' | 'warn' | 'block' | 'quarantine';
}

export interface FraudFlag {
  ruleCode: string;
  severity: string;
  details: Record<string, unknown>;
}

export interface FraudRuleConfig {
  ruleCode: string;
  description: string;
  severity: 'warning' | 'block' | 'quarantine';
  isEnabled: boolean;
  config: Record<string, unknown>;
}

export interface FraudFlagRow {
  flagId: string;
  memberId: string;
  txnId: string | null;
  ruleCode: string;
  severity: string;
  detailsJson: string | null;
  status: 'open' | 'reviewed' | 'dismissed' | 'confirmed';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface TransactionInput {
  memberId: string;
  amount: number;
  currency: string;
  channel: string;
  transactionId?: string;
  locationId?: string;
  externalRef?: string;
}

export interface EnrollmentInput {
  sourceIp: string;
  email: string;
  emailDomain: string;
}

/**
 * Abstracts Redis-like cache operations needed by fraud rules.
 * In production backed by ioredis; in tests by an in-memory implementation.
 */
export interface FraudCacheClient {
  /** Increment a key and return new value. Creates key with value 1 if absent. */
  incr(key: string): Promise<number>;
  /** Set TTL on a key in seconds. */
  expire(key: string, seconds: number): Promise<void>;
  /** Get TTL remaining on a key (-1 = no expiry, -2 = key absent). */
  ttl(key: string): Promise<number>;
  /** Add a member with score to a sorted set. */
  zadd(key: string, score: number, member: string): Promise<void>;
  /** Sum of scores for members with score between min and max (inclusive). */
  zrangebyscoreWithScores(key: string, min: number, max: number): Promise<Array<{ member: string; score: number }>>;
  /** Remove sorted set members with score between min and max. */
  zremrangebyscore(key: string, min: number, max: number): Promise<void>;
  /** Count members in sorted set with score between min and max. */
  zcount(key: string, min: number, max: number): Promise<number>;
  /** Get a string value. */
  get(key: string): Promise<string | null>;
  /** Set a string value with optional TTL. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

/**
 * Repository for persisting fraud flags and loading rules from the database.
 */
export interface FraudRepository {
  getRules(tenantId: string): Promise<FraudRuleConfig[]>;
  insertFlag(tenantId: string, flag: {
    memberId: string;
    txnId: string | null;
    ruleCode: string;
    severity: string;
    detailsJson: string;
  }): Promise<string>;
  getFlags(tenantId: string, opts: {
    memberId?: string;
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<FraudFlagRow[]>;
  getFlagById(tenantId: string, flagId: string): Promise<FraudFlagRow | null>;
  reviewFlag(tenantId: string, flagId: string, review: {
    status: 'dismissed' | 'confirmed';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<FraudFlagRow | null>;
  updateRule(tenantId: string, ruleCode: string, update: {
    isEnabled?: boolean;
    severity?: string;
    configJson?: string;
  }): Promise<FraudRuleConfig | null>;
  getFlagStats(tenantId: string): Promise<{
    totalToday: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
  }>;
}
