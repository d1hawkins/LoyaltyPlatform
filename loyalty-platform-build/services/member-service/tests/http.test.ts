import request from 'supertest';
import { createApp } from '../src/index';
import { InMemoryMemberRepository } from '../src/repository.memory';
import { NoopEventPublisher } from '../src/events';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = 'user-1';
const authHeaders = { 'x-tenant-id': TENANT, 'x-user-id': USER };

describe('Member HTTP API (in-memory)', () => {
  const makeApp = () => {
    const repo = new InMemoryMemberRepository();
    const publisher = new NoopEventPublisher();
    const { app } = createApp({ repo, publisher, skipAuth: true });
    return { app, repo, publisher };
  };

  it('rejects unauthenticated requests (no headers) when skipAuth=true', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/v1/members').send({});
    expect(res.status).toBe(401);
  });

  it('enrolls a new member and publishes member.enrolled', async () => {
    const { app, publisher } = makeApp();
    const res = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        email: 'alice@example.com',
        phone: '+14155551212',
        firstName: 'Alice',
        lastName: 'Anderson',
        enrolledChannel: 'pos',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.email).toBe('alice@example.com');
    expect(res.body.phone).toBe('+14155551212');
    expect(res.body.tierName).toBe('Bronze');
    expect(res.body.pointsBalance).toBe(0);
    expect(publisher.published.some((p) => p.eventType === 'member.enrolled')).toBe(true);
  });

  it('returns 409 DUPLICATE_MEMBER on duplicate phone', async () => {
    const { app } = makeApp();
    const body = {
      phone: '+14155550000',
      firstName: 'A',
      lastName: 'B',
      enrolledChannel: 'pos',
    };
    await request(app).post('/v1/members').set(authHeaders).send(body).expect(201);
    const res = await request(app).post('/v1/members').set(authHeaders).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_MEMBER');
    expect(res.body.existingMemberId).toBeDefined();
  });

  it('gets a member by id (balance cached on subsequent call)', async () => {
    const { app } = makeApp();
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155551111',
        firstName: 'C',
        lastName: 'D',
        enrolledChannel: 'ecommerce',
      })
      .expect(201);
    const id = enroll.body.id;
    const res = await request(app).get(`/v1/members/${id}`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.pointsBalance).toBe(0);
  });

  it('looks up by phone and returns summary with empty eligible offers', async () => {
    const { app } = makeApp();
    await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155552222',
        firstName: 'Eve',
        lastName: 'F',
        enrolledChannel: 'mobile',
      })
      .expect(201);
    const res = await request(app)
      .get('/v1/members')
      .query({ phone: '+14155552222' })
      .set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Eve');
    expect(res.body.eligibleOffers).toEqual([]);
    expect(res.body.tierName).toBe('Bronze');
  });

  it('looks up by email', async () => {
    const { app } = makeApp();
    await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        email: 'bob@example.com',
        phone: '+14155553333',
        firstName: 'Bob',
        lastName: 'G',
        enrolledChannel: 'pos',
      })
      .expect(201);
    const res = await request(app)
      .get('/v1/members')
      .query({ email: 'bob@example.com' })
      .set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Bob');
  });

  it('returns 404 MEMBER_NOT_FOUND for unknown member', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get('/v1/members/99999999-9999-9999-9999-999999999999')
      .set(authHeaders);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEMBER_NOT_FOUND');
  });

  it('PATCHes a member, re-hashing and emitting member.updated', async () => {
    const { app, publisher } = makeApp();
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155554444',
        firstName: 'H',
        lastName: 'I',
        enrolledChannel: 'pos',
      })
      .expect(201);
    const res = await request(app)
      .patch(`/v1/members/${enroll.body.id}`)
      .set(authHeaders)
      .send({ firstName: 'Henry', email: 'henry@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Henry');
    expect(res.body.email).toBe('henry@example.com');
    expect(publisher.published.some((p) => p.eventType === 'member.updated')).toBe(true);
  });

  it('rejects invalid status transition (closed -> active) with 422', async () => {
    const { app } = makeApp();
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155555555',
        firstName: 'J',
        lastName: 'K',
        enrolledChannel: 'pos',
      })
      .expect(201);
    // suspend
    await request(app)
      .post(`/v1/members/${enroll.body.id}/status`)
      .set(authHeaders)
      .send({ status: 'suspended', reason: 'test' })
      .expect(200);
    // close (terminal)
    await request(app)
      .post(`/v1/members/${enroll.body.id}/status`)
      .set(authHeaders)
      .send({ status: 'closed', reason: 'gdpr' })
      .expect(200);
    // after closed, member soft-deleted → further reads return 404
    const res = await request(app).get(`/v1/members/${enroll.body.id}`).set(authHeaders);
    expect(res.status).toBe(404);
  });

  it('DELETE soft-deletes and publishes member.deleted', async () => {
    const { app, publisher } = makeApp();
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155556666',
        firstName: 'L',
        lastName: 'M',
        enrolledChannel: 'pos',
      })
      .expect(201);
    const res = await request(app)
      .delete(`/v1/members/${enroll.body.id}`)
      .set(authHeaders);
    expect(res.status).toBe(204);
    expect(publisher.published.some((p) => p.eventType === 'member.deleted')).toBe(true);
  });

  it('exports GDPR data', async () => {
    const { app } = makeApp();
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155557777',
        firstName: 'N',
        lastName: 'O',
        enrolledChannel: 'pos',
      })
      .expect(201);
    const res = await request(app)
      .get(`/v1/members/${enroll.body.id}/export`)
      .set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(enroll.body.id);
    expect(res.body.ledgerSummary.count).toBe(0);
  });

  it('paginates ledger entries', async () => {
    const repo = new InMemoryMemberRepository();
    const { app } = createApp({ repo, skipAuth: true });
    const enroll = await request(app)
      .post('/v1/members')
      .set(authHeaders)
      .send({
        phone: '+14155558888',
        firstName: 'P',
        lastName: 'Q',
        enrolledChannel: 'pos',
      })
      .expect(201);
    for (let i = 0; i < 5; i++) {
      repo.seedLedger(TENANT, enroll.body.id, {
        id: `ledger-${String(i).padStart(4, '0')}`,
        memberId: enroll.body.id,
        delta: 10,
        balanceAfter: (i + 1) * 10,
        reason: 'earn',
        createdAt: new Date().toISOString(),
      });
    }
    const page1 = await request(app)
      .get(`/v1/members/${enroll.body.id}/ledger`)
      .query({ limit: 2 })
      .set(authHeaders);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeDefined();
    const page2 = await request(app)
      .get(`/v1/members/${enroll.body.id}/ledger`)
      .query({ limit: 2, after: page1.body.nextCursor })
      .set(authHeaders);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });
});
