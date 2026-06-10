import request from 'supertest';
import { createApp, buildDefaultDeps, InMemoryMemberClient } from '../src/index';
import type { RoutesDeps } from '../src/routes';

const TENANT = '00000000-0000-0000-0000-000000000001';

function h(role: 'owner' | 'manager' | 'analyst', userId = 'admin-user') {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': userId,
    'x-user-role': role,
  };
}

function build(depsOverrides: Partial<RoutesDeps> = {}) {
  const defaults = buildDefaultDeps();
  // deterministic id generator
  let n = 0;
  const deps: RoutesDeps = {
    ...defaults,
    idGen: () => `id-${++n}`,
    keyGen: () => 'plain-secret-42',
    hashFn: async (p) => `hash:${p}`,
    ...depsOverrides,
  };
  // seed a program config so GET /program works
  void deps.programConfig.update(TENANT, { baseEarnRate: 1 });
  // seed a member
  const mc = deps.members as InMemoryMemberClient;
  mc.members.push({
    id: 'mem-1',
    tenantId: TENANT,
    firstName: 'Alice',
    lastName: 'Admin',
    phoneHash: 'ph',
    tierId: 'tier-bronze',
    status: 'active',
    pointsBalance: 100,
    enrolledAt: new Date().toISOString(),
  });
  return { app: createApp({ deps, devAuth: true }).app, deps };
}

describe('program config routes', () => {
  it('GET /program returns seeded row for manager', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/program').set(h('manager'));
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(TENANT);
  });

  it('GET /program forbidden for analyst', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/program').set(h('analyst'));
    expect(res.status).toBe(403);
  });

  it('PUT /program updates and writes audit', async () => {
    const { app, deps } = build();
    const res = await request(app)
      .put('/v1/admin/program')
      .set(h('owner'))
      .send({ configJson: { baseEarnRate: 2 }, reason: 'tuning' });
    expect(res.status).toBe(200);
    expect(res.body.configJson.baseEarnRate).toBe(2);
    const audit = await deps.audit.list(TENANT, { entity: 'program_config' });
    expect(audit.items.some((a) => a.action === 'program.update')).toBe(true);
  });

  it('PUT /program accepts flat config fields', async () => {
    const { app } = build();
    const res = await request(app)
      .put('/v1/admin/program')
      .set(h('owner'))
      .send({ programName: 'Test Rewards', baseEarnRate: 2 });
    expect(res.status).toBe(200);
  });

  it('GET /program/version-history returns audit rows', async () => {
    const { app } = build();
    await request(app)
      .put('/v1/admin/program')
      .set(h('owner'))
      .send({ configJson: { baseEarnRate: 3 } });
    const res = await request(app)
      .get('/v1/admin/program/version-history')
      .set(h('manager'));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('tiers routes', () => {
  it('GET /tiers allowed for analyst', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/tiers').set(h('analyst'));
    expect(res.status).toBe(200);
  });

  it('POST /tiers requires owner', async () => {
    const { app } = build();
    const forbidden = await request(app)
      .post('/v1/admin/tiers')
      .set(h('manager'))
      .send({ name: 'Gold', rank: 3, thresholdPoints: 5000 });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post('/v1/admin/tiers')
      .set(h('owner'))
      .send({ name: 'Gold', rank: 3, thresholdPoints: 5000 });
    expect(ok.status).toBe(201);
    expect(ok.body.id).toBe('id-1');
  });

  it('PUT /tiers/:id validates body', async () => {
    const { app, deps } = build();
    const created = await deps.tiers.create({
      id: 'silver',
      tenantId: TENANT,
      name: 'Silver',
      rank: 2,
      thresholdPoints: 1000,
      benefits: {},
      isActive: true,
    });
    const res = await request(app)
      .put(`/v1/admin/tiers/${created.id}`)
      .set(h('manager'))
      .send({ thresholdPoints: -1 });
    expect(res.status).toBe(400);

    const ok = await request(app)
      .put(`/v1/admin/tiers/${created.id}`)
      .set(h('manager'))
      .send({ thresholdPoints: 1500 });
    expect(ok.status).toBe(200);
    expect(ok.body.thresholdPoints).toBe(1500);
  });

  it('DELETE /tiers/:id soft deactivates', async () => {
    const { app, deps } = build();
    await deps.tiers.create({
      id: 'x',
      tenantId: TENANT,
      name: 'X',
      rank: 1,
      thresholdPoints: 0,
      benefits: {},
      isActive: true,
    });
    const res = await request(app).delete('/v1/admin/tiers/x').set(h('owner'));
    expect(res.status).toBe(200);
    const fetched = await deps.tiers.get(TENANT, 'x');
    expect(fetched?.isActive).toBe(false);
  });
});

describe('members routes', () => {
  it('GET /members/search paginates', async () => {
    const { app } = build();
    const res = await request(app)
      .get('/v1/admin/members/search')
      .set(h('analyst'));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('GET /members/:id 404 when missing', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/members/none').set(h('analyst'));
    expect(res.status).toBe(404);
  });

  it('POST /members/:id/points-adjust proxies to engine', async () => {
    const { app, deps } = build();
    const res = await request(app)
      .post('/v1/admin/members/mem-1/points-adjust')
      .set(h('manager'))
      .send({ delta: 50, reasonCode: 'goodwill' });
    expect(res.status).toBe(200);
    expect(res.body.balanceAfter).toBe(1050);
    const eng = deps.loyaltyEngine as ReturnType<typeof buildDefaultDeps>['loyaltyEngine'] & {
      adjustments: Array<{ delta: number }>;
    };
    expect(eng.adjustments).toHaveLength(1);
    expect(eng.adjustments[0]!.delta).toBe(50);
  });

  it('POST /members/:id/points-adjust forbidden for analyst', async () => {
    const { app } = build();
    const res = await request(app)
      .post('/v1/admin/members/mem-1/points-adjust')
      .set(h('analyst'))
      .send({ delta: 50, reasonCode: 'goodwill' });
    expect(res.status).toBe(403);
  });

  it('POST /members/:id/tier-override writes audit', async () => {
    const { app, deps } = build();
    const res = await request(app)
      .post('/v1/admin/members/mem-1/tier-override')
      .set(h('manager'))
      .send({ toTierId: 'tier-gold', reason: 'VIP' });
    expect(res.status).toBe(200);
    const audit = await deps.audit.list(TENANT, { entity: 'member', action: 'tier.override' });
    expect(audit.items).toHaveLength(1);
  });

  it('POST /members/:id/status updates', async () => {
    const { app, deps } = build();
    const res = await request(app)
      .post('/v1/admin/members/mem-1/status')
      .set(h('manager'))
      .send({ status: 'suspended', reason: 'fraud' });
    expect(res.status).toBe(200);
    const m = await deps.members.getById(TENANT, 'mem-1');
    expect(m?.status).toBe('suspended');
  });

  it('POST /members/:id/gdpr-delete: manager can request, only owner can confirm', async () => {
    const { app, deps } = build();
    const req1 = await request(app)
      .post('/v1/admin/members/mem-1/gdpr-delete')
      .set(h('manager'))
      .send({ reason: 'user-request' });
    expect(req1.status).toBe(200);
    expect(req1.body.requested).toBe(true);
    expect(req1.body.deleted).toBe(false);

    const forbidden = await request(app)
      .post('/v1/admin/members/mem-1/gdpr-delete')
      .set(h('manager'))
      .send({ reason: 'user-request', confirm: true });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post('/v1/admin/members/mem-1/gdpr-delete')
      .set(h('owner'))
      .send({ reason: 'user-request', confirm: true });
    expect(ok.status).toBe(200);
    expect(ok.body.deleted).toBe(true);
    expect(await deps.members.getById(TENANT, 'mem-1')).toBeNull();
  });

  it('POST /members/bulk partitions ids', async () => {
    const { app } = build();
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    const res = await request(app)
      .post('/v1/admin/members/bulk')
      .set(h('manager'))
      .send({ action: 'tag', memberIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(250);
    expect(res.body.chunkCount).toBe(3);
  });

  it('POST /members/bulk rejects over 1000', async () => {
    const { app } = build();
    const ids = Array.from({ length: 1001 }, (_, i) => `m${i}`);
    const res = await request(app)
      .post('/v1/admin/members/bulk')
      .set(h('manager'))
      .send({ action: 'tag', memberIds: ids });
    expect(res.status).toBe(400);
  });

  it('GET /members/export.csv streams CSV', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/members/export.csv').set(h('analyst'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toContain('id,firstName,lastName');
  });
});

describe('api keys routes', () => {
  it('owner can create; manager cannot', async () => {
    const { app } = build();
    const forbidden = await request(app)
      .post('/v1/admin/apikeys')
      .set(h('manager'))
      .send({ label: 'main' });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post('/v1/admin/apikeys')
      .set(h('owner'))
      .send({ label: 'main' });
    expect(ok.status).toBe(201);
    expect(ok.body.plaintextKey).toBe('plain-secret-42');
    expect(ok.body.keyId).toBeDefined();
  });

  it('plaintext key is NOT stored in audit log', async () => {
    const { app, deps } = build();
    await request(app)
      .post('/v1/admin/apikeys')
      .set(h('owner'))
      .send({ label: 'main' });
    const audit = await deps.audit.list(TENANT, { action: 'apikey.create' });
    expect(audit.items).toHaveLength(1);
    expect(JSON.stringify(audit.items[0]!.afterJson)).not.toContain('plain-secret-42');
  });

  it('GET /apikeys and DELETE /apikeys/:id', async () => {
    const { app } = build();
    const created = await request(app)
      .post('/v1/admin/apikeys')
      .set(h('owner'))
      .send({ label: 'tmp' });
    const keyId = created.body.keyId;
    const list = await request(app).get('/v1/admin/apikeys').set(h('owner'));
    expect(list.body.items).toHaveLength(1);
    const del = await request(app)
      .delete(`/v1/admin/apikeys/${keyId}`)
      .set(h('owner'));
    expect(del.status).toBe(200);
    expect(del.body.revokedAt).toBeDefined();
  });
});

describe('webhook routes', () => {
  it('CRUD + test + deliveries', async () => {
    const { app } = build();
    const created = await request(app)
      .post('/v1/admin/webhooks')
      .set(h('manager'))
      .send({ eventType: 'points.earned', targetUrl: 'https://example.com/hook' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/v1/admin/webhooks').set(h('manager'));
    expect(list.body.items).toHaveLength(1);

    const upd = await request(app)
      .put(`/v1/admin/webhooks/${id}`)
      .set(h('manager'))
      .send({ isActive: false });
    expect(upd.status).toBe(200);
    expect(upd.body.isActive).toBe(false);

    const test = await request(app)
      .post(`/v1/admin/webhooks/${id}/test`)
      .set(h('manager'));
    expect(test.status).toBe(200);
    expect(test.body.ok).toBe(true);

    const deliveries = await request(app)
      .get(`/v1/admin/webhooks/${id}/deliveries`)
      .set(h('manager'));
    expect(deliveries.status).toBe(200);

    const del = await request(app).delete(`/v1/admin/webhooks/${id}`).set(h('manager'));
    expect(del.status).toBe(200);
  });

  it('POST /webhooks rejects invalid url', async () => {
    const { app } = build();
    const res = await request(app)
      .post('/v1/admin/webhooks')
      .set(h('manager'))
      .send({ eventType: 'x', targetUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

describe('audit routes', () => {
  it('GET /audit lists rows', async () => {
    const { app } = build();
    await request(app)
      .put('/v1/admin/program')
      .set(h('owner'))
      .send({ configJson: { baseEarnRate: 9 } });
    const res = await request(app).get('/v1/admin/audit').set(h('analyst'));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('GET /audit/export.csv streams', async () => {
    const { app } = build();
    await request(app)
      .put('/v1/admin/program')
      .set(h('owner'))
      .send({ configJson: { baseEarnRate: 9 } });
    const res = await request(app).get('/v1/admin/audit/export.csv').set(h('analyst'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('auditId,actorUserId');
  });
});

describe('feature flags routes', () => {
  it('manager can list, only owner can update', async () => {
    const { app } = build();
    const list = await request(app).get('/v1/admin/feature-flags').set(h('manager'));
    expect(list.status).toBe(200);

    const forbidden = await request(app)
      .put('/v1/admin/feature-flags/new-ui')
      .set(h('manager'))
      .send({ enabled: true });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .put('/v1/admin/feature-flags/new-ui')
      .set(h('owner'))
      .send({ enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.body.enabled).toBe(true);
  });
});

describe('branding routes', () => {
  it('GET returns empty object initially, PUT merges into program config', async () => {
    const { app, deps } = build();
    const get1 = await request(app).get('/v1/admin/branding').set(h('manager'));
    expect(get1.status).toBe(200);

    const upd = await request(app)
      .put('/v1/admin/branding')
      .set(h('manager'))
      .send({ primaryColor: '#ff00ff', senderName: 'Acme' });
    expect(upd.status).toBe(200);
    const cfg = await deps.programConfig.get(TENANT);
    expect((cfg?.configJson as { branding: { primaryColor: string } }).branding.primaryColor).toBe(
      '#ff00ff',
    );
  });
});

describe('auth gating', () => {
  it('missing x-user-id returns 401', async () => {
    const { app } = build();
    const res = await request(app).get('/v1/admin/tiers');
    expect(res.status).toBe(401);
  });
});
