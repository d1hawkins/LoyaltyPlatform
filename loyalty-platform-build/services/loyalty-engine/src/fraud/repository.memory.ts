/**
 * In-memory implementations of FraudRepository and FraudCacheClient for
 * testing. These mirror Redis semantics for counters, sorted sets, and TTL.
 */

import { randomUUID } from 'crypto';
import type {
  FraudCacheClient,
  FraudFlagRow,
  FraudRepository,
  FraudRuleConfig,
} from './types';

// ─── InMemoryFraudCache ─────────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  expiresAt: number; // ms epoch, Infinity = no expiry
}

interface SortedSetEntry {
  member: string;
  score: number;
}

export class InMemoryFraudCache implements FraudCacheClient {
  private store = new Map<string, CacheEntry>();
  private sortedSets = new Map<string, SortedSetEntry[]>();
  private ttls = new Map<string, number>(); // expiresAt in ms

  private isExpired(key: string): boolean {
    const t = this.ttls.get(key);
    if (t === undefined) return false;
    if (t < Date.now()) {
      this.store.delete(key);
      this.sortedSets.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }

  async incr(key: string): Promise<number> {
    if (this.isExpired(key)) { /* cleaned */ }
    const existing = this.store.get(key);
    const val = existing ? Number(existing.value) + 1 : 1;
    this.store.set(key, { value: String(val), expiresAt: existing?.expiresAt ?? Infinity });
    return val;
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.ttls.set(key, Date.now() + seconds * 1000);
  }

  async ttl(key: string): Promise<number> {
    if (this.isExpired(key)) return -2;
    const t = this.ttls.get(key);
    if (t === undefined) {
      // Key exists without explicit ttl?
      if (this.store.has(key) || this.sortedSets.has(key)) return -1;
      return -2;
    }
    return Math.ceil((t - Date.now()) / 1000);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    if (this.isExpired(key)) { /* cleaned */ }
    let set = this.sortedSets.get(key);
    if (!set) {
      set = [];
      this.sortedSets.set(key, set);
    }
    // Upsert
    const idx = set.findIndex((e) => e.member === member);
    if (idx >= 0) {
      set[idx] = { member, score };
    } else {
      set.push({ member, score });
    }
  }

  async zrangebyscoreWithScores(key: string, min: number, max: number): Promise<Array<{ member: string; score: number }>> {
    if (this.isExpired(key)) return [];
    const set = this.sortedSets.get(key);
    if (!set) return [];
    return set.filter((e) => e.score >= min && e.score <= max);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    const set = this.sortedSets.get(key);
    if (!set) return;
    const remaining = set.filter((e) => e.score < min || e.score > max);
    this.sortedSets.set(key, remaining);
  }

  async zcount(key: string, min: number, max: number): Promise<number> {
    if (this.isExpired(key)) return 0;
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    return set.filter((e) => e.score >= min && e.score <= max).length;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.store.set(key, { value, expiresAt });
    if (ttlSeconds) {
      this.ttls.set(key, expiresAt);
    }
  }
}

// ─── InMemoryFraudRepository ────────────────────────────────────────────────

const DEFAULT_RULES: FraudRuleConfig[] = [
  { ruleCode: 'VELOCITY_TXN_COUNT', description: 'Too many transactions in time window', severity: 'warning', isEnabled: true, config: { maxCount: 10, windowMinutes: 60 } },
  { ruleCode: 'VELOCITY_TXN_AMOUNT', description: 'Spend exceeds threshold in time window', severity: 'warning', isEnabled: true, config: { maxAmount: 1000, windowMinutes: 60 } },
  { ruleCode: 'RAPID_ENROLLMENT_REDEEM', description: 'Redemption too soon after enrollment', severity: 'block', isEnabled: true, config: { minHoursAfterEnroll: 24 } },
  { ruleCode: 'DUPLICATE_AMOUNT_PATTERN', description: 'Repeated identical amounts in short window', severity: 'warning', isEnabled: true, config: { maxRepeats: 3, windowMinutes: 30 } },
  { ruleCode: 'BULK_ENROLLMENT', description: 'Excessive enrollments from same source', severity: 'quarantine', isEnabled: true, config: { maxEnrollments: 20, windowMinutes: 60 } },
  { ruleCode: 'RAPID_BALANCE_DRAIN', description: 'Large redemption shortly after earning', severity: 'warning', isEnabled: true, config: { maxDrainPercent: 80, windowMinutes: 60 } },
  { ruleCode: 'LOCATION_VELOCITY', description: 'Transactions from different locations in short window', severity: 'warning', isEnabled: true, config: { windowMinutes: 30 } },
  { ruleCode: 'DUPLICATE_EXTERNAL_REF', description: 'Reuse of external reference ID', severity: 'warning', isEnabled: true, config: { windowHours: 24 } },
];

export class InMemoryFraudRepository implements FraudRepository {
  public flags: FraudFlagRow[] = [];
  public rules: FraudRuleConfig[] = [...DEFAULT_RULES];

  async getRules(_tenantId: string): Promise<FraudRuleConfig[]> {
    return this.rules.filter((r) => r.isEnabled);
  }

  async insertFlag(_tenantId: string, flag: {
    memberId: string;
    txnId: string | null;
    ruleCode: string;
    severity: string;
    detailsJson: string;
  }): Promise<string> {
    const flagId = randomUUID();
    this.flags.push({
      flagId,
      memberId: flag.memberId,
      txnId: flag.txnId,
      ruleCode: flag.ruleCode,
      severity: flag.severity,
      detailsJson: flag.detailsJson,
      status: 'open',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: new Date().toISOString(),
    });
    return flagId;
  }

  async getFlags(_tenantId: string, opts: {
    memberId?: string;
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<FraudFlagRow[]> {
    let results = [...this.flags];
    if (opts.memberId) results = results.filter((f) => f.memberId === opts.memberId);
    if (opts.status) results = results.filter((f) => f.status === opts.status);
    if (opts.severity) results = results.filter((f) => f.severity === opts.severity);
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  async getFlagById(_tenantId: string, flagId: string): Promise<FraudFlagRow | null> {
    return this.flags.find((f) => f.flagId === flagId) ?? null;
  }

  async reviewFlag(_tenantId: string, flagId: string, review: {
    status: 'dismissed' | 'confirmed';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<FraudFlagRow | null> {
    const flag = this.flags.find((f) => f.flagId === flagId);
    if (!flag) return null;
    flag.status = review.status;
    flag.reviewedBy = review.reviewedBy;
    flag.reviewedAt = new Date().toISOString();
    flag.reviewNotes = review.reviewNotes ?? null;
    return { ...flag };
  }

  async updateRule(_tenantId: string, ruleCode: string, update: {
    isEnabled?: boolean;
    severity?: string;
    configJson?: string;
  }): Promise<FraudRuleConfig | null> {
    const rule = this.rules.find((r) => r.ruleCode === ruleCode);
    if (!rule) return null;
    if (update.isEnabled !== undefined) rule.isEnabled = update.isEnabled;
    if (update.severity) rule.severity = update.severity as 'warning' | 'block' | 'quarantine';
    if (update.configJson) rule.config = JSON.parse(update.configJson);
    return { ...rule };
  }

  async getFlagStats(_tenantId: string): Promise<{
    totalToday: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayFlags = this.flags.filter((f) => new Date(f.createdAt) >= todayStart);

    const bySeverity: Record<string, number> = {};
    const byRule: Record<string, number> = {};
    for (const f of todayFlags) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byRule[f.ruleCode] = (byRule[f.ruleCode] ?? 0) + 1;
    }

    return { totalToday: todayFlags.length, bySeverity, byRule };
  }
}
