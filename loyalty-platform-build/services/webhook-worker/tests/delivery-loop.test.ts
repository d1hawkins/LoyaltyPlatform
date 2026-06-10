import { InMemoryWebhookRepository, WebhookDeliveryRow } from '../src/repository';
import {
  HttpSender,
  HttpResult,
  processDelivery,
  runDeliveryTick,
} from '../src/delivery-loop';

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

function makeRow(
  repo: InMemoryWebhookRepository,
  overrides: Partial<Parameters<InMemoryWebhookRepository['insertDelivery']>[0]> = {},
) {
  return repo.insertDelivery({
    hook_id: 'hook-1',
    event_id: `evt-${Math.random()}`,
    event_type: 'points.earned',
    target_url: 'https://example.test/webhook',
    payload: '{"x":1}',
    signature: 'deadbeef',
    ...overrides,
  });
}

function senderSequence(results: HttpResult[]): HttpSender {
  let i = 0;
  return async () => {
    const r = results[i++] ?? results[results.length - 1];
    return r as HttpResult;
  };
}

function first<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('expected non-empty array');
  return arr[0] as T;
}

describe('delivery loop state machine', () => {
  it('marks delivered on 2xx', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo);
    const http = senderSequence([{ ok: true, response: { status: 200 } }]);
    const claimed = await repo.claimPendingBatch(10, new Date());
    await processDelivery({ repo, http, logger: silentLogger }, first(claimed));
    const after = first(await repo.listDeliveries({}));
    expect(after.status).toBe('delivered');
    expect(after.last_status_code).toBe(200);
  });

  it('permanently fails on 404 without retry', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo);
    const http = senderSequence([{ ok: true, response: { status: 404 } }]);
    const claimed = await repo.claimPendingBatch(10, new Date());
    const result = await processDelivery(
      { repo, http, logger: silentLogger },
      first(claimed),
    );
    expect(result).toBe('failed');
    const row = first(await repo.listDeliveries({}));
    expect(row.status).toBe('failed');
    expect(row.last_status_code).toBe(404);
    expect(row.attempt).toBe(0);
  });

  it('schedules a retry on 503 with backoff', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo);
    const now = new Date(Date.now() + 60_000);
    const http = senderSequence([{ ok: true, response: { status: 503 } }]);
    const claimed = await repo.claimPendingBatch(10, now);
    const result = await processDelivery(
      { repo, http, logger: silentLogger, now: () => now },
      first(claimed),
    );
    expect(result).toBe('retry');
    const row = first(await repo.listDeliveries({}));
    expect(row.status).toBe('pending');
    expect(row.attempt).toBe(1);
    expect(row.next_attempt_at!.getTime() - now.getTime()).toBeGreaterThanOrEqual(29_000);
  });

  it('dead-letters after 5 attempts on persistent 503', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo);
    const http = senderSequence([{ ok: true, response: { status: 503 } }]);

    let now = new Date(Date.now() + 60_000);
    const bump = () => {
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    };

    const onDead = jest.fn();

    for (let i = 0; i < 5; i++) {
      const claimed = await repo.claimPendingBatch(10, now);
      expect(claimed.length).toBe(1);
      await processDelivery(
        { repo, http, logger: silentLogger, now: () => now, onDead },
        first(claimed),
      );
      bump();
    }

    const row = first(await repo.listDeliveries({}));
    expect(row.status).toBe('dead');
    expect(row.attempt).toBe(5);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('retries on network error then succeeds', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo);
    const http = senderSequence([
      { ok: false, error: { kind: 'network', message: 'econnreset' } },
      { ok: true, response: { status: 202 } },
    ]);
    const now1 = new Date(Date.now() + 1000);
    let claimed = await repo.claimPendingBatch(10, now1);
    await processDelivery(
      { repo, http, logger: silentLogger, now: () => now1 },
      first(claimed),
    );
    let row: WebhookDeliveryRow = first(await repo.listDeliveries({}));
    expect(row.status).toBe('pending');
    expect(row.attempt).toBe(1);

    const now2 = new Date(row.next_attempt_at!.getTime() + 1000);
    claimed = await repo.claimPendingBatch(10, now2);
    expect(claimed.length).toBe(1);
    await processDelivery(
      { repo, http, logger: silentLogger, now: () => now2 },
      first(claimed),
    );
    row = first(await repo.listDeliveries({}));
    expect(row.status).toBe('delivered');
  });

  it('runDeliveryTick processes the entire claimed batch', async () => {
    const repo = new InMemoryWebhookRepository();
    await makeRow(repo, { event_id: 'e1' });
    await makeRow(repo, { event_id: 'e2' });
    const http = senderSequence([{ ok: true, response: { status: 200 } }]);
    const result = await runDeliveryTick(
      { repo, http, logger: silentLogger },
      { batchSize: 10 },
    );
    expect(result.processed).toBe(2);
    const rows = await repo.listDeliveries({});
    expect(rows.every((r) => r.status === 'delivered')).toBe(true);
  });
});
