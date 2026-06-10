import request from 'supertest';
import { createLogger } from '@loyalty/shared-logger';
import { EVENT_TYPES } from '@loyalty/shared-events';
import { decrypt } from '@loyalty/shared-pii';
import { createApp } from '../src/index';
import { InMemoryNotificationRepository } from '../src/repository.memory';
import { TemplateLoader } from '../src/templates';
import { NoopEmailProvider } from '../src/providers';
import { InMemoryMemberClient } from '../src/member-client';
import { NotificationService } from '../src/service';
import { createEventRouter } from '../src/event-handlers';
import type { MemberContact } from '../src/types';

process.env.SKIP_AUTH = 'true';

const TENANT = '00000000-0000-4000-8000-000000000001';
const USER = 'test-user';
const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const PII_KEY = '11'.repeat(32);
const PEPPER = 'test-pepper';

function buildHarness(members: MemberContact[]) {
  const logger = createLogger('notification-service-test');
  const repo = new InMemoryNotificationRepository();
  const templates = new TemplateLoader();
  const provider = new NoopEmailProvider(logger);
  const memberClient = new InMemoryMemberClient(members);
  const service = new NotificationService(
    repo,
    templates,
    provider,
    memberClient,
    {
      piiKeyHex: PII_KEY,
      recipientPepper: PEPPER,
      fromEmail: 'no-reply@test.local',
      supportEmail: 'support@test.local',
      programName: 'TestPoints',
      tenantName: 'TestCo',
      unsubscribeBaseUrl: 'https://test.local/u',
    },
    logger,
  );
  const { app } = createApp({ service, logger });
  return { app, service, repo, provider, logger };
}

describe('notification-service integration', () => {
  const member: MemberContact = {
    memberId: MEMBER_A,
    email: 'Alice@Example.Com',
    firstName: 'Alice',
    lastName: 'Smith',
  };

  it('GET /health and /ready', async () => {
    const { app } = buildHarness([member]);
    const h = await request(app).get('/health');
    expect(h.status).toBe(200);
    expect(h.body.status).toBe('ok');
    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
  });

  it('POST /v1/notifications/send dispatches welcome email', async () => {
    const { app, repo, provider } = buildHarness([member]);
    const res = await request(app)
      .post('/v1/notifications/send')
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER)
      .send({
        memberId: MEMBER_A,
        templateKey: 'welcome',
        channel: 'email',
        triggeredByEventId: EVENT_ID,
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('sent');
    expect(res.body.providerMessageId).toMatch(/^noop-/);

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.to).toBe('Alice@Example.Com');
    expect(provider.sent[0]!.subject).toContain('Alice');

    expect(repo.log).toHaveLength(1);
    const row = repo.log[0]!;
    expect(row.status).toBe('sent');
    expect(row.templateKey).toBe('welcome');
    expect(row.recipientHash).toMatch(/^[0-9a-f]{64}$/);
    // Stored recipient is encrypted, decrypts back to original
    expect(decrypt(row.recipientCiphertext, PII_KEY)).toBe('Alice@Example.Com');
    // Raw recipient is never returned in HTTP log
    const logRes = await request(app)
      .get('/v1/notifications/log')
      .query({ memberId: MEMBER_A })
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER);
    expect(logRes.status).toBe(200);
    expect(logRes.body.items).toHaveLength(1);
    expect(JSON.stringify(logRes.body)).not.toContain('Alice@Example.Com');
    expect(logRes.body.items[0].recipientHash).toBe(row.recipientHash);
  });

  it('GET /v1/notifications/templates lists templates', async () => {
    const { app } = buildHarness([member]);
    const res = await request(app)
      .get('/v1/notifications/templates')
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER);
    expect(res.status).toBe(200);
    expect(res.body.templates).toEqual(
      expect.arrayContaining([
        'welcome',
        'tier_upgraded',
        'tier_downgraded',
        'gdpr_deletion_confirmed',
        'points_earned_digest',
      ]),
    );
  });

  it('send returns 404 for unknown template', async () => {
    const { app } = buildHarness([member]);
    const res = await request(app)
      .post('/v1/notifications/send')
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER)
      .send({ memberId: MEMBER_A, templateKey: 'missing', channel: 'email' });
    expect(res.status).toBe(404);
  });

  it('send validates body', async () => {
    const { app } = buildHarness([member]);
    const res = await request(app)
      .post('/v1/notifications/send')
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER)
      .send({ memberId: 'not-a-uuid', templateKey: 'welcome', channel: 'email' });
    expect(res.status).toBe(400);
  });

  it('POST preferences opts a member out of a non-transactional template', async () => {
    const { app, service, repo } = buildHarness([member]);
    // Opt in to digest
    const prefRes = await request(app)
      .post(`/v1/notifications/preferences/${MEMBER_A}`)
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER)
      .send({ templateKey: 'points_earned_digest', channel: 'email', optedIn: true });
    expect(prefRes.status).toBe(204);

    // Now opt out
    await request(app)
      .post(`/v1/notifications/preferences/${MEMBER_A}`)
      .set('x-tenant-id', TENANT)
      .set('x-user-id', USER)
      .send({ templateKey: 'points_earned_digest', channel: 'email', optedIn: false });

    const result = await service.send(TENANT, {
      memberId: MEMBER_A,
      templateKey: 'points_earned_digest',
      channel: 'email',
    });
    expect(result.status).toBe('suppressed');
    const row = repo.log.find((r) => r.notificationId === result.notificationId)!;
    expect(row.status).toBe('suppressed');
  });

  it('event router: member.enrolled → welcome email sent', async () => {
    const { service, provider, logger } = buildHarness([member]);
    const router = createEventRouter({ service, logger });
    await router.route({
      eventId: EVENT_ID,
      eventType: EVENT_TYPES.MEMBER_ENROLLED,
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
      version: '1.0',
      payload: {
        memberId: MEMBER_A,
        channel: 'pos',
        enrolledAt: new Date().toISOString(),
        tierId: 'bronze',
      },
    });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.subject).toContain('Alice');
  });

  it('event router: tier.upgraded → tier_upgraded email with tier vars', async () => {
    const { service, provider, logger } = buildHarness([member]);
    const router = createEventRouter({ service, logger });
    await router.route({
      eventId: EVENT_ID,
      eventType: EVENT_TYPES.TIER_UPGRADED,
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
      version: '1.0',
      payload: {
        memberId: MEMBER_A,
        fromTierId: 'Silver',
        toTierId: 'Gold',
        effectiveAt: new Date().toISOString(),
      },
    });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.text).toContain('Silver to Gold');
  });

  it('event router: points.earned is logged pending, NOT dispatched', async () => {
    const { service, provider, repo, logger } = buildHarness([member]);
    const router = createEventRouter({ service, logger });
    await router.route({
      eventId: EVENT_ID,
      eventType: EVENT_TYPES.POINTS_EARNED,
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
      version: '1.0',
      payload: {
        memberId: MEMBER_A,
        transactionId: 'tx1',
        points: 10,
        balanceAfter: 100,
      },
    });
    expect(provider.sent).toHaveLength(0);
    expect(repo.log).toHaveLength(1);
    expect(repo.log[0]!.status).toBe('pending');
    expect(repo.log[0]!.templateKey).toBe('points_earned_digest');
  });

  it('event router: member.deleted send failure is swallowed', async () => {
    const { service, logger } = buildHarness([
      { memberId: MEMBER_B, firstName: 'B' }, // no email
    ]);
    const router = createEventRouter({ service, logger });
    await expect(
      router.route({
        eventId: EVENT_ID,
        eventType: EVENT_TYPES.MEMBER_DELETED,
        tenantId: TENANT,
        timestamp: new Date().toISOString(),
        version: '1.0',
        payload: { memberId: MEMBER_B, deletedAt: new Date().toISOString() },
      }),
    ).resolves.toBeUndefined();
  });
});
