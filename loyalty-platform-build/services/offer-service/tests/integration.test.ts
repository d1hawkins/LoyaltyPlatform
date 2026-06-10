import request from 'supertest';
import { createApp } from '../src/index';
import {
  InMemoryOfferDb,
  InMemoryPublisher,
  InMemoryLoyaltyEngineClient,
  InMemoryMemberClient,
} from '../src/in-memory';
import type { MemberInfo } from '../src/deps';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user-1';
const MEMBER_ID = '00000000-0000-0000-0000-000000000010';

function setup() {
  const db = new InMemoryOfferDb();
  const publisher = new InMemoryPublisher();
  const engineClient = new InMemoryLoyaltyEngineClient();
  const memberClient = new InMemoryMemberClient();

  const member: MemberInfo = {
    memberId: MEMBER_ID,
    tenantId: TENANT_ID,
    status: 'active',
    tierId: 'gold',
    pointsBalance: 500,
  };
  memberClient.put(member);
  engineClient.setMember(member);

  const { app, service } = createApp({
    deps: { db, publisher, engineClient, memberClient },
  });

  return { app, service, db, publisher, engineClient, memberClient };
}

function authHeaders() {
  return {
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
    'x-user-role': 'admin',
  };
}

function memberHeaders() {
  return {
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
  };
}

const validOffer = {
  name: 'Summer Sale',
  type: 'percent',
  value: 15,
  validFrom: '2026-01-01T00:00:00Z',
  validTo: '2026-12-31T23:59:59Z',
  perMemberLimit: 2,
};

describe('Offer CRUD', () => {
  it('creates an offer', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    expect(res.status).toBe(201);
    expect(res.body.offerId).toBeDefined();
    expect(res.body.name).toBe('Summer Sale');
    expect(res.body.isActive).toBe(true);
  });

  it('rejects create without admin role', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/offers')
      .set(memberHeaders())
      .send(validOffer);
    expect(res.status).toBe(403);
  });

  it('allows manager role to create offers', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/offers')
      .set({ ...memberHeaders(), 'x-user-role': 'manager' })
      .send(validOffer);
    expect(res.status).toBe(201);
  });

  it('lists offers', async () => {
    const { app } = setup();
    await request(app).post('/v1/offers').set(authHeaders()).send(validOffer);
    await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, name: 'Winter Sale', type: 'fixed', value: 20 });

    const res = await request(app)
      .get('/v1/offers')
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('filters offers by type', async () => {
    const { app } = setup();
    await request(app).post('/v1/offers').set(authHeaders()).send(validOffer);
    await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, name: 'BOGO Deal', type: 'bogo', value: 1 });

    const res = await request(app)
      .get('/v1/offers?type=bogo')
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].type).toBe('bogo');
  });

  it('gets an offer by id', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .get(`/v1/offers/${offerId}`)
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.offerId).toBe(offerId);
  });

  it('returns 404 for unknown offer', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/v1/offers/00000000-0000-0000-0000-999999999999')
      .set(memberHeaders());
    expect(res.status).toBe(404);
  });

  it('updates an offer', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .put(`/v1/offers/${offerId}`)
      .set(authHeaders())
      .send({ name: 'Updated Sale', value: 25 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Sale');
    expect(res.body.value).toBe(25);
  });

  it('deactivates (soft deletes) an offer', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const delRes = await request(app)
      .delete(`/v1/offers/${offerId}`)
      .set(authHeaders());
    expect(delRes.status).toBe(204);

    // Verify deactivated
    const getRes = await request(app)
      .get(`/v1/offers/${offerId}`)
      .set(memberHeaders());
    expect(getRes.body.isActive).toBe(false);
  });
});

describe('Eligible offers for member', () => {
  it('returns eligible offers for a member', async () => {
    const { app } = setup();
    await request(app).post('/v1/offers').set(authHeaders()).send(validOffer);

    const res = await request(app)
      .get(`/v1/members/${MEMBER_ID}/offers`)
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].eligibility.eligible).toBe(true);
  });

  it('excludes expired offers', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({
        ...validOffer,
        validFrom: '2020-01-01T00:00:00Z',
        validTo: '2020-12-31T23:59:59Z',
      });

    const res = await request(app)
      .get(`/v1/members/${MEMBER_ID}/offers`)
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('excludes offers when member tier not in requiredTiers', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({
        ...validOffer,
        targetingJson: { requiredTiers: ['platinum'] },
      });

    const res = await request(app)
      .get(`/v1/members/${MEMBER_ID}/offers`)
      .set(memberHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('returns 404 for unknown member', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/v1/members/00000000-0000-0000-0000-999999999999/offers')
      .set(memberHeaders());
    expect(res.status).toBe(404);
  });
});

describe('Redemption flow', () => {
  it('redeems an offer (no points cost)', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    expect(res.status).toBe(201);
    expect(res.body.redemptionId).toBeDefined();
    expect(res.body.discountValue).toBe(15);
    expect(res.body.pointsUsed).toBe(0);
  });

  it('redeems an offer with points cost', async () => {
    const { app, publisher } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, pointsCost: 100 });
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'ecommerce' });
    expect(res.status).toBe(201);
    expect(res.body.pointsUsed).toBe(100);
    expect(res.body.newBalance).toBe(400);

    // Check event published
    const redeemedEvents = publisher.events.filter((e) => e.eventType === 'points.redeemed');
    expect(redeemedEvents).toHaveLength(1);
    expect((redeemedEvents[0]!.payload as Record<string, unknown>).points).toBe(100);
  });

  it('blocks double-redeem when per_member_limit is 1', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, perMemberLimit: 1 });
    const offerId = createRes.body.offerId;

    // First redemption
    const first = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    expect(first.status).toBe(201);

    // Second redemption should be blocked
    const second = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    expect(second.status).toBe(422);
  });

  it('blocks redemption for non-existent offer', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({
        memberId: MEMBER_ID,
        offerId: '00000000-0000-0000-0000-999999999999',
        channel: 'pos',
      });
    expect(res.status).toBe(404);
  });

  it('blocks redemption for non-existent member', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({
        memberId: '00000000-0000-0000-0000-999999999999',
        offerId,
        channel: 'pos',
      });
    expect(res.status).toBe(404);
  });

  it('blocks redemption with insufficient points', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, pointsCost: 9999 });
    const offerId = createRes.body.offerId;

    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    expect(res.status).toBe(422);
  });
});

describe('Code redemption', () => {
  it('generates codes and redeems with a code', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    // Generate codes
    const genRes = await request(app)
      .post(`/v1/offers/${offerId}/generate-codes`)
      .set(authHeaders())
      .send({ count: 5, prefix: 'TST' });
    expect(genRes.status).toBe(201);
    expect(genRes.body.codes).toHaveLength(5);
    expect(genRes.body.count).toBe(5);

    const code = genRes.body.codes[0];

    // List codes
    const listRes = await request(app)
      .get(`/v1/offers/${offerId}/codes`)
      .set(memberHeaders());
    expect(listRes.status).toBe(200);
    expect(listRes.body.codes).toHaveLength(5);

    // Filter by status
    const availRes = await request(app)
      .get(`/v1/offers/${offerId}/codes?status=available`)
      .set(memberHeaders());
    expect(availRes.body.codes).toHaveLength(5);

    // Redeem with code
    const redeemRes = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos', redemptionCode: code });
    expect(redeemRes.status).toBe(201);

    // Code should now be redeemed
    const afterRes = await request(app)
      .get(`/v1/offers/${offerId}/codes?status=available`)
      .set(memberHeaders());
    expect(afterRes.body.codes).toHaveLength(4);
  });

  it('rejects redemption with already-used code', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, perMemberLimit: 5 });
    const offerId = createRes.body.offerId;

    const genRes = await request(app)
      .post(`/v1/offers/${offerId}/generate-codes`)
      .set(authHeaders())
      .send({ count: 1 });
    const code = genRes.body.codes[0];

    // First redemption
    await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos', redemptionCode: code });

    // Second redemption with same code
    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos', redemptionCode: code });
    expect(res.status).toBe(409);
  });

  it('rejects code from wrong offer', async () => {
    const { app } = setup();
    const offer1Res = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offer1Id = offer1Res.body.offerId;

    const offer2Res = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, name: 'Other Offer' });
    const offer2Id = offer2Res.body.offerId;

    const genRes = await request(app)
      .post(`/v1/offers/${offer1Id}/generate-codes`)
      .set(authHeaders())
      .send({ count: 1 });
    const code = genRes.body.codes[0];

    // Try to redeem offer2 with offer1's code
    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId: offer2Id, channel: 'pos', redemptionCode: code });
    expect(res.status).toBe(400);
  });
});

describe('Reverse redemption', () => {
  it('reverses a completed redemption', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const redeemRes = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    const redemptionId = redeemRes.body.redemptionId;

    const reverseRes = await request(app)
      .post(`/v1/redemptions/${redemptionId}/reverse`)
      .set(memberHeaders())
      .send({});
    expect(reverseRes.status).toBe(200);
    expect(reverseRes.body.reversed).toBe(true);
  });

  it('blocks double-reverse', async () => {
    const { app } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send(validOffer);
    const offerId = createRes.body.offerId;

    const redeemRes = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    const redemptionId = redeemRes.body.redemptionId;

    await request(app)
      .post(`/v1/redemptions/${redemptionId}/reverse`)
      .set(memberHeaders())
      .send({});

    const second = await request(app)
      .post(`/v1/redemptions/${redemptionId}/reverse`)
      .set(memberHeaders())
      .send({});
    expect(second.status).toBe(409);
  });

  it('reversal with points restores balance', async () => {
    const { app, engineClient } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, pointsCost: 50 });
    const offerId = createRes.body.offerId;

    const redeemRes = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos' });
    expect(redeemRes.body.newBalance).toBe(450);

    await request(app)
      .post(`/v1/redemptions/${redeemRes.body.redemptionId}/reverse`)
      .set(memberHeaders())
      .send({});

    // Engine client should have restored points
    const member = engineClient.members.get(`${TENANT_ID}:${MEMBER_ID}`);
    expect(member!.pointsBalance).toBe(500);
  });

  it('reversal re-enables offer code', async () => {
    const { app, db } = setup();
    const createRes = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ ...validOffer, perMemberLimit: 5 });
    const offerId = createRes.body.offerId;

    const genRes = await request(app)
      .post(`/v1/offers/${offerId}/generate-codes`)
      .set(authHeaders())
      .send({ count: 1 });
    const code = genRes.body.codes[0];

    // Redeem with code
    const redeemRes = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: MEMBER_ID, offerId, channel: 'pos', redemptionCode: code });

    // Check code is redeemed
    let codeRow = await db.getCode(TENANT_ID, code);
    expect(codeRow!.status).toBe('redeemed');

    // Reverse
    await request(app)
      .post(`/v1/redemptions/${redeemRes.body.redemptionId}/reverse`)
      .set(memberHeaders())
      .send({});

    // Code should be available again
    codeRow = await db.getCode(TENANT_ID, code);
    expect(codeRow!.status).toBe('available');
  });

  it('returns 404 for unknown redemption', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/redemptions/00000000-0000-0000-0000-999999999999/reverse')
      .set(memberHeaders())
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('Validation errors', () => {
  it('returns 400 for invalid offer create body', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/offers')
      .set(authHeaders())
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid redemption body', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/redemptions')
      .set(memberHeaders())
      .send({ memberId: 'not-uuid' });
    expect(res.status).toBe(400);
  });
});
