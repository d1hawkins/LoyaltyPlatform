import { buildCohortMatrix, computeRetention, RETENTION_INTERVALS } from '../src/cohort-builder';
import { CohortRow } from '../src/types';

describe('cohort-builder', () => {
  describe('buildCohortMatrix', () => {
    it('groups rows by cohort month and sorts', () => {
      const rows: CohortRow[] = [
        { cohortMonth: '2025-01-01', daysSinceEnroll: 30, activeCount: 80, totalCount: 100, retentionRate: 0.8, updatedAt: '' },
        { cohortMonth: '2025-01-01', daysSinceEnroll: 60, activeCount: 60, totalCount: 100, retentionRate: 0.6, updatedAt: '' },
        { cohortMonth: '2025-02-01', daysSinceEnroll: 30, activeCount: 90, totalCount: 120, retentionRate: 0.75, updatedAt: '' },
      ];

      const matrix = buildCohortMatrix(rows);
      expect(matrix).toHaveLength(2);
      expect(matrix[0]!.cohortMonth).toBe('2025-01-01');
      expect(matrix[0]!.totalMembers).toBe(100);
      expect(matrix[0]!.intervals).toHaveLength(2);
      expect(matrix[0]!.intervals[0]!.daysSinceEnroll).toBe(30);
      expect(matrix[0]!.intervals[1]!.daysSinceEnroll).toBe(60);
      expect(matrix[1]!.cohortMonth).toBe('2025-02-01');
      expect(matrix[1]!.totalMembers).toBe(120);
    });

    it('handles empty input', () => {
      const matrix = buildCohortMatrix([]);
      expect(matrix).toHaveLength(0);
    });
  });

  describe('computeRetention', () => {
    it('computes retention rates for standard intervals', () => {
      const activeMap = new Map<number, number>();
      activeMap.set(30, 80);
      activeMap.set(60, 60);
      activeMap.set(90, 50);
      activeMap.set(180, 30);
      activeMap.set(365, 20);

      const intervals = computeRetention(100, activeMap);
      expect(intervals).toHaveLength(5);
      expect(intervals[0]!.daysSinceEnroll).toBe(30);
      expect(intervals[0]!.retentionRate).toBe(0.8);
      expect(intervals[4]!.daysSinceEnroll).toBe(365);
      expect(intervals[4]!.retentionRate).toBe(0.2);
    });

    it('returns null rate for zero total enrolled', () => {
      const intervals = computeRetention(0, new Map());
      expect(intervals[0]!.retentionRate).toBeNull();
    });

    it('returns zero for missing intervals', () => {
      const activeMap = new Map<number, number>();
      activeMap.set(30, 50);
      // no data for 60, 90, 180, 365

      const intervals = computeRetention(100, activeMap);
      expect(intervals[0]!.activeCount).toBe(50);
      expect(intervals[1]!.activeCount).toBe(0);
      expect(intervals[1]!.retentionRate).toBe(0);
    });
  });

  describe('RETENTION_INTERVALS', () => {
    it('contains standard intervals', () => {
      expect(RETENTION_INTERVALS).toEqual([30, 60, 90, 180, 365]);
    });
  });
});
