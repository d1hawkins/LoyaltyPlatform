import request from 'supertest';
import { createApp } from '../src/index';
import {
  InMemoryCache,
  InMemoryDb,
  InMemoryMemberClient,
  InMemoryPublisher,
} from '../src/in-memory';
import { ExpiryWorker } from '../src/expiry';
import { computeExpirableCredits, calculateExpiresAt } from '../src/expiry/expiry-calculator';
import type { ExpiringCredit, ProgramConfig } from '../src/deps';

const TENANT = '00000000-0000-0000-0000-000000000001';
const MEMBER_A = '11111111-1111-1111-1111-111111111111';
const MEMBER_B = '22222222-2222-2222-2222-222222222222';

function setupWithExpiry(cfgOverrides: Partial<ProgramConfig> = {}) {
  const db = new InMemoryDb({
    pointsExpiryMonths: 12,
    expiryNotificationDays: '30,7',
    ...cfgOverrides,
  });
  const cache = new InMemoryCache();
  const publisher = new InMemoryPublisher();
  const memberClient = new InMemoryMemberClient();
  memberClient.put({
    memberId: MEMBER_A,
    tenantId: TENANT,
    status: 'active',
    tierId: 'silver',
    tierMultiplier: 1,
  });
  memberClient.put({
    memberId: MEMBER_B,
    tenantId: TENANT,
    status: 'active',
    tierId: 'bronze',
    tierMultiplier: 1,
  });
  const { app, expiryWorker } = createApp({
    deps: { db, cache, publisher, memberClient },
  });
  return { app, db, cache, publisher, memberClient, expiryWorker };
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': 'admin-tester',
    'x-user-role': 'admin',
    ...extra,
  };
}

function userHeaders(extra: Record<string, string> = {}) {
  return {
    'x-tenant-id': TENANT,
    'x-user-id': 'user-tester',
    ...extra,
  };
}

// --- Unit tests: expiry calculator ---

describe('computeExpirableCredits', () => {
  it('returns credits with remaining balance after partial redemption', () => {
    const credits: ExpiringCredit[] = [
      { ledgerId: 'c1', memberId: MEMBER_A, delta: 100, expiresAt: '2025-01-01T00:00:00Z', alreadyUsed: 30 },
    ];
    const results = computeExpirableCredits(credits);
    expect(results).toHaveLength(1);
    expect(results[0]!.remainingDelta).toBe(70);
  });

  it('skips fully redeemed credits', () => {
    const credits: ExpiringCredit[] = [
      { ledgerId: 'c1', memberId: MEMBER_A, delta: 100, expiresAt: '2025-01-01T00:00:00Z', alreadyUsed: 100 },
    ];
    const results = computeExpirableCredits(credits);
    expect(results).toHaveLength(0);
  });

  it('skips over-redeemed credits', () => {
    const credits: ExpiringCredit[] = [
      { ledgerId: 'c1', memberId: MEMBER_A, delta: 50, expiresAt: '2025-01-01T00:00:00Z', alreadyUsed: 60 },
    ];
    const results = computeExpirableCredits(credits);
    expect(results).toHaveLength(0);
  });

  it('returns full delta when nothing redeemed', () => {
    const credits: ExpiringCredit[] = [
      { ledgerId: 'c1', memberId: MEMBER_A, delta: 200, expiresAt: '2025-01-01T00:00:00Z', alreadyUsed: 0 },
    ];
    const results = computeExpirableCredits(credits);
    expect(results).toHaveLength(1);
    expect(results[0]!.remainingDelta).toBe(200);
  });
});

describe('calculateExpiresAt', () => {
  it('adds months correctly', () => {
    const result = calculateExpiresAt('2025-01-15T10:00:00.000Z', 12);
    expect(new Date(result).getUTCFullYear()).toBe(2026);
    expect(new Date(result).getUTCMonth()).toBe(0); // January
    expect(new Date(result).getUTCDate()).toBe(15);
  });

  it('handles month overflow (e.g. Jan 31 + 1 month)', () => {
    const result = calculateExpiresAt('2025-01-31T10:00:00.000Z', 1);
    // JS Date rolls Jan 31 + 1 month = Mar 3 (or Feb 28 depending on year)
    const d = new Date(result);
    // The result should be in February or March — just verify it's after the original
    expect(d.getTime()).toBeGreaterThan(new Date('2025-01-31T10:00:00.000Z').getTime());
  });
});

// --- Integration tests: expiry worker ---

describe('ExpiryWorker', () => {
  it('expires credits past their expires_at date', async () => {
    const { db, expiryWorker, publisher } = setupWithExpiry();

    // Manually insert a credit with expired date
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // yesterday
    db.ledger.push({
      id: 'credit-1',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 100,
      balanceAfter: 100,
      reasonCode: 'earn',
      expiresAt: pastDate,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await expiryWorker.runExpiry(TENANT, false);
    expect('totalCreditsExpired' in result).toBe(true);
    if ('totalCreditsExpired' in result) {
      expect(result.totalCreditsExpired).toBe(1);
      expect(result.totalPointsExpired).toBe(100);
    }

    // Should have inserted a debit entry
    const expiryEntry = db.ledger.find((l) => l.reasonCode === 'expire');
    expect(expiryEntry).toBeTruthy();
    expect(expiryEntry!.delta).toBe(-100);
    expect(expiryEntry!.refLedgerId).toBe('credit-1');

    // Should have published event
    const expiryEvent = publisher.events.find((e) => e.eventType === 'points.expired');
    expect(expiryEvent).toBeTruthy();
  });

  it('skips credits that are not yet expired', async () => {
    const { db, expiryWorker } = setupWithExpiry();

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.ledger.push({
      id: 'credit-future',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 50,
      balanceAfter: 50,
      reasonCode: 'earn',
      expiresAt: futureDate,
      createdAt: new Date().toISOString(),
    });

    const result = await expiryWorker.runExpiry(TENANT, false);
    if ('totalCreditsExpired' in result) {
      expect(result.totalCreditsExpired).toBe(0);
    }
  });

  it('skips tenant with no expiry configured', async () => {
    const { expiryWorker } = setupWithExpiry({ pointsExpiryMonths: undefined });
    const result = await expiryWorker.runExpiry(TENANT, false);
    if ('totalCreditsExpired' in result) {
      expect(result.totalCreditsExpired).toBe(0);
    }
  });

  it('does not double-expire already expired credits', async () => {
    const { db, expiryWorker } = setupWithExpiry();

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.ledger.push({
      id: 'credit-2',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 100,
      balanceAfter: 100,
      reasonCode: 'earn',
      expiresAt: pastDate,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    // Add an existing expiry debit referencing credit-2
    db.ledger.push({
      id: 'expire-debit-2',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: -100,
      balanceAfter: 0,
      reasonCode: 'expire',
      refLedgerId: 'credit-2',
      createdAt: new Date().toISOString(),
    });

    const result = await expiryWorker.runExpiry(TENANT, false);
    if ('totalCreditsExpired' in result) {
      expect(result.totalCreditsExpired).toBe(0);
    }
  });
});

// --- Dry-run endpoint ---

describe('POST /v1/admin/expiry/dry-run', () => {
  it('returns preview without writing ledger entries', async () => {
    const { app, db } = setupWithExpiry();

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.ledger.push({
      id: 'credit-dr-1',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 200,
      balanceAfter: 200,
      reasonCode: 'earn',
      expiresAt: pastDate,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const ledgerLenBefore = db.ledger.length;

    const res = await request(app)
      .post('/v1/admin/expiry/dry-run')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalCreditsToExpire).toBe(1);
    expect(res.body.totalPointsToExpire).toBe(200);
    expect(res.body.memberBreakdown).toHaveLength(1);
    expect(res.body.memberBreakdown[0].memberId).toBe(MEMBER_A);

    // No new ledger entries written
    expect(db.ledger.length).toBe(ledgerLenBefore);
  });

  it('rejects non-admin users', async () => {
    const { app } = setupWithExpiry();
    const res = await request(app)
      .post('/v1/admin/expiry/dry-run')
      .set(userHeaders());
    expect(res.status).toBe(403);
  });
});

// --- Backfill endpoint ---

describe('POST /v1/admin/expiry/backfill', () => {
  it('sets expires_at for earn entries without expiry', async () => {
    const { app, db } = setupWithExpiry();

    db.ledger.push({
      id: 'old-credit-1',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 300,
      balanceAfter: 300,
      reasonCode: 'earn',
      createdAt: '2025-01-15T10:00:00.000Z',
    });

    const res = await request(app)
      .post('/v1/admin/expiry/backfill')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalUpdated).toBe(1);

    // Verify the entry now has expiresAt
    const entry = db.ledger.find((l) => l.id === 'old-credit-1');
    expect(entry!.expiresAt).toBeTruthy();
    const expiresDate = new Date(entry!.expiresAt!);
    expect(expiresDate.getUTCFullYear()).toBe(2026);
  });

  it('returns empty when no expiry configured', async () => {
    const { app } = setupWithExpiry({ pointsExpiryMonths: undefined });

    const res = await request(app)
      .post('/v1/admin/expiry/backfill')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalUpdated).toBe(0);
  });
});

// --- Notification warning ---

describe('ExpiryWorker notification warnings', () => {
  it('sends warnings for credits expiring in configured days', async () => {
    const { db, expiryWorker, publisher } = setupWithExpiry();

    // Add credit expiring in 30 days
    const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 3600000); // 30 days + 1hr into window
    db.ledger.push({
      id: 'credit-warning-1',
      tenantId: TENANT,
      memberId: MEMBER_A,
      delta: 500,
      balanceAfter: 500,
      reasonCode: 'earn',
      expiresAt: in30days.toISOString(),
      createdAt: new Date().toISOString(),
    });

    const count = await expiryWorker.runExpiryWarnings(TENANT);
    expect(count).toBeGreaterThanOrEqual(1);

    const notifEvent = publisher.events.find((e) => e.eventType === 'notification.send');
    expect(notifEvent).toBeTruthy();
    expect((notifEvent!.payload as Record<string, unknown>).templateKey).toBe(
      'points_expiry_reminder_30d',
    );
  });

  it('skips tenant with no notification days configured', async () => {
    const { expiryWorker } = setupWithExpiry({ expiryNotificationDays: undefined });
    const count = await expiryWorker.runExpiryWarnings(TENANT);
    expect(count).toBe(0);
  });
});

// --- Transaction flow sets expires_at when expiry configured ---

describe('Transaction creates ledger entry with expires_at', () => {
  it('sets expires_at when pointsExpiryMonths is configured', async () => {
    const { app, db } = setupWithExpiry({ pointsExpiryMonths: 6 });

    const res = await request(app)
      .post('/v1/transactions')
      .set({
        'x-tenant-id': TENANT,
        'x-user-id': 'tester',
        'idempotency-key': 'exp-txn-' + Date.now(),
      })
      .send({ memberId: MEMBER_A, channel: 'pos', amount: 1000, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(db.ledger.length).toBe(1);
    expect(db.ledger[0]!.expiresAt).toBeTruthy();

    const expiresDate = new Date(db.ledger[0]!.expiresAt!);
    const now = new Date();
    // Should be roughly 6 months in the future
    const diffMonths =
      (expiresDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (expiresDate.getUTCMonth() - now.getUTCMonth());
    expect(diffMonths).toBeGreaterThanOrEqual(5);
    expect(diffMonths).toBeLessThanOrEqual(7);
  });

  it('does NOT set expires_at when pointsExpiryMonths is null', async () => {
    const { app, db } = setupWithExpiry({ pointsExpiryMonths: undefined });

    const res = await request(app)
      .post('/v1/transactions')
      .set({
        'x-tenant-id': TENANT,
        'x-user-id': 'tester',
        'idempotency-key': 'no-exp-txn-' + Date.now(),
      })
      .send({ memberId: MEMBER_A, channel: 'pos', amount: 1000, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(db.ledger[0]!.expiresAt).toBeUndefined();
  });
});
