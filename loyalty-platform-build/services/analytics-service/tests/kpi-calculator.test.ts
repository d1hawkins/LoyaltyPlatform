import { computeDerivedKpis, todayUtc } from '../src/kpi-calculator';
import { DailySummaryRow } from '../src/types';

describe('kpi-calculator', () => {
  const now = new Date().toISOString();

  function row(date: string, key: string, value: number): DailySummaryRow {
    return {
      summaryDate: date,
      metricKey: key,
      metricValue: value,
      dimensionsJson: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  describe('computeDerivedKpis', () => {
    it('computes all derived KPIs from summary rows', () => {
      const rows = [
        row('2025-06-01', 'transactions', 100),
        row('2025-06-01', 'total_spend', 500000),
        row('2025-06-01', 'points_issued', 5000),
        row('2025-06-01', 'redemptions', 20),
        row('2025-06-01', 'enrollments', 50),
        row('2025-06-01', 'active_members', 1000),
      ];

      const kpis = computeDerivedKpis(rows);

      expect(kpis.avgTransactionValue).toBe(5000); // 500000/100
      expect(kpis.pointsPerTransaction).toBe(50); // 5000/100
      expect(kpis.redemptionRate).toBe(0.2); // 20/100
      expect(kpis.enrollmentGrowthRate).toBe(0.05); // 50/1000
      expect(kpis.activeRate).toBe(20); // 1000/1/50
    });

    it('handles zero transactions', () => {
      const rows = [
        row('2025-06-01', 'enrollments', 10),
      ];

      const kpis = computeDerivedKpis(rows);

      expect(kpis.avgTransactionValue).toBe(0);
      expect(kpis.pointsPerTransaction).toBe(0);
      expect(kpis.redemptionRate).toBe(0);
    });

    it('handles empty input', () => {
      const kpis = computeDerivedKpis([]);

      expect(kpis.avgTransactionValue).toBe(0);
      expect(kpis.pointsPerTransaction).toBe(0);
      expect(kpis.redemptionRate).toBe(0);
      expect(kpis.enrollmentGrowthRate).toBe(0);
      expect(kpis.activeRate).toBe(0);
    });

    it('handles multi-day summaries', () => {
      const rows = [
        row('2025-06-01', 'transactions', 50),
        row('2025-06-02', 'transactions', 50),
        row('2025-06-01', 'total_spend', 250000),
        row('2025-06-02', 'total_spend', 250000),
        row('2025-06-01', 'points_issued', 2500),
        row('2025-06-02', 'points_issued', 2500),
      ];

      const kpis = computeDerivedKpis(rows);

      expect(kpis.avgTransactionValue).toBe(5000);
      expect(kpis.pointsPerTransaction).toBe(50);
    });
  });

  describe('todayUtc', () => {
    it('returns a valid YYYY-MM-DD string', () => {
      const today = todayUtc();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
