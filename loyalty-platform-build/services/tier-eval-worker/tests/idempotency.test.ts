import { createLogger } from '@loyalty/shared-logger';
import { EVENT_TYPES, type EventEnvelope, type PointsEarnedPayloadV1 } from '@loyalty/shared-events';
import { InMemoryTierRepository } from '../src/repository.memory';
import { InMemoryDedupeStore } from '../src/dedupe';
import { processMessage, type WorkerDeps } from '../src/worker';

process.env.LOG_LEVEL = 'silent';
const logger = createLogger('tier-eval-worker-test');
const TENANT = 'tenant-idem';

function setup() {
  const repo = new InMemoryTierRepository();
  repo.seedTenant(
    TENANT,
    [
      { id: 'bronze', name: 'Bronze', minPoints: 0, sortOrder: 1 },
      { id: 'silver', name: 'Silver', minPoints: 500, sortOrder: 2 },
    ],
    [{ memberId: 'm1', tenantId: TENANT, tierId: 'bronze', lastTransactionAt: null }],
  );
  repo.addLedger(TENANT, { memberId: 'm1', delta: 600, createdAt: new Date() });

  const published: unknown[] = [];
  const applySpy = jest.spyOn(repo, 'applyTierChange');

  const deps: WorkerDeps = {
    repo,
    dedupe: new InMemoryDedupeStore(),
    publisher: {
      publish: async (...args) => {
        published.push(args);
      },
    },
    cache: { del: async () => 0 },
    logger,
  };
  return { repo, deps, published, applySpy };
}

const envelope: EventEnvelope<PointsEarnedPayloadV1> = {
  eventId: 'evt-A',
  eventType: EVENT_TYPES.POINTS_EARNED,
  tenantId: TENANT,
  timestamp: '2026-04-09T12:00:00Z',
  version: '1.0',
  payload: {
    memberId: 'm1',
    transactionId: 'tx',
    ledgerId: 'lg',
    delta: 600,
    newBalance: 600,
    channel: 'pos',
    reasonCode: 'earn',
  },
};

describe('dedupe / idempotency', () => {
  it('processes the first delivery and skips subsequent duplicates with the same messageId', async () => {
    const { deps, published, applySpy } = setup();

    const first = await processMessage(deps, envelope, 'dup-msg');
    expect(first.outcome).toBe('upgraded');

    const second = await processMessage(deps, envelope, 'dup-msg');
    expect(second.outcome).toBe('skipped_duplicate');

    const third = await processMessage(deps, envelope, 'dup-msg');
    expect(third.outcome).toBe('skipped_duplicate');

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
  });

  it('treats distinct messageIds as distinct deliveries even for the same eventId', async () => {
    const { deps } = setup();
    const a = await processMessage(deps, envelope, 'msg-A');
    const b = await processMessage(deps, envelope, 'msg-B');
    // First upgrades bronze → silver, second no-ops (already silver)
    expect(a.outcome).toBe('upgraded');
    expect(b.outcome).toBe('noop');
  });
});
