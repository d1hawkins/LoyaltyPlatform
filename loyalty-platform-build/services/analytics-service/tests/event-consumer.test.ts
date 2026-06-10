import { AnalyticsEventConsumer } from '../src/event-consumer';
import { InMemorySummaryRepository, InMemoryRealtimeRepository } from '../src/repositories';
import { createLogger } from '@loyalty/shared-logger';

describe('event-consumer', () => {
  let summaryRepo: InMemorySummaryRepository;
  let realtimeRepo: InMemoryRealtimeRepository;
  let consumer: AnalyticsEventConsumer;

  beforeEach(() => {
    summaryRepo = new InMemorySummaryRepository();
    realtimeRepo = new InMemoryRealtimeRepository();
    const logger = createLogger('test');
    consumer = new AnalyticsEventConsumer({ summaryRepo, realtimeRepo, logger });
  });

  describe('handlePointsEarned', () => {
    it('increments points_issued and transactions for earn events', async () => {
      await consumer.handlePointsEarned({
        tenantId: 't1',
        timestamp: '2025-06-01T10:00:00Z',
        payload: { memberId: 'm1', transactionId: 'tx1', points: 50, channel: 'pos' },
      });

      const rows = await summaryRepo.query('t1', '2025-06-01', '2025-06-01');
      const pointsRow = rows.find((r) => r.metricKey === 'points_issued');
      const txRow = rows.find((r) => r.metricKey === 'transactions');

      expect(pointsRow!.metricValue).toBe(50);
      expect(txRow!.metricValue).toBe(1);
      expect(realtimeRepo.getCounter('t1', '2025-06-01', 'points_issued')).toBe(50);
      expect(realtimeRepo.getCounter('t1', '2025-06-01', 'transactions')).toBe(1);
    });

    it('increments only points_issued for adjustments (no transactionId)', async () => {
      await consumer.handlePointsEarned({
        tenantId: 't1',
        timestamp: '2025-06-01T10:00:00Z',
        payload: { memberId: 'm1', points: 100 },
      });

      const rows = await summaryRepo.query('t1', '2025-06-01', '2025-06-01');
      expect(rows.find((r) => r.metricKey === 'points_issued')!.metricValue).toBe(100);
      expect(rows.find((r) => r.metricKey === 'transactions')).toBeUndefined();
    });

    it('accumulates multiple events', async () => {
      await consumer.handlePointsEarned({
        tenantId: 't1',
        timestamp: '2025-06-01T10:00:00Z',
        payload: { memberId: 'm1', transactionId: 'tx1', points: 50 },
      });
      await consumer.handlePointsEarned({
        tenantId: 't1',
        timestamp: '2025-06-01T11:00:00Z',
        payload: { memberId: 'm2', transactionId: 'tx2', points: 30 },
      });

      const rows = await summaryRepo.query('t1', '2025-06-01', '2025-06-01');
      expect(rows.find((r) => r.metricKey === 'points_issued')!.metricValue).toBe(80);
      expect(rows.find((r) => r.metricKey === 'transactions')!.metricValue).toBe(2);
    });
  });

  describe('handlePointsRedeemed', () => {
    it('increments points_redeemed and redemptions', async () => {
      await consumer.handlePointsRedeemed({
        tenantId: 't1',
        timestamp: '2025-06-01T10:00:00Z',
        payload: { memberId: 'm1', points: 200 },
      });

      const rows = await summaryRepo.query('t1', '2025-06-01', '2025-06-01');
      expect(rows.find((r) => r.metricKey === 'points_redeemed')!.metricValue).toBe(200);
      expect(rows.find((r) => r.metricKey === 'redemptions')!.metricValue).toBe(1);
      expect(realtimeRepo.getCounter('t1', '2025-06-01', 'redemptions')).toBe(1);
    });
  });

  describe('handleMemberEnrolled', () => {
    it('increments enrollments with channel dimension', async () => {
      await consumer.handleMemberEnrolled({
        tenantId: 't1',
        timestamp: '2025-06-01T10:00:00Z',
        payload: { memberId: 'm1', channel: 'pos' },
      });

      const rows = await summaryRepo.query('t1', '2025-06-01', '2025-06-01');
      const enrollRow = rows.find((r) => r.metricKey === 'enrollments');
      expect(enrollRow!.metricValue).toBe(1);
      expect(enrollRow!.dimensionsJson).toEqual({ pos: 1 });
    });
  });

  describe('handleTierUpgraded / handleTierDowngraded', () => {
    it('handles tier events without error', async () => {
      await expect(
        consumer.handleTierUpgraded({
          tenantId: 't1',
          timestamp: '2025-06-01T10:00:00Z',
          payload: { memberId: 'm1', fromTierId: 'bronze', toTierId: 'silver' },
        }),
      ).resolves.toBeUndefined();

      await expect(
        consumer.handleTierDowngraded({
          tenantId: 't1',
          timestamp: '2025-06-01T10:00:00Z',
          payload: { memberId: 'm1', fromTierId: 'silver', toTierId: 'bronze' },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
