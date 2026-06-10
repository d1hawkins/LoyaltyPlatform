import {
  dateToBucket,
  groupSummaries,
  buildEnrollmentTrend,
  buildTransactionTrend,
  buildPointsEconomy,
  isValidMetricKey,
} from '../src/aggregator';
import { DailySummaryRow } from '../src/types';

describe('aggregator', () => {
  const now = new Date().toISOString();

  function row(date: string, key: string, value: number, dims?: Record<string, unknown>): DailySummaryRow {
    return {
      summaryDate: date,
      metricKey: key,
      metricValue: value,
      dimensionsJson: dims ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  describe('dateToBucket', () => {
    it('returns date as-is for day grouping', () => {
      expect(dateToBucket('2025-06-15', 'day')).toBe('2025-06-15');
    });

    it('returns Monday for week grouping', () => {
      // 2025-06-15 is a Sunday
      expect(dateToBucket('2025-06-15', 'week')).toBe('2025-06-09');
      // 2025-06-09 is a Monday
      expect(dateToBucket('2025-06-09', 'week')).toBe('2025-06-09');
      // 2025-06-11 is a Wednesday
      expect(dateToBucket('2025-06-11', 'week')).toBe('2025-06-09');
    });

    it('returns YYYY-MM for month grouping', () => {
      expect(dateToBucket('2025-06-15', 'month')).toBe('2025-06');
    });
  });

  describe('groupSummaries', () => {
    it('groups rows by day', () => {
      const rows = [row('2025-06-01', 'enrollments', 5), row('2025-06-01', 'transactions', 10), row('2025-06-02', 'enrollments', 3)];
      const groups = groupSummaries(rows, 'day');
      expect(groups.size).toBe(2);
      expect(groups.get('2025-06-01')!.length).toBe(2);
      expect(groups.get('2025-06-02')!.length).toBe(1);
    });

    it('groups rows by month', () => {
      const rows = [row('2025-06-01', 'enrollments', 5), row('2025-06-15', 'enrollments', 3), row('2025-07-01', 'enrollments', 2)];
      const groups = groupSummaries(rows, 'month');
      expect(groups.size).toBe(2);
      expect(groups.get('2025-06')!.length).toBe(2);
      expect(groups.get('2025-07')!.length).toBe(1);
    });
  });

  describe('buildEnrollmentTrend', () => {
    it('aggregates enrollment counts by period', () => {
      const rows = [
        row('2025-06-01', 'enrollments', 5, { pos: 3, mobile: 2 }),
        row('2025-06-02', 'enrollments', 3, { pos: 1, ecommerce: 2 }),
      ];
      const trend = buildEnrollmentTrend(rows, 'day');
      expect(trend).toHaveLength(2);
      expect(trend[0]!.period).toBe('2025-06-01');
      expect(trend[0]!.enrollments).toBe(5);
      expect(trend[0]!.channels.pos).toBe(3);
    });

    it('merges channels when grouped by month', () => {
      const rows = [
        row('2025-06-01', 'enrollments', 5, { pos: 3 }),
        row('2025-06-15', 'enrollments', 3, { pos: 2, mobile: 1 }),
      ];
      const trend = buildEnrollmentTrend(rows, 'month');
      expect(trend).toHaveLength(1);
      expect(trend[0]!.enrollments).toBe(8);
      expect(trend[0]!.channels.pos).toBe(5);
      expect(trend[0]!.channels.mobile).toBe(1);
    });
  });

  describe('buildTransactionTrend', () => {
    it('computes avg basket and points per txn', () => {
      const rows = [
        row('2025-06-01', 'transactions', 10, { pos: 7, ecommerce: 3 }),
        row('2025-06-01', 'total_spend', 50000),
        row('2025-06-01', 'points_issued', 500),
      ];
      const trend = buildTransactionTrend(rows, 'day');
      expect(trend).toHaveLength(1);
      expect(trend[0]!.count).toBe(10);
      expect(trend[0]!.avgBasketCents).toBe(5000);
      expect(trend[0]!.pointsPerTxn).toBe(50);
      expect(trend[0]!.channels.pos).toBe(7);
    });

    it('handles zero transactions gracefully', () => {
      const rows = [row('2025-06-01', 'total_spend', 0)];
      const trend = buildTransactionTrend(rows, 'day');
      expect(trend).toHaveLength(1);
      expect(trend[0]!.avgBasketCents).toBe(0);
      expect(trend[0]!.pointsPerTxn).toBe(0);
    });
  });

  describe('buildPointsEconomy', () => {
    it('computes net outstanding and liability', () => {
      const rows = [
        row('2025-06-01', 'points_issued', 1000),
        row('2025-06-01', 'points_redeemed', 300),
        row('2025-06-01', 'points_expired', 50),
      ];
      const economy = buildPointsEconomy(rows, '2025-06-01', '2025-06-30');
      expect(economy.totalIssued).toBe(1000);
      expect(economy.totalRedeemed).toBe(300);
      expect(economy.totalExpired).toBe(50);
      expect(economy.netOutstanding).toBe(650);
      expect(economy.liabilityEstimate).toBe(650); // 650 * 1 cent default
    });

    it('applies custom avg redemption value', () => {
      const rows = [
        row('2025-06-01', 'points_issued', 1000),
        row('2025-06-01', 'points_redeemed', 200),
        row('2025-06-01', 'points_expired', 0),
      ];
      const economy = buildPointsEconomy(rows, '2025-06-01', '2025-06-30', 5);
      expect(economy.netOutstanding).toBe(800);
      expect(economy.liabilityEstimate).toBe(4000);
    });
  });

  describe('isValidMetricKey', () => {
    it('returns true for valid keys', () => {
      expect(isValidMetricKey('enrollments')).toBe(true);
      expect(isValidMetricKey('transactions')).toBe(true);
      expect(isValidMetricKey('active_members')).toBe(true);
    });

    it('returns false for invalid keys', () => {
      expect(isValidMetricKey('invalid')).toBe(false);
      expect(isValidMetricKey('')).toBe(false);
    });
  });
});
