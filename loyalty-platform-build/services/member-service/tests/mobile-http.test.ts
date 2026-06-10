import request from 'supertest';
import { createApp } from '../src/index';
import { InMemoryMobileDataProvider } from '../src/mobile';
import { InMemoryDashboardCache } from '../src/mobile';
import type { MemberRow } from '../src/repository';

const TENANT = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  const now = new Date().toISOString();
  return {
    id: MEMBER_ID,
    tenantId: TENANT,
    status: 'active',
    tierId: 'tier-silver',
    emailHash: 'hash-email',
    phoneHash: 'hash-phone',
    emailEncrypted: undefined,
    phoneEncrypted: 'encrypted-phone',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    enrolledChannel: 'mobile',
    enrolledAt: now,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup() {
  const mobileData = new InMemoryMobileDataProvider();
  const dashboardCache = new InMemoryDashboardCache();

  // Seed test data
  mobileData.seedMember(TENANT, makeMember());
  mobileData.seedBalance(TENANT, MEMBER_ID, 750);
  mobileData.seedTiers(TENANT, [
    { id: 'tier-bronze', name: 'Bronze', rank: 1, thresholdPoints: 0, benefits: { earnMultiplier: 1 }, sortOrder: 1 },
    { id: 'tier-silver', name: 'Silver', rank: 2, thresholdPoints: 500, benefits: { earnMultiplier: 1.5, freeShipping: true }, sortOrder: 2 },
    { id: 'tier-gold', name: 'Gold', rank: 3, thresholdPoints: 2000, benefits: { earnMultiplier: 2, freeShipping: true, birthdayBonus: 100 }, sortOrder: 3 },
  ]);
  mobileData.seedTransactions(TENANT, MEMBER_ID, [
    { id: 'tx-1', memberId: MEMBER_ID, channel: 'pos', amountCents: 5000, currency: 'USD', pointsEarned: 50, createdAt: '2026-04-01T00:00:00Z' },
    { id: 'tx-2', memberId: MEMBER_ID, channel: 'ecommerce', amountCents: 3000, currency: 'USD', pointsEarned: 30, createdAt: '2026-04-02T00:00:00Z' },
  ]);
  mobileData.seedOffers(TENANT, MEMBER_ID, [
    { id: 'off-1', code: 'SAVE10', name: '10% Off', type: 'percent', value: 10, startsAt: '2026-04-01T00:00:00Z', endsAt: '2026-05-01T00:00:00Z', conditionsJson: { imageUrl: 'https://cdn.example.com/save10.png' } },
  ]);
  mobileData.seedNotifications(TENANT, MEMBER_ID, [
    { id: 'notif-1', templateKey: 'welcome', channel: 'email', status: 'sent', createdAt: '2026-04-01T00:00:00Z' },
  ]);

  const { app } = createApp({
    skipAuth: true,
    dashboardCache,
    mobileData,
  });

  return { app, mobileData, dashboardCache };
}

const headers = {
  'x-tenant-id': TENANT,
  'x-user-id': 'test-user',
};

describe('GET /v1/mobile/dashboard/:memberId', () => {
  it('returns 200 with aggregated dashboard', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/dashboard/${MEMBER_ID}`)
      .set(headers)
      .expect(200);

    expect(res.body.member.id).toBe(MEMBER_ID);
    expect(res.body.member.firstName).toBe('Jane');
    expect(res.body.balance).toBe(750);
    expect(res.body.tier.name).toBe('Silver');
    expect(res.body.tierProgress.current.tierName).toBe('Silver');
    expect(res.body.tierProgress.next.tierName).toBe('Gold');
    expect(res.body.tierProgress.pointsToNext).toBe(1250);
    expect(res.body.recentTransactions).toHaveLength(2);
    expect(res.body.eligibleOffers).toHaveLength(1);
    expect(res.body.eligibleOffers[0].imageUrl).toBe('https://cdn.example.com/save10.png');
    expect(res.body.unreadNotifications).toBe(1);
  });

  it('returns 404 for unknown member', async () => {
    const { app } = setup();
    await request(app)
      .get('/v1/mobile/dashboard/99999999-9999-9999-9999-999999999999')
      .set(headers)
      .expect(404);
  });

  it('returns 400 for invalid UUID', async () => {
    const { app } = setup();
    await request(app)
      .get('/v1/mobile/dashboard/not-a-uuid')
      .set(headers)
      .expect(400);
  });
});

describe('GET /v1/mobile/transactions/:memberId', () => {
  it('returns 200 with paginated transactions', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/transactions/${MEMBER_ID}?limit=1`)
      .set(headers)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].pointsEarned).toBeDefined();
  });

  it('returns 404 for unknown member', async () => {
    const { app } = setup();
    await request(app)
      .get('/v1/mobile/transactions/99999999-9999-9999-9999-999999999999')
      .set(headers)
      .expect(404);
  });
});

describe('GET /v1/mobile/offers/:memberId', () => {
  it('returns 200 with offers', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/offers/${MEMBER_ID}`)
      .set(headers)
      .expect(200);

    expect(res.body.offers).toHaveLength(1);
    expect(res.body.offers[0].name).toBe('10% Off');
    expect(res.body.offers[0].imageUrl).toBe('https://cdn.example.com/save10.png');
  });
});

describe('GET /v1/mobile/tier-progress/:memberId', () => {
  it('returns 200 with tier progress', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/tier-progress/${MEMBER_ID}`)
      .set(headers)
      .expect(200);

    expect(res.body.current.tierName).toBe('Silver');
    expect(res.body.next.tierName).toBe('Gold');
    expect(res.body.pointsToNext).toBe(1250);
    expect(typeof res.body.percentComplete).toBe('number');
    expect(res.body.current.benefits.earnMultiplier).toBe(1.5);
  });
});

describe('POST /v1/mobile/notifications/preferences', () => {
  it('returns 204 on success', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/mobile/notifications/preferences')
      .set(headers)
      .send({ memberId: MEMBER_ID, templateKey: 'points_earned_digest', optedIn: false })
      .expect(204);
  });

  it('returns 400 for missing fields', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/mobile/notifications/preferences')
      .set(headers)
      .send({ memberId: MEMBER_ID })
      .expect(400);
  });

  it('returns 404 for unknown member', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/mobile/notifications/preferences')
      .set(headers)
      .send({
        memberId: '99999999-9999-9999-9999-999999999999',
        templateKey: 'welcome',
        optedIn: true,
      })
      .expect(404);
  });
});

describe('GET /v1/mobile/notifications/:memberId', () => {
  it('returns 200 with notifications', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/notifications/${MEMBER_ID}`)
      .set(headers)
      .expect(200);

    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].templateKey).toBe('welcome');
  });

  it('supports limit query parameter', async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/v1/mobile/notifications/${MEMBER_ID}?limit=1`)
      .set(headers)
      .expect(200);

    expect(res.body.notifications).toHaveLength(1);
  });
});

describe('POST /v1/mobile/push/register', () => {
  it('returns 201 with registration details', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/v1/mobile/push/register')
      .set(headers)
      .send({ memberId: MEMBER_ID, deviceToken: 'abc-token-123', platform: 'ios' })
      .expect(201);

    expect(res.body.memberId).toBe(MEMBER_ID);
    expect(res.body.platform).toBe('ios');
    expect(res.body.deviceToken).toBe('abc-token-123');
    expect(res.body.registeredAt).toBeDefined();
  });

  it('returns 400 for invalid platform', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/mobile/push/register')
      .set(headers)
      .send({ memberId: MEMBER_ID, deviceToken: 'abc', platform: 'windows' })
      .expect(400);
  });

  it('returns 400 for missing deviceToken', async () => {
    const { app } = setup();
    await request(app)
      .post('/v1/mobile/push/register')
      .set(headers)
      .send({ memberId: MEMBER_ID, platform: 'ios' })
      .expect(400);
  });
});
