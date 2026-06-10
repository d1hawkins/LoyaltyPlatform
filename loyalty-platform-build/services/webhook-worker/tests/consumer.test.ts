import { InMemoryWebhookRepository } from '../src/repository';
import { handleEventEnvelope } from '../src/consumer';
import { computeSignature } from '../src/signer';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => silentLogger,
  level: 'silent',
} as unknown as import('@loyalty/shared-logger').Logger;

const baseEnvelope = {
  eventId: '11111111-1111-1111-1111-111111111111',
  eventType: 'points.earned',
  tenantId: 'tenant-1',
  timestamp: '2026-04-09T00:00:00.000Z',
  version: '1',
  payload: { memberId: 'm1', transactionId: 't1', points: 10, balanceAfter: 100 },
};

describe('consumer fan-out', () => {
  it('inserts a delivery row per active matching hook with a valid signature', async () => {
    const repo = new InMemoryWebhookRepository();
    repo.hooks.push(
      {
        hook_id: 'h1',
        event_type: 'points.earned',
        target_url: 'https://a.test/hook',
        secret_encrypted: 'plain:secret-a',
        is_active: true,
      },
      {
        hook_id: 'h2',
        event_type: 'points.earned',
        target_url: 'https://b.test/hook',
        secret_encrypted: 'plain:secret-b',
        is_active: true,
      },
      {
        hook_id: 'h3',
        event_type: 'points.earned',
        target_url: 'https://c.test/hook',
        secret_encrypted: 'plain:secret-c',
        is_active: false,
      },
      {
        hook_id: 'h4',
        event_type: 'tier.upgraded',
        target_url: 'https://d.test/hook',
        secret_encrypted: 'plain:secret-d',
        is_active: true,
      },
    );

    const inserted = await handleEventEnvelope(
      { repo, logger: silentLogger },
      baseEnvelope,
    );
    expect(inserted).toBe(2);

    const rows = await repo.listDeliveries({});
    expect(rows.map((r) => r.hook_id).sort()).toEqual(['h1', 'h2']);

    // Verify signature matches secret-a for the h1 row
    const h1Row = rows.find((r) => r.hook_id === 'h1')!;
    const expected = computeSignature('secret-a', baseEnvelope.timestamp, h1Row.payload);
    expect(h1Row.signature).toBe(expected);
  });

  it('is idempotent on duplicate redelivery of the same eventId per hook', async () => {
    const repo = new InMemoryWebhookRepository();
    repo.hooks.push({
      hook_id: 'h1',
      event_type: 'points.earned',
      target_url: 'https://a.test/hook',
      secret_encrypted: 'plain:s',
      is_active: true,
    });
    await handleEventEnvelope({ repo, logger: silentLogger }, baseEnvelope);
    await handleEventEnvelope({ repo, logger: silentLogger }, baseEnvelope);
    const rows = await repo.listDeliveries({});
    expect(rows.length).toBe(1);
  });

  it('returns 0 when no hooks match the event type', async () => {
    const repo = new InMemoryWebhookRepository();
    const inserted = await handleEventEnvelope(
      { repo, logger: silentLogger },
      { ...baseEnvelope, eventType: 'member.updated' },
    );
    expect(inserted).toBe(0);
  });
});
