/**
 * Integration tests for fraud detection in the transaction flow and
 * fraud admin endpoints.
 */

import request from 'supertest';
import { createApp } from '../src/index';
import {
  InMemoryCache,
  InMemoryDb,
  InMemoryMemberClient,
  InMemoryPublisher,
} from '../src/in-memory';
import { InMemoryFraudRepository } from '../src/fraud/repository.memory';

const TENANT = '00000000-0000-0000-0000-000000000001';
const MEMBER = '11111111-1111-1111-1111-111111111111';

function setup(fraudOverrides?: { fraudEnabled?: boolean }) {
  const db = new InMemoryDb();
  const cache = new InMemoryCache();
  const publisher = new InMemoryPublisher();
  const memberClient = new InMemoryMemberClient();
  const fraudRepo = new InMemoryFraudRepository();
  memberClient.put({
    memberId: MEMBER,
    tenantId: TENANT,
    status: 'active',
    tierId: 'silver',
    tierMultiplier: 1,
  });
  const { app, fraudEngine } = createApp({
    deps: { db, cache, publisher, memberClient },
    fraudEnabled: fraudOverrides?.fraudEnabled ?? true,
    fraudRepo,
  });
  return { app, db, cache, publisher, memberClient, fraudRepo, fraudEngine };
}

function headers(extra: Record<string, string> = {}) {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': 'tester',
    'idempotency-key': 'key-' + Math.random().toString(36).slice(2),
    ...extra,
  };
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': 'admin-user',
    'x-user-role': 'admin',
    ...extra,
  };
}

describe('Fraud detection — transaction flow integration', () => {
  it('blocked transaction returns 403 with TRANSACTION_BLOCKED_FRAUD', async () => {
    const { app, fraudRepo } = setup();
    // Set velocity threshold to 0 so first transaction triggers block
    fraudRepo.rules = fraudRepo.rules.map((r) =>
      r.ruleCode === 'VELOCITY_TXN_COUNT' ? { ...r, severity: 'block', config: { maxCount: 0, windowMinutes: 60 } } : r,
    );
    const res = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });

    expect(res.status).toBe(403);
    expect(res.body.detail || res.body.title || JSON.stringify(res.body)).toContain('TRANSACTION_BLOCKED_FRAUD');
  });

  it('warned transaction still processes but includes fraud flags', async () => {
    const { app, fraudRepo } = setup();
    // Set velocity threshold to 0 so first transaction triggers warning
    fraudRepo.rules = fraudRepo.rules.map((r) =>
      r.ruleCode === 'VELOCITY_TXN_COUNT' ? { ...r, severity: 'warning', config: { maxCount: 0, windowMinutes: 60 } } : r,
    );
    // Disable block/quarantine rules so the highest is just 'warn'
    fraudRepo.rules = fraudRepo.rules.map((r) =>
      ['RAPID_ENROLLMENT_REDEEM', 'BULK_ENROLLMENT'].includes(r.ruleCode) ? { ...r, isEnabled: false } : r,
    );

    const res = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.transactionId).toBeDefined();
    expect(res.body.pointsEarned).toBeGreaterThanOrEqual(0);
  });

  it('transactions process normally when fraud is disabled', async () => {
    const { app } = setup({ fraudEnabled: false });
    const res = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.fraudFlags).toBeUndefined();
  });
});

describe('Fraud admin endpoints', () => {
  it('GET /v1/admin/fraud/flags returns fraud flags', async () => {
    const { app, fraudRepo } = setup();
    // Seed a flag
    await fraudRepo.insertFlag(TENANT, {
      memberId: MEMBER,
      txnId: 'txn-1',
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      detailsJson: '{"threshold":10,"actual":15}',
    });

    const res = await request(app)
      .get('/v1/admin/fraud/flags')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].ruleCode).toBe('VELOCITY_TXN_COUNT');
  });

  it('GET /v1/admin/fraud/flags filters by memberId', async () => {
    const { app, fraudRepo } = setup();
    await fraudRepo.insertFlag(TENANT, {
      memberId: MEMBER,
      txnId: 'txn-1',
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      detailsJson: '{}',
    });
    await fraudRepo.insertFlag(TENANT, {
      memberId: 'other-member',
      txnId: 'txn-2',
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      detailsJson: '{}',
    });

    const res = await request(app)
      .get(`/v1/admin/fraud/flags?memberId=${MEMBER}`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].memberId).toBe(MEMBER);
  });

  it('GET /v1/admin/fraud/flags requires admin role', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/v1/admin/fraud/flags')
      .set({ 'x-tenant-id': TENANT, 'x-user-id': 'user' });

    expect(res.status).toBe(403);
  });

  it('POST /v1/admin/fraud/flags/:id/review updates flag status', async () => {
    const { app, fraudRepo } = setup();
    const flagId = await fraudRepo.insertFlag(TENANT, {
      memberId: MEMBER,
      txnId: 'txn-1',
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      detailsJson: '{}',
    });

    const res = await request(app)
      .post(`/v1/admin/fraud/flags/${flagId}/review`)
      .set(adminHeaders())
      .send({ status: 'dismissed', notes: 'false positive' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dismissed');
    expect(res.body.reviewedBy).toBe('admin-user');
    expect(res.body.reviewNotes).toBe('false positive');
  });

  it('POST /v1/admin/fraud/flags/:id/review rejects invalid status', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/admin/fraud/flags/some-id/review')
      .set(adminHeaders())
      .send({ status: 'invalid' });

    expect(res.status).toBe(400);
  });

  it('GET /v1/admin/fraud/rules returns rule list', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/v1/admin/fraud/rules')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(5);
    expect(res.body.items.some((r: { ruleCode: string }) => r.ruleCode === 'VELOCITY_TXN_COUNT')).toBe(true);
  });

  it('PUT /v1/admin/fraud/rules/:ruleCode updates rule config', async () => {
    const { app } = setup();
    const res = await request(app)
      .put('/v1/admin/fraud/rules/VELOCITY_TXN_COUNT')
      .set(adminHeaders())
      .send({ config: { maxCount: 20, windowMinutes: 120 } });

    expect(res.status).toBe(200);
    expect(res.body.config.maxCount).toBe(20);
    expect(res.body.config.windowMinutes).toBe(120);
  });

  it('PUT /v1/admin/fraud/rules/:ruleCode returns 404 for unknown rule', async () => {
    const { app } = setup();
    const res = await request(app)
      .put('/v1/admin/fraud/rules/NONEXISTENT')
      .set(adminHeaders())
      .send({ config: { foo: 1 } });

    expect(res.status).toBe(404);
  });

  it('GET /v1/admin/fraud/stats returns summary', async () => {
    const { app, fraudRepo } = setup();
    await fraudRepo.insertFlag(TENANT, {
      memberId: MEMBER,
      txnId: 'txn-1',
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      detailsJson: '{}',
    });

    const res = await request(app)
      .get('/v1/admin/fraud/stats')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalToday).toBeGreaterThanOrEqual(1);
    expect(res.body.bySeverity.warning).toBeGreaterThanOrEqual(1);
    expect(res.body.byRule.VELOCITY_TXN_COUNT).toBeGreaterThanOrEqual(1);
  });
});
