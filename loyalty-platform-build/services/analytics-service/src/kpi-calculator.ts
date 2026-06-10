/**
 * Analytics Service — KPI calculator
 *
 * Pure functions for computing derived KPIs from raw metric data.
 */

import { DailySummaryRow } from './types';

export interface DerivedKpis {
  avgTransactionValue: number;
  pointsPerTransaction: number;
  redemptionRate: number; // redemptions / transactions
  enrollmentGrowthRate: number; // % change over period
  activeRate: number; // active_members / total enrollments
}

/**
 * Computes derived KPIs from a set of daily summary rows.
 */
export function computeDerivedKpis(rows: DailySummaryRow[]): DerivedKpis {
  let totalTransactions = 0;
  let totalSpend = 0;
  let totalPointsIssued = 0;
  let totalRedemptions = 0;
  let totalEnrollments = 0;
  let totalActiveMembers = 0;
  let activeMemberDays = 0;

  for (const row of rows) {
    switch (row.metricKey) {
      case 'transactions':
        totalTransactions += row.metricValue;
        break;
      case 'total_spend':
        totalSpend += row.metricValue;
        break;
      case 'points_issued':
        totalPointsIssued += row.metricValue;
        break;
      case 'redemptions':
        totalRedemptions += row.metricValue;
        break;
      case 'enrollments':
        totalEnrollments += row.metricValue;
        break;
      case 'active_members':
        totalActiveMembers += row.metricValue;
        activeMemberDays++;
        break;
    }
  }

  const avgTransactionValue = totalTransactions > 0
    ? Math.round(totalSpend / totalTransactions)
    : 0;

  const pointsPerTransaction = totalTransactions > 0
    ? Math.round((totalPointsIssued / totalTransactions) * 100) / 100
    : 0;

  const redemptionRate = totalTransactions > 0
    ? Math.round((totalRedemptions / totalTransactions) * 10000) / 10000
    : 0;

  // Simplified growth rate: total enrollments in period as % of active members
  const avgActiveMembers = activeMemberDays > 0
    ? totalActiveMembers / activeMemberDays
    : 0;
  const enrollmentGrowthRate = avgActiveMembers > 0
    ? Math.round((totalEnrollments / avgActiveMembers) * 10000) / 10000
    : 0;

  const activeRate = totalEnrollments > 0 && activeMemberDays > 0
    ? Math.round((totalActiveMembers / activeMemberDays / totalEnrollments) * 10000) / 10000
    : 0;

  return {
    avgTransactionValue,
    pointsPerTransaction,
    redemptionRate,
    enrollmentGrowthRate,
    activeRate,
  };
}

/**
 * Returns today's date in YYYY-MM-DD UTC format.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
