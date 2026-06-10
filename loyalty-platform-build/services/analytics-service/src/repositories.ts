/**
 * Analytics Service — Repository interfaces & in-memory implementations
 */

import {
  DailySummaryRow,
  CohortRow,
  MetricKey,
  TierDistributionEntry,
  ExportQuery,
} from './types';

// ────────────────────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────────────────────

export interface SummaryRepository {
  upsert(tenantId: string, row: Pick<DailySummaryRow, 'summaryDate' | 'metricKey' | 'metricValue' | 'dimensionsJson'>): Promise<void>;
  increment(tenantId: string, date: string, metricKey: MetricKey, delta: number, dimensions?: Record<string, unknown>): Promise<void>;
  query(tenantId: string, from: string, to: string, metrics?: MetricKey[]): Promise<DailySummaryRow[]>;
}

export interface CohortRepository {
  upsert(tenantId: string, row: Pick<CohortRow, 'cohortMonth' | 'daysSinceEnroll' | 'activeCount' | 'totalCount'>): Promise<void>;
  query(tenantId: string, from?: string, to?: string): Promise<CohortRow[]>;
}

export interface TierRepository {
  getDistribution(tenantId: string): Promise<TierDistributionEntry[]>;
}

export interface ExportRepository {
  stream(tenantId: string, query: ExportQuery): AsyncIterable<Record<string, unknown>>;
}

export interface RealtimeRepository {
  getKpis(tenantId: string, date: string): Promise<{
    activeMembersToday: number;
    transactionsToday: number;
    pointsIssuedToday: number;
    redemptionsToday: number;
  }>;
  incrementCounter(tenantId: string, date: string, metric: string, delta: number): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory implementations (for tests and local dev)
// ────────────────────────────────────────────────────────────────────────────

export class InMemorySummaryRepository implements SummaryRepository {
  private rows: Map<string, DailySummaryRow> = new Map();

  private key(tenantId: string, date: string, metric: string): string {
    return `${tenantId}:${date}:${metric}`;
  }

  async upsert(tenantId: string, row: Pick<DailySummaryRow, 'summaryDate' | 'metricKey' | 'metricValue' | 'dimensionsJson'>): Promise<void> {
    const k = this.key(tenantId, row.summaryDate, row.metricKey);
    const now = new Date().toISOString();
    this.rows.set(k, {
      summaryDate: row.summaryDate,
      metricKey: row.metricKey,
      metricValue: row.metricValue,
      dimensionsJson: row.dimensionsJson ?? null,
      createdAt: this.rows.get(k)?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async increment(tenantId: string, date: string, metricKey: MetricKey, delta: number, dimensions?: Record<string, unknown>): Promise<void> {
    const k = this.key(tenantId, date, metricKey);
    const existing = this.rows.get(k);
    const now = new Date().toISOString();
    if (existing) {
      existing.metricValue += delta;
      existing.updatedAt = now;
      if (dimensions) {
        existing.dimensionsJson = mergeDimensions(existing.dimensionsJson, dimensions);
      }
    } else {
      this.rows.set(k, {
        summaryDate: date,
        metricKey,
        metricValue: delta,
        dimensionsJson: dimensions ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async query(tenantId: string, from: string, to: string, metrics?: MetricKey[]): Promise<DailySummaryRow[]> {
    const result: DailySummaryRow[] = [];
    for (const [k, v] of this.rows) {
      if (!k.startsWith(tenantId + ':')) continue;
      if (v.summaryDate < from || v.summaryDate > to) continue;
      if (metrics && metrics.length > 0 && !metrics.includes(v.metricKey as MetricKey)) continue;
      result.push({ ...v });
    }
    return result.sort((a, b) => a.summaryDate.localeCompare(b.summaryDate) || a.metricKey.localeCompare(b.metricKey));
  }

  /** Exposed for testing */
  getAll(): DailySummaryRow[] {
    return [...this.rows.values()];
  }
}

export class InMemoryCohortRepository implements CohortRepository {
  private rows: Map<string, CohortRow> = new Map();

  private key(tenantId: string, month: string, days: number): string {
    return `${tenantId}:${month}:${days}`;
  }

  async upsert(tenantId: string, row: Pick<CohortRow, 'cohortMonth' | 'daysSinceEnroll' | 'activeCount' | 'totalCount'>): Promise<void> {
    const k = this.key(tenantId, row.cohortMonth, row.daysSinceEnroll);
    const rate = row.totalCount > 0 ? row.activeCount / row.totalCount : null;
    this.rows.set(k, {
      cohortMonth: row.cohortMonth,
      daysSinceEnroll: row.daysSinceEnroll,
      activeCount: row.activeCount,
      totalCount: row.totalCount,
      retentionRate: rate,
      updatedAt: new Date().toISOString(),
    });
  }

  async query(tenantId: string, from?: string, to?: string): Promise<CohortRow[]> {
    const result: CohortRow[] = [];
    for (const [k, v] of this.rows) {
      if (!k.startsWith(tenantId + ':')) continue;
      if (from && v.cohortMonth < from) continue;
      if (to && v.cohortMonth > to) continue;
      result.push({ ...v });
    }
    return result.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth) || a.daysSinceEnroll - b.daysSinceEnroll);
  }
}

export class InMemoryTierRepository implements TierRepository {
  private tiers: TierDistributionEntry[] = [
    { tierId: 'bronze', tierName: 'Bronze', memberCount: 500, percentage: 50 },
    { tierId: 'silver', tierName: 'Silver', memberCount: 300, percentage: 30 },
    { tierId: 'gold', tierName: 'Gold', memberCount: 150, percentage: 15 },
    { tierId: 'platinum', tierName: 'Platinum', memberCount: 50, percentage: 5 },
  ];

  setDistribution(tiers: TierDistributionEntry[]): void {
    this.tiers = tiers;
  }

  async getDistribution(_tenantId: string): Promise<TierDistributionEntry[]> {
    return [...this.tiers];
  }
}

export class InMemoryExportRepository implements ExportRepository {
  private data: Record<string, Record<string, unknown>[]> = {
    members: [
      { id: 'm-1', firstName: 'Alice', lastName: 'Smith', status: 'active', tierId: 'silver', pointsBalance: 500, enrolledAt: '2025-01-15' },
      { id: 'm-2', firstName: 'Bob', lastName: 'Jones', status: 'active', tierId: 'bronze', pointsBalance: 120, enrolledAt: '2025-03-20' },
    ],
    transactions: [
      { id: 't-1', memberId: 'm-1', amountCents: 5000, channel: 'pos', createdAt: '2025-06-01' },
      { id: 't-2', memberId: 'm-2', amountCents: 2500, channel: 'ecommerce', createdAt: '2025-06-02' },
    ],
    ledger: [
      { id: 'l-1', memberId: 'm-1', delta: 50, balanceAfter: 500, reason: 'earn', createdAt: '2025-06-01' },
      { id: 'l-2', memberId: 'm-2', delta: 25, balanceAfter: 120, reason: 'earn', createdAt: '2025-06-02' },
    ],
    redemptions: [
      { id: 'r-1', memberId: 'm-1', offerId: 'offer-1', pointsUsed: 100, redeemedAt: '2025-06-05' },
    ],
  };

  setData(entity: string, rows: Record<string, unknown>[]): void {
    this.data[entity] = rows;
  }

  async *stream(_tenantId: string, query: ExportQuery): AsyncIterable<Record<string, unknown>> {
    const rows = this.data[query.entity] ?? [];
    let count = 0;
    const limit = query.limit ?? Infinity;
    for (const row of rows) {
      if (query.since && (row.createdAt as string) < query.since && (row.enrolledAt as string) < query.since && (row.redeemedAt as string) < query.since) continue;
      if (count >= limit) break;
      yield row;
      count++;
    }
  }
}

export class InMemoryRealtimeRepository implements RealtimeRepository {
  private counters: Map<string, number> = new Map();

  private key(tenantId: string, date: string, metric: string): string {
    return `${tenantId}:${date}:${metric}`;
  }

  async getKpis(tenantId: string, date: string): Promise<{
    activeMembersToday: number;
    transactionsToday: number;
    pointsIssuedToday: number;
    redemptionsToday: number;
  }> {
    return {
      activeMembersToday: this.counters.get(this.key(tenantId, date, 'active_members')) ?? 0,
      transactionsToday: this.counters.get(this.key(tenantId, date, 'transactions')) ?? 0,
      pointsIssuedToday: this.counters.get(this.key(tenantId, date, 'points_issued')) ?? 0,
      redemptionsToday: this.counters.get(this.key(tenantId, date, 'redemptions')) ?? 0,
    };
  }

  async incrementCounter(tenantId: string, date: string, metric: string, delta: number): Promise<void> {
    const k = this.key(tenantId, date, metric);
    this.counters.set(k, (this.counters.get(k) ?? 0) + delta);
  }

  /** Exposed for tests */
  getCounter(tenantId: string, date: string, metric: string): number {
    return this.counters.get(this.key(tenantId, date, metric)) ?? 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function mergeDimensions(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return { ...incoming };
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === 'number' && typeof merged[k] === 'number') {
      (merged as Record<string, number>)[k] = (merged[k] as number) + v;
    } else {
      merged[k] = v;
    }
  }
  return merged;
}
