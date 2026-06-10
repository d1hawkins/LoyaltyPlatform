/**
 * Analytics Service — Cohort retention builder
 *
 * Builds a retention cohort matrix from the cohort repository data.
 * Each row represents a cohort (members enrolled in a given month),
 * with retention rates at various intervals (30, 60, 90, 180, 365 days).
 */

import { CohortRow } from './types';

export interface CohortMatrixRow {
  cohortMonth: string;
  totalMembers: number;
  intervals: CohortInterval[];
}

export interface CohortInterval {
  daysSinceEnroll: number;
  activeCount: number;
  retentionRate: number | null;
}

/**
 * Transforms raw cohort rows into a cohort matrix grouped by enrollment month.
 */
export function buildCohortMatrix(rows: CohortRow[]): CohortMatrixRow[] {
  const byMonth = new Map<string, CohortRow[]>();

  for (const row of rows) {
    const arr = byMonth.get(row.cohortMonth) ?? [];
    arr.push(row);
    byMonth.set(row.cohortMonth, arr);
  }

  const result: CohortMatrixRow[] = [];

  for (const [month, monthRows] of byMonth) {
    const sorted = monthRows.sort((a, b) => a.daysSinceEnroll - b.daysSinceEnroll);
    const first = sorted[0];
    const totalMembers = first ? first.totalCount : 0;

    const intervals: CohortInterval[] = sorted.map((r) => ({
      daysSinceEnroll: r.daysSinceEnroll,
      activeCount: r.activeCount,
      retentionRate: r.retentionRate,
    }));

    result.push({ cohortMonth: month, totalMembers, intervals });
  }

  return result.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));
}

/**
 * Standard retention intervals in days.
 */
export const RETENTION_INTERVALS = [30, 60, 90, 180, 365];

/**
 * Computes retention data for a single cohort.
 * In production this queries raw member/transaction tables.
 * Here it's a pure function for testability.
 */
export function computeRetention(
  totalEnrolled: number,
  activeAtIntervals: Map<number, number>,
): CohortInterval[] {
  return RETENTION_INTERVALS.map((days) => {
    const active = activeAtIntervals.get(days) ?? 0;
    return {
      daysSinceEnroll: days,
      activeCount: active,
      retentionRate: totalEnrolled > 0
        ? Math.round((active / totalEnrolled) * 10000) / 10000
        : null,
    };
  });
}
