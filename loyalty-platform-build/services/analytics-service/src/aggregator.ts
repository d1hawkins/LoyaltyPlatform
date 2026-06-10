/**
 * Analytics Service — Summary aggregation logic
 *
 * Provides functions to aggregate daily summaries from raw data,
 * and to group time-series data by day/week/month.
 */

import {
  DailySummaryRow,
  MetricKey,
  GroupBy,
  EnrollmentTrendEntry,
  TransactionTrendEntry,
  PointsEconomySummary,
} from './types';

/**
 * Groups daily summary rows into time buckets based on groupBy parameter.
 */
export function groupSummaries(
  rows: DailySummaryRow[],
  groupBy: GroupBy,
): Map<string, DailySummaryRow[]> {
  const groups = new Map<string, DailySummaryRow[]>();
  for (const row of rows) {
    const bucket = dateToBucket(row.summaryDate, groupBy);
    const arr = groups.get(bucket) ?? [];
    arr.push(row);
    groups.set(bucket, arr);
  }
  return groups;
}

/**
 * Maps a YYYY-MM-DD date to a period bucket string.
 */
export function dateToBucket(date: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return date;
  const d = new Date(date + 'T00:00:00Z');
  if (groupBy === 'week') {
    // ISO week: Monday-based. Return the Monday of that week.
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    return monday.toISOString().slice(0, 10);
  }
  // month
  return date.slice(0, 7);
}

/**
 * Aggregates daily summary rows into enrollment trend entries.
 */
export function buildEnrollmentTrend(
  rows: DailySummaryRow[],
  groupBy: GroupBy,
): EnrollmentTrendEntry[] {
  const enrollmentRows = rows.filter((r) => r.metricKey === 'enrollments');
  const groups = groupSummaries(enrollmentRows, groupBy);
  const result: EnrollmentTrendEntry[] = [];

  for (const [period, periodRows] of groups) {
    let total = 0;
    const channels: Record<string, number> = {};
    for (const row of periodRows) {
      total += row.metricValue;
      if (row.dimensionsJson && typeof row.dimensionsJson === 'object') {
        for (const [ch, val] of Object.entries(row.dimensionsJson)) {
          if (typeof val === 'number') {
            channels[ch] = (channels[ch] ?? 0) + val;
          }
        }
      }
    }
    result.push({ period, enrollments: total, channels });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Aggregates daily summary rows into transaction trend entries.
 */
export function buildTransactionTrend(
  rows: DailySummaryRow[],
  groupBy: GroupBy,
): TransactionTrendEntry[] {
  const groups = groupSummaries(
    rows.filter((r) => ['transactions', 'total_spend', 'points_issued'].includes(r.metricKey)),
    groupBy,
  );
  const result: TransactionTrendEntry[] = [];

  for (const [period, periodRows] of groups) {
    let count = 0;
    let totalSpendCents = 0;
    let pointsIssued = 0;
    const channels: Record<string, number> = {};

    for (const row of periodRows) {
      if (row.metricKey === 'transactions') {
        count += row.metricValue;
        if (row.dimensionsJson && typeof row.dimensionsJson === 'object') {
          for (const [ch, val] of Object.entries(row.dimensionsJson)) {
            if (typeof val === 'number') {
              channels[ch] = (channels[ch] ?? 0) + val;
            }
          }
        }
      } else if (row.metricKey === 'total_spend') {
        totalSpendCents += row.metricValue;
      } else if (row.metricKey === 'points_issued') {
        pointsIssued += row.metricValue;
      }
    }

    const avgBasketCents = count > 0 ? Math.round(totalSpendCents / count) : 0;
    const pointsPerTxn = count > 0 ? Math.round((pointsIssued / count) * 100) / 100 : 0;

    result.push({ period, count, totalSpendCents, avgBasketCents, pointsPerTxn, channels });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Computes points economy summary from daily summary rows.
 */
export function buildPointsEconomy(
  rows: DailySummaryRow[],
  from: string,
  to: string,
  avgRedemptionValueCents: number = 1, // default 1 cent per point
): PointsEconomySummary {
  let totalIssued = 0;
  let totalRedeemed = 0;
  let totalExpired = 0;

  for (const row of rows) {
    if (row.summaryDate < from || row.summaryDate > to) continue;
    switch (row.metricKey) {
      case 'points_issued':
        totalIssued += row.metricValue;
        break;
      case 'points_redeemed':
        totalRedeemed += row.metricValue;
        break;
      case 'points_expired':
        totalExpired += row.metricValue;
        break;
    }
  }

  const netOutstanding = totalIssued - totalRedeemed - totalExpired;
  const liabilityEstimate = Math.round(netOutstanding * avgRedemptionValueCents);

  return {
    from,
    to,
    totalIssued,
    totalRedeemed,
    totalExpired,
    netOutstanding,
    liabilityEstimate,
  };
}

/**
 * Returns all valid metric keys.
 */
export function isValidMetricKey(key: string): key is MetricKey {
  return [
    'enrollments',
    'transactions',
    'total_spend',
    'points_issued',
    'points_redeemed',
    'points_expired',
    'redemptions',
    'active_members',
  ].includes(key);
}
