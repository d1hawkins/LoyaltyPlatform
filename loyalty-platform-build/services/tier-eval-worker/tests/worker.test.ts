import { createLogger } from '@loyalty/shared-logger';
import { EVENT_TYPES, type EventEnvelope, type PointsEarnedPayloadV1 } from '@loyalty/shared-events';
import { InMemoryTierRepository } from '../src/repository.memory';
import { InMemoryDedupeStore } from '../src/dedupe';
import { processMessage, type WorkerDeps } from '../src/worker';
import type { TierRow } from '../src/evaluator';

process.env.LOG_LEVEL = 'silent';
const logger = createLogger('tier-eval-worker-test');

const TENANT = 'tenant-1';

const tiers: TierRow[] = [
  { id: 'bronze', name: 'Bronze', minPoints: 0, sortOrder: 1 },
  { id: 'silver', name: 'Silver', minPoints: 500, sortOrder: 2 },
  { id: 'gold', name: 'Gold', minPoints: 2000, sortOrder: 3 },
];

function makeDeps() {
  const repo = new InMemoryTierRepository();
  repo.seedTenant(TENANT, tiers, [
    {
      memberId: 'm1',
      tenantId: TENANT,
      tierId: 'bronze',
      lastTransactionAt: new Date().toISOString(),
    },
  ]);
  const published: Array<{ topic: string; payload: unknown; tenantId: string }> = [];
  const cacheDeleted: string[] = [];
  const deps: WorkerDeps = {
    repo,
    dedupe: new InMemoryDedupeStore(),
    publisher: {
      publish: async (topic, _type, payload, tenantId) => {
        published.push({ topic, payload, tenantId });
      },
    },
    cache: {
      del: async (k: string) => {
        cacheDeleted.push(k);
        return 1;
      },
    },
    logger,
    now: () => new Date('2026-04-09T12:00:00Z'),
  };
  return { repo, deps, published, cacheDeleted };
}

function makeEarnedEnvelope(overrides: Partial<PointsEarnedPayloadV1> = {}): EventEnvelope<PointsEarnedPayloadV1> {
  return {
    eventId: 'evt-1',
    eventType: EVENT_TYPES.POINTS_EARNED,
    tenantId: TENANT,
    timestamp: '2026-04-09T12:00:00Z',
    version: '1.0',
    payload: {
      memberId: 'm1',
      transactionId: 'tx-1',
      ledgerId: 'lg-1',
      delta: 600,
      newBalance: 600,
      channel: 'pos',
      reasonCode: 'earn',
      ...overrides,
    },
  };
}

describe('worker.processMessage', () => {
  it('upgrades a member when rolling points cross a tier boundary', async () => {
    const { repo, deps, published, cacheDeleted } = makeDeps();
    repo.addLedger(TENANT, {
      memberId: 'm1',
      delta: 600,
      createdAt: new Date('2026-04-09T11:00:00Z'),
    });

    const result = await processMessage(deps, makeEarnedEnvelope(), 'msg-1');

    expect(result.outcome).toBe('upgraded');
    expect(repo.membersByTenant.get(TENANT)?.get('m1')?.tierId).toBe('silver');
    expect(published).toHaveLength(1);
    expect(published[0]!.topic).toBe(EVENT_TYPES.TIER_UPGRADED);
    expect(published[0]!.payload).toMatchObject({
      memberId: 'm1',
      previousTierId: 'bronze',
      newTierId: 'silver',
      rollingPoints: 600,
      triggerEventId: 'evt-1',
    });
    expect(cacheDeleted).toEqual([`tenant:${TENANT}:member:m1:balance`]);
    expect(repo.history).toHaveLength(1);
    expect(repo.history[0]!.reason).toBe('auto_promotion');
  });

  it('no-ops when the member is already in the correct tier', async () => {
    const { repo, deps, published } = makeDeps();
    repo.addLedger(TENANT, {
      memberId: 'm1',
      delta: 100,
      createdAt: new Date('2026-04-09T11:00:00Z'),
    });

    const result = await processMessage(deps, makeEarnedEnvelope(), 'msg-2');

    expect(result.outcome).toBe('noop');
    expect(published).toHaveLength(0);
  });

  it('downgrades on a void that drops rolling points below the current tier floor', async () => {
    const { repo, deps, published } = makeDeps();
    // Member starts in silver
    repo.membersByTenant.get(TENANT)!.get('m1')!.tierId = 'silver';
    repo.addLedger(TENANT, {
      memberId: 'm1',
      delta: 400, // below silver threshold of 500
      createdAt: new Date('2026-04-09T11:00:00Z'),
    });

    const envelope = {
      eventId: 'evt-void',
      eventType: EVENT_TYPES.TRANSACTION_VOIDED,
      tenantId: TENANT,
      timestamp: '2026-04-09T12:00:00Z',
      version: '1.0',
      payload: {
        memberId: 'm1',
        transactionId: 'tx-1',
        originalLedgerId: 'lg-1',
        reversalLedgerId: 'lg-2',
        delta: -200,
        newBalance: 400,
        reason: 'customer return',
      },
    };

    const result = await processMessage(deps, envelope, 'msg-void-1');

    expect(result.outcome).toBe('downgraded');
    expect(repo.membersByTenant.get(TENANT)?.get('m1')?.tierId).toBe('bronze');
    expect(published[0]!.topic).toBe(EVENT_TYPES.TIER_DOWNGRADED);
    expect(repo.history[0]!.reason).toBe('auto_demotion');
  });

  it('dead-letters a malformed envelope', async () => {
    const { deps } = makeDeps();
    const result = await processMessage(deps, { garbage: true }, 'msg-bad');
    expect(result.outcome).toBe('dead_letter');
    expect(result.detail).toMatch(/malformed_envelope/);
  });

  it('dead-letters a malformed payload', async () => {
    const { deps } = makeDeps();
    const bad = {
      eventId: 'e',
      eventType: EVENT_TYPES.POINTS_EARNED,
      tenantId: TENANT,
      timestamp: 't',
      version: '1.0',
      payload: { memberId: 'm1' }, // missing required fields
    };
    const result = await processMessage(deps, bad, 'msg-bad2');
    expect(result.outcome).toBe('dead_letter');
    expect(result.detail).toMatch(/malformed_points_earned/);
  });

  it('dead-letters an unsupported event type', async () => {
    const { deps } = makeDeps();
    const bad = {
      eventId: 'e',
      eventType: 'member.enrolled',
      tenantId: TENANT,
      timestamp: 't',
      version: '1.0',
      payload: {},
    };
    const result = await processMessage(deps, bad, 'msg-bad3');
    expect(result.outcome).toBe('dead_letter');
    expect(result.detail).toMatch(/unsupported_event_type/);
  });

  it('returns member_not_found when the member has been deleted', async () => {
    const { deps } = makeDeps();
    const env = makeEarnedEnvelope({ memberId: 'ghost' });
    const result = await processMessage(deps, env, 'msg-ghost');
    expect(result.outcome).toBe('member_not_found');
  });

  it('dead-letters a message with no messageId', async () => {
    const { deps } = makeDeps();
    const result = await processMessage(deps, makeEarnedEnvelope(), undefined);
    expect(result.outcome).toBe('dead_letter');
    expect(result.detail).toBe('missing_message_id');
  });

  it('lets transient repo errors bubble so Service Bus can redeliver', async () => {
    const { deps, repo } = makeDeps();
    repo.addLedger(TENANT, {
      memberId: 'm1',
      delta: 600,
      createdAt: new Date('2026-04-09T11:00:00Z'),
    });
    const boom = new Error('deadlock');
    jest.spyOn(repo, 'applyTierChange').mockRejectedValueOnce(boom);
    await expect(processMessage(deps, makeEarnedEnvelope(), 'msg-err')).rejects.toThrow('deadlock');
  });
});
