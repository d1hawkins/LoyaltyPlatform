import request from 'supertest';
import { createApp, InMemoryTenantRepository, DevProvisioningService } from '../src/index';
import type { PublicRoutesDeps } from '../src/public-routes';

function buildWithProvisioning() {
  const tenants = new InMemoryTenantRepository();
  const provisioning = new DevProvisioningService(tenants);
  const publicDeps: PublicRoutesDeps = { tenants, provisioning };
  const { app } = createApp({ devAuth: true, publicDeps });
  return { app, tenants };
}

const validProvisionBody = {
  slug: 'acme-rewards',
  name: 'Acme Corp',
  contactEmail: 'admin@acme.com',
  contactPhone: '+1234567890',
  contactName: 'Jane Doe',
  businessType: 'retail',
  programName: 'Acme Rewards',
  baseEarnRate: 1.5,
  enableTiers: true,
  tiers: [
    { name: 'Silver', threshold: 1000 },
    { name: 'Gold', threshold: 5000 },
  ],
  expiryMonths: 12,
  channels: ['pos', 'ecommerce'],
};

describe('POST /v1/public/tenants/check-slug', () => {
  it('returns available=true for a new slug', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/check-slug')
      .send({ slug: 'fresh-slug' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.suggestion).toBeUndefined();
  });

  it('returns available=false for an existing slug with suggestion', async () => {
    const { app, tenants } = buildWithProvisioning();
    // Pre-populate a tenant
    await tenants.create({
      tenantId: 'existing-id',
      slug: 'taken-slug',
      name: 'Existing',
      contactEmail: 'a@b.com',
      contactPhone: '123',
      contactName: 'Test',
      businessType: 'retail',
      status: 'active',
    });

    const res = await request(app)
      .post('/v1/public/tenants/check-slug')
      .send({ slug: 'taken-slug' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.suggestion).toBeDefined();
    expect(res.body.suggestion).toMatch(/^taken-slug-\d+$/);
  });

  it('returns suggestion for invalid slug format', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/check-slug')
      .send({ slug: 'UPPER Case!' });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    // Suggestion should be a sanitised version
    expect(res.body.suggestion).toBeDefined();
  });

  it('rejects missing slug', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/check-slug')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/public/tenants/provision', () => {
  it('provisions a new tenant successfully', async () => {
    const { app, tenants } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send(validProvisionBody);
    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBeDefined();
    expect(res.body.slug).toBe('acme-rewards');
    expect(res.body.apiKey).toMatch(/^lk_test_/);
    expect(res.body.adminUrl).toBeDefined();

    // Verify tenant was stored and activated
    expect(tenants.rows).toHaveLength(1);
    expect(tenants.rows[0]!.status).toBe('active');
  });

  it('rejects duplicate slug', async () => {
    const { app } = buildWithProvisioning();
    // First provision succeeds
    await request(app)
      .post('/v1/public/tenants/provision')
      .send(validProvisionBody);
    // Second provision with same slug fails
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send(validProvisionBody);
    expect(res.status).toBe(400);
  });

  it('rejects invalid slug format', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send({ ...validProvisionBody, slug: 'AB' });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send({ slug: 'test-slug' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send({ ...validProvisionBody, contactEmail: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects empty channels array', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send({ ...validProvisionBody, channels: [] });
    expect(res.status).toBe(400);
  });

  it('accepts provision without tiers', async () => {
    const { app } = buildWithProvisioning();
    const body = {
      ...validProvisionBody,
      slug: 'no-tiers-co',
      enableTiers: false,
      tiers: undefined,
    };
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send(body);
    expect(res.status).toBe(201);
  });

  it('accepts provision without optional fields', async () => {
    const { app } = buildWithProvisioning();
    const body = {
      slug: 'minimal-co',
      name: 'Minimal Corp',
      contactEmail: 'min@min.com',
      contactPhone: '+1111111111',
      contactName: 'Min',
      businessType: 'services',
      programName: 'Min Points',
      baseEarnRate: 1,
      enableTiers: false,
      channels: ['pos'],
    };
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send(body);
    expect(res.status).toBe(201);
  });
});

describe('public routes do not require auth', () => {
  it('check-slug works without auth headers', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/check-slug')
      .send({ slug: 'test' });
    expect(res.status).toBe(200);
  });

  it('provision works without auth headers', async () => {
    const { app } = buildWithProvisioning();
    const res = await request(app)
      .post('/v1/public/tenants/provision')
      .send(validProvisionBody);
    expect(res.status).toBe(201);
  });
});
