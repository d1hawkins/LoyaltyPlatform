import request from 'supertest';
import { createApp } from '../src/index';
import {
  InMemorySummaryRepository,
  InMemoryCohortRepository,
  InMemoryTierRepository,
  InMemoryExportRepository,
  InMemoryRealtimeRepository,
} from '../src/repositories';

describe('analytics routes (integration)', () => {
  const TENANT_ID = 'test-tenant-1';
  const HEADERS = { 'x-tenant-id': TENANT_ID, 'x-user-id': 'user-1' };

  let summaryRepo: InMemorySummaryRepository;
  let cohortRepo: InMemoryCohortRepository;
  let tierRepo: InMemoryTierRepository;
  let exportRepo: InMemoryExportRepository;
  let realtimeRepo: InMemoryRealtimeRepository;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(async () => {
    summaryRepo = new InMemorySummaryRepository();
    cohortRepo = new InMemoryCohortRepository();
    tierRepo = new InMemoryTierRepository();
    exportRepo = new InMemoryExportRepository();
    realtimeRepo = new InMemoryRealtimeRepository();

    const result = createApp({
      summaryRepo,
      cohortRepo,
      tierRepo,
      exportRepo,
      realtimeRepo,
    });
    app = result.app;

    // Seed summary data
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'enrollments', metricValue: 10, dimensionsJson: { pos: 6, mobile: 4 } });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-02', metricKey: 'enrollments', metricValue: 8, dimensionsJson: { pos: 5, ecommerce: 3 } });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'transactions', metricValue: 50, dimensionsJson: { pos: 30, ecommerce: 20 } });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'total_spend', metricValue: 250000, dimensionsJson: null });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'points_issued', metricValue: 2500, dimensionsJson: null });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'points_redeemed', metricValue: 500, dimensionsJson: null });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'points_expired', metricValue: 100, dimensionsJson: null });
    await summaryRepo.upsert(TENANT_ID, { summaryDate: '2025-06-01', metricKey: 'redemptions', metricValue: 15, dimensionsJson: null });

    // Seed cohort data
    await cohortRepo.upsert(TENANT_ID, { cohortMonth: '2025-01-01', daysSinceEnroll: 30, activeCount: 80, totalCount: 100 });
    await cohortRepo.upsert(TENANT_ID, { cohortMonth: '2025-01-01', daysSinceEnroll: 60, activeCount: 60, totalCount: 100 });
    await cohortRepo.upsert(TENANT_ID, { cohortMonth: '2025-02-01', daysSinceEnroll: 30, activeCount: 90, totalCount: 120 });

    // Seed realtime counters
    const today = new Date().toISOString().slice(0, 10);
    await realtimeRepo.incrementCounter(TENANT_ID, today, 'active_members', 42);
    await realtimeRepo.incrementCounter(TENANT_ID, today, 'transactions', 15);
    await realtimeRepo.incrementCounter(TENANT_ID, today, 'points_issued', 750);
    await realtimeRepo.incrementCounter(TENANT_ID, today, 'redemptions', 3);
  });

  // ── Health ──────────────────────────────────────────────────────────

  it('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('analytics-service');
    expect(res.body.version).toBe('1.0.0');
  });

  it('GET /ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  // ── Summary ─────────────────────────────────────────────────────────

  it('GET /v1/analytics/summary returns filtered summaries', async () => {
    const res = await request(app)
      .get('/v1/analytics/summary?from=2025-06-01&to=2025-06-30&metrics=enrollments,transactions')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2025-06-01');
    expect(res.body.to).toBe('2025-06-30');
    expect(res.body.summaries.length).toBeGreaterThan(0);
    expect(res.body.derived).toBeDefined();
    // Only enrollment and transaction rows
    const metricKeys = res.body.summaries.map((s: any) => s.metricKey);
    expect(metricKeys).toContain('enrollments');
    expect(metricKeys).toContain('transactions');
    expect(metricKeys).not.toContain('points_issued');
  });

  it('GET /v1/analytics/summary rejects invalid metric', async () => {
    const res = await request(app)
      .get('/v1/analytics/summary?from=2025-06-01&to=2025-06-30&metrics=bogus')
      .set(HEADERS);

    expect(res.status).toBe(400);
  });

  it('GET /v1/analytics/summary rejects missing date', async () => {
    const res = await request(app)
      .get('/v1/analytics/summary?from=2025-06-01')
      .set(HEADERS);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ── Enrollment ──────────────────────────────────────────────────────

  it('GET /v1/analytics/enrollment returns trend data', async () => {
    const res = await request(app)
      .get('/v1/analytics/enrollment?from=2025-06-01&to=2025-06-30&groupBy=day')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('day');
    expect(res.body.trend.length).toBeGreaterThan(0);
    expect(res.body.trend[0].enrollments).toBeDefined();
    expect(res.body.trend[0].channels).toBeDefined();
  });

  // ── Transactions ────────────────────────────────────────────────────

  it('GET /v1/analytics/transactions returns trend data', async () => {
    const res = await request(app)
      .get('/v1/analytics/transactions?from=2025-06-01&to=2025-06-30&groupBy=day')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.trend.length).toBeGreaterThan(0);
    expect(res.body.trend[0].count).toBeDefined();
    expect(res.body.trend[0].avgBasketCents).toBeDefined();
    expect(res.body.trend[0].pointsPerTxn).toBeDefined();
  });

  // ── Points economy ──────────────────────────────────────────────────

  it('GET /v1/analytics/points-economy returns economy summary', async () => {
    const res = await request(app)
      .get('/v1/analytics/points-economy?from=2025-06-01&to=2025-06-30')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.totalIssued).toBe(2500);
    expect(res.body.totalRedeemed).toBe(500);
    expect(res.body.totalExpired).toBe(100);
    expect(res.body.netOutstanding).toBe(1900);
  });

  // ── Tier distribution ───────────────────────────────────────────────

  it('GET /v1/analytics/tier-distribution returns tiers', async () => {
    const res = await request(app)
      .get('/v1/analytics/tier-distribution')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.tiers.length).toBe(4);
    expect(res.body.tiers[0].tierId).toBeDefined();
    expect(res.body.tiers[0].memberCount).toBeDefined();
    expect(res.body.tiers[0].percentage).toBeDefined();
  });

  // ── Retention cohort ────────────────────────────────────────────────

  it('GET /v1/analytics/retention-cohort returns cohort matrix', async () => {
    const res = await request(app)
      .get('/v1/analytics/retention-cohort')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.cohorts.length).toBe(2);
    expect(res.body.cohorts[0].cohortMonth).toBe('2025-01-01');
    expect(res.body.cohorts[0].intervals.length).toBe(2);
    expect(res.body.cohorts[0].intervals[0].retentionRate).toBe(0.8);
  });

  // ── Export JSON ─────────────────────────────────────────────────────

  it('GET /v1/analytics/export/members?format=json returns JSON', async () => {
    const res = await request(app)
      .get('/v1/analytics/export/members?format=json')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.entity).toBe('members');
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.items[0].id).toBeDefined();
  });

  // ── Export CSV ──────────────────────────────────────────────────────

  it('GET /v1/analytics/export/transactions?format=csv streams CSV', async () => {
    const res = await request(app)
      .get('/v1/analytics/export/transactions?format=csv')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('transactions-export.csv');
    expect(res.text).toContain('id,memberId,amountCents,channel,createdAt');
  });

  // ── Export unknown entity ───────────────────────────────────────────

  it('GET /v1/analytics/export/unknown returns 404', async () => {
    const res = await request(app)
      .get('/v1/analytics/export/unknown?format=json')
      .set(HEADERS);

    expect(res.status).toBe(404);
  });

  // ── Realtime KPIs ───────────────────────────────────────────────────

  it('GET /v1/analytics/kpi/realtime returns today counters', async () => {
    const res = await request(app)
      .get('/v1/analytics/kpi/realtime')
      .set(HEADERS);

    expect(res.status).toBe(200);
    expect(res.body.activeMembersToday).toBe(42);
    expect(res.body.transactionsToday).toBe(15);
    expect(res.body.pointsIssuedToday).toBe(750);
    expect(res.body.redemptionsToday).toBe(3);
    expect(res.body.asOf).toBeDefined();
  });

  // ── Missing tenant ID ──────────────────────────────────────────────

  it('rejects requests without tenant ID', async () => {
    const res = await request(app)
      .get('/v1/analytics/summary?from=2025-06-01&to=2025-06-30');

    expect(res.status).toBe(400);
  });
});
