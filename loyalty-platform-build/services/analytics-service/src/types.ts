/**
 * Analytics Service — Domain types
 *
 * Decision log: The task spec originally designated Python for this service,
 * but A-02 created Node/TypeScript scaffolds for all services.
 * Sticking with Node/TypeScript for consistency across the platform.
 */

export interface DailySummaryRow {
  summaryDate: string; // YYYY-MM-DD
  metricKey: string;
  metricValue: number;
  dimensionsJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CohortRow {
  cohortMonth: string; // YYYY-MM-01
  daysSinceEnroll: number;
  activeCount: number;
  totalCount: number;
  retentionRate: number | null; // computed
  updatedAt: string;
}

export type MetricKey =
  | 'enrollments'
  | 'transactions'
  | 'total_spend'
  | 'points_issued'
  | 'points_redeemed'
  | 'points_expired'
  | 'redemptions'
  | 'active_members';

export type GroupBy = 'day' | 'week' | 'month';

export interface SummaryQuery {
  from: string;
  to: string;
  metrics?: MetricKey[];
}

export interface TimeSeriesQuery {
  from: string;
  to: string;
  groupBy: GroupBy;
}

export interface ExportQuery {
  entity: 'members' | 'transactions' | 'ledger' | 'redemptions';
  format: 'csv' | 'json';
  since?: string;
  limit?: number;
}

export interface TierDistributionEntry {
  tierId: string;
  tierName: string;
  memberCount: number;
  percentage: number;
}

export interface PointsEconomySummary {
  from: string;
  to: string;
  totalIssued: number;
  totalRedeemed: number;
  totalExpired: number;
  netOutstanding: number;
  liabilityEstimate: number; // outstanding * avg redemption value cents
}

export interface RealtimeKpis {
  activeMembersToday: number;
  transactionsToday: number;
  pointsIssuedToday: number;
  redemptionsToday: number;
  asOf: string;
}

export interface EnrollmentTrendEntry {
  period: string;
  enrollments: number;
  channels: Record<string, number>;
}

export interface TransactionTrendEntry {
  period: string;
  count: number;
  totalSpendCents: number;
  avgBasketCents: number;
  pointsPerTxn: number;
  channels: Record<string, number>;
}
