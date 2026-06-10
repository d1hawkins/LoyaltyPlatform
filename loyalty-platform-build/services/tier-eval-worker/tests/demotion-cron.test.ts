import { createLogger } from '@loyalty/shared-logger';
import { EVENT_TYPES } from '@loyalty/shared-events';
import { InMemoryTierRepository } from '../src/repository.memory';
import { InMemoryDedupeStore } from '../src/dedupe';
import { runDemotionScan, type WorkerDeps } from '../src/worker';
import { msUntilNext, parseDailyCron } from '../src/index';

process.env.LOG_LEVEL = 'silent';
const logger = createLogger('tier-eval-worker-test');
const TENANT = 'tenant-demote';

function setup() {
  const repo = new InMemoryTierRepository();
  repo.seedTenant(
    TENANT,
    [
      { id: 'bronze', name: 'Bronze', minPoints: 0, sortOrder: 1 },
      { id: 'silver', name: 'Silver', minPoints: 500, sortOrder: 2 },
      { id: 'gold', name: 'Gold', minPoints: 2000, sortOrder: 3 },
    ],
    [
      {
        memberId: 'stale-gold',
        tenantId: TENANT,
        tierId: 'gold',
        // last tx 60 days ago
        lastTransactionAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        memberId: 'stale-silver',
        tenantId: TENANT,
        tierId: 'silver',
        lastTransactionAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        memberId: 'fresh-gold',
        tenantId: TENANT,
        tierId: 'gold',
        lastTransactionAt: new Date().toISOString(),
      },
    ],
  );
  // stale-gold has 400 points (below silver) → should drop to bronze
  repo.addLedger(TENANT, { memberId: 'stale-gold', delta: 400, createdAt: new Date() });
  // stale-silver has 600 points (still qualifies for silver) → no change
  repo.addLedger(TENANT, { memberId: 'stale-silver', delta: 600, createdAt: new Date() });
  // fresh-gold has 2500 but is skipped because last tx is recent
  repo.addLedger(TENANT, { memberId: 'fresh-gold', delta: 2500, createdAt: new Date() });

  const published: Array<{ topic: string }> = [];
  const deps: WorkerDeps = {
    repo,
    dedupe: new InMemoryDedupeStore(),
    publisher: {
      publish: async (topic) => {
        published.push({ topic });
      },
    },
    cache: { del: async () => 0 },
    logger,
  };
  return { repo, deps, published };
}

describe('runDemotionScan', () => {
  it('demotes stale members below their current tier, skips fresh members', async () => {
    const { repo, deps, published } = setup();

    const summary = await runDemotionScan(deps, 30);

    expect(summary.scanned).toBe(2); // only the two stale members
    expect(summary.demoted).toBe(1);
    expect(summary.errors).toBe(0);

    expect(repo.membersByTenant.get(TENANT)?.get('stale-gold')?.tierId).toBe('bronze');
    expect(repo.membersByTenant.get(TENANT)?.get('stale-silver')?.tierId).toBe('silver');
    expect(repo.membersByTenant.get(TENANT)?.get('fresh-gold')?.tierId).toBe('gold');

    expect(published).toHaveLength(1);
    expect(published[0]!.topic).toBe(EVENT_TYPES.TIER_DOWNGRADED);

    expect(repo.history).toHaveLength(1);
    expect(repo.history[0]!.reason).toBe('auto_demotion');
    expect(repo.history[0]!.memberId).toBe('stale-gold');
  });

  it('isolates per-member failures so one bad write does not poison the batch', async () => {
    const { repo, deps } = setup();
    jest
      .spyOn(repo, 'applyTierChange')
      .mockRejectedValueOnce(new Error('deadlock'));
    const summary = await runDemotionScan(deps, 30);
    expect(summary.errors).toBe(1);
  });
});

describe('cron expression helpers', () => {
  it('parses a daily cron expression', () => {
    expect(parseDailyCron('0 3 * * *')).toEqual({ minute: 0, hour: 3 });
    expect(parseDailyCron('30 14 * * *')).toEqual({ minute: 30, hour: 14 });
  });

  it('rejects unsupported cron expressions', () => {
    expect(() => parseDailyCron('* * * * *')).toThrow();
    expect(() => parseDailyCron('0 3 1 * *')).toThrow();
    expect(() => parseDailyCron('bad')).toThrow();
    expect(() => parseDailyCron('60 3 * * *')).toThrow();
    expect(() => parseDailyCron('0 24 * * *')).toThrow();
  });

  it('computes the ms delay until the next daily run', () => {
    const from = new Date('2026-04-09T12:00:00Z');
    const delay = msUntilNext({ hour: 3, minute: 0 }, from);
    // 15h from 12:00 to next 03:00
    expect(delay).toBe(15 * 60 * 60 * 1000);

    const from2 = new Date('2026-04-09T02:00:00Z');
    const delay2 = msUntilNext({ hour: 3, minute: 0 }, from2);
    expect(delay2).toBe(60 * 60 * 1000);
  });
});
