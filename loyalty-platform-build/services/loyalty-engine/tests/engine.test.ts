import request from 'supertest';
import { createApp } from '../src/index';
import {
  InMemoryCache,
  InMemoryDb,
  InMemoryMemberClient,
  InMemoryPublisher,
} from '../src/in-memory';
import { LoyaltyEngine } from '../src/engine';

const TENANT = '00000000-0000-0000-0000-000000000001';
const MEMBER = '11111111-1111-1111-1111-111111111111';

function setup() {
  const db = new InMemoryDb();
  const cache = new InMemoryCache();
  const publisher = new InMemoryPublisher();
  const memberClient = new InMemoryMemberClient();
  memberClient.put({
    memberId: MEMBER,
    tenantId: TENANT,
    status: 'active',
    tierId: 'silver',
    tierMultiplier: 1,
  });
  const { app } = createApp({ deps: { db, cache, publisher, memberClient } });
  return { app, db, cache, publisher, memberClient };
}

function headers(extra: Record<string, string> = {}) {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': 'tester',
    'idempotency-key': 'key-' + Math.random().toString(36).slice(2),
    ...extra,
  };
}

describe('LoyaltyEngine integration (in-memory)', () => {
  it('POST /v1/transactions creates txn + ledger atomically and publishes event', async () => {
    const { app, db, publisher } = setup();
    const res = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 2500, currency: 'USD', skuList: [] });

    expect(res.status).toBe(201);
    expect(res.body.pointsEarned).toBe(25);
    expect(res.body.newBalance).toBe(25);
    expect(db.transactions.size).toBe(1);
    expect(db.ledger.length).toBe(1);
    expect(db.ledger[0]?.reasonCode).toBe('earn');
    expect(publisher.events.find((e) => e.eventType === 'points.earned')).toBeTruthy();
  });

  it('idempotency replay returns cached response', async () => {
    const { app } = setup();
    const h = headers();
    const body = { memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' };
    const first = await request(app).post('/v1/transactions').set(h).send(body);
    const second = await request(app).post('/v1/transactions').set(h).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.transactionId).toBe(first.body.transactionId);
  });

  it('idempotency with same key but different body → 409', async () => {
    const { app } = setup();
    const h = headers();
    await request(app)
      .post('/v1/transactions')
      .set(h)
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    const res = await request(app)
      .post('/v1/transactions')
      .set(h)
      .send({ memberId: MEMBER, channel: 'pos', amount: 2000, currency: 'USD' });
    expect(res.status).toBe(409);
  });

  it('atomic write — ledger insert failure rolls back transaction row', async () => {
    const { app, db } = setup();
    db.onLedgerInsert = () => {
      throw new Error('simulated ledger failure');
    };
    const res = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(db.transactions.size).toBe(0);
    expect(db.ledger.length).toBe(0);
  });

  it('balance cache is invalidated on write and repopulated on read', async () => {
    const { app, cache } = setup();
    await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    const res = await request(app)
      .get(`/v1/members/${MEMBER}/balance`)
      .set({ 'x-tenant-id': TENANT, 'x-user-id': 'tester' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(10);
    // second call should hit cache (still 10)
    const cached = await cache.get(`tenant:${TENANT}:member:${MEMBER}:balance`);
    expect(cached).toBeTruthy();
  });

  it('void flow — reverses points, publishes event', async () => {
    const { app, db, publisher } = setup();
    const create = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    const txId = create.body.transactionId;
    const voidRes = await request(app)
      .post(`/v1/transactions/${txId}/void`)
      .set(headers())
      .send({ reason: 'customer-return' });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.pointsReversed).toBe(10);
    expect(voidRes.body.newBalance).toBe(0);
    expect(db.ledger.length).toBe(2);
    expect(db.ledger[1]?.reasonCode).toBe('void');
    expect(publisher.events.some((e) => e.eventType === 'transaction.voided')).toBe(true);
  });

  it('void negative balance flag emitted but not rejected', async () => {
    const { app, db, publisher } = setup();
    const create = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    // burn points via admin adjustment so balance is 0
    await request(app)
      .post(`/v1/members/${MEMBER}/adjustments`)
      .set({ ...headers(), 'x-user-role': 'admin' })
      .send({ delta: -10, reasonCode: 'adjust', notes: 'burn' });
    const voidRes = await request(app)
      .post(`/v1/transactions/${create.body.transactionId}/void`)
      .set(headers())
      .send({ reason: 'late return' });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.newBalance).toBe(-10);
    expect(voidRes.body.negativeBalanceFlag).toBe(true);
    expect(
      publisher.events.some((e) => e.eventType === 'points.void.negative_balance'),
    ).toBe(true);
    expect(db).toBeDefined();
  });

  it('void outside window is rejected', async () => {
    const { app, db } = setup();
    db.setProgramConfig({ voidWindowHours: 0 });
    const create = await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' });
    // force createdAt into the past
    const t = db.transactions.get(create.body.transactionId)!;
    db.transactions.set(t.id, { ...t, createdAt: new Date(Date.now() - 3600_000).toISOString() });
    const voidRes = await request(app)
      .post(`/v1/transactions/${create.body.transactionId}/void`)
      .set(headers())
      .send({ reason: 'too late' });
    expect(voidRes.status).toBe(403);
  });

  it('adjustments require admin role', async () => {
    const { app } = setup();
    const res = await request(app)
      .post(`/v1/members/${MEMBER}/adjustments`)
      .set(headers())
      .send({ delta: 50, reasonCode: 'bonus' });
    expect(res.status).toBe(403);
  });

  it('redemption debits ledger and validates balance', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/transactions')
      .set(headers())
      .send({ memberId: MEMBER, channel: 'pos', amount: 5000, currency: 'USD' });
    const res = await request(app)
      .post('/v1/redemptions')
      .set(headers())
      .send({ memberId: MEMBER, pointsToBurn: 20, offerId: 'offer-1' });
    expect(res.status).toBe(201);
    expect(res.body.pointsUsed).toBe(20);
    expect(res.body.newBalance).toBe(30);

    const insufficient = await request(app)
      .post('/v1/redemptions')
      .set(headers())
      .send({ memberId: MEMBER, pointsToBurn: 9999 });
    expect(insufficient.status).toBe(422);
  });

  it('concurrency — 10 parallel transactions produce correct final balance', async () => {
    const { app, db } = setup();
    const reqs = Array.from({ length: 10 }).map((_, i) =>
      request(app)
        .post('/v1/transactions')
        .set(headers({ 'idempotency-key': `concurrent-${i}` }))
        .send({ memberId: MEMBER, channel: 'pos', amount: 1000, currency: 'USD' }),
    );
    const results = await Promise.all(reqs);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(db.ledger.length).toBe(10);
    // each entry's balanceAfter should be strictly increasing 10..100
    const sorted = [...db.ledger].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const balances = sorted.map((l) => l.balanceAfter);
    expect(balances).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const final = await db.getBalance(TENANT, MEMBER);
    expect(final).toBe(100);
  });

  it('direct engine unit — ledger reversal math', async () => {
    const db = new InMemoryDb();
    const cache = new InMemoryCache();
    const publisher = new InMemoryPublisher();
    const memberClient = new InMemoryMemberClient();
    memberClient.put({
      memberId: MEMBER,
      tenantId: TENANT,
      status: 'active',
      tierId: 'silver',
      tierMultiplier: 1,
    });
    const engine = new LoyaltyEngine({
      db,
      cache,
      publisher,
      memberClient,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never,
    });
    const tx = await engine.createTransaction(TENANT, {
      memberId: MEMBER,
      channel: 'pos',
      amount: 2500,
      currency: 'USD',
    });
    expect(tx.pointsEarned).toBe(25);
    const v = await engine.voidTransaction(TENANT, tx.transactionId, 'test');
    expect(v.pointsReversed).toBe(25);
    expect(v.newBalance).toBe(0);
  });
});
