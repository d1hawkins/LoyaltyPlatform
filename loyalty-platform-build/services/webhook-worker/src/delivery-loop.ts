import type { Logger } from '@loyalty/shared-logger';
import { WebhookRepository, WebhookDeliveryRow } from './repository';
import { nextAttemptAt } from './backoff';
import { formatSignatureHeader } from './signer';

export interface HttpResponse {
  status: number;
}

export interface HttpError {
  kind: 'network' | 'timeout';
  message: string;
}

export type HttpResult = { ok: true; response: HttpResponse } | { ok: false; error: HttpError };

export interface HttpSender {
  (opts: {
    url: string;
    body: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<HttpResult>;
}

export interface DeliveryLoopDeps {
  repo: WebhookRepository;
  http: HttpSender;
  logger: Logger;
  now?: () => Date;
  httpTimeoutMs?: number;
  onDead?: (row: WebhookDeliveryRow) => Promise<void> | void;
}

/**
 * Process a single claimed delivery row. Returns the terminal/interim status.
 */
export async function processDelivery(
  deps: DeliveryLoopDeps,
  row: WebhookDeliveryRow,
): Promise<'delivered' | 'failed' | 'retry' | 'dead'> {
  const now = (deps.now ?? (() => new Date()))();
  const timeoutMs = deps.httpTimeoutMs ?? 10_000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Loyalty-Event': row.event_type,
    'X-Loyalty-Signature': formatSignatureHeader(row.signature),
    'X-Loyalty-Delivery-Id': row.delivery_id,
    'X-Loyalty-Timestamp': now.toISOString(),
  };

  const result = await deps.http({
    url: row.target_url,
    body: row.payload,
    headers,
    timeoutMs,
  });

  if (result.ok) {
    const code = result.response.status;
    if (code >= 200 && code < 300) {
      await deps.repo.markDelivered(row.delivery_id, code, now);
      deps.logger.info(
        { deliveryId: row.delivery_id, status: code },
        'webhook.delivery.success',
      );
      return 'delivered';
    }
    if (code >= 400 && code < 500) {
      await deps.repo.markFailedPermanent(
        row.delivery_id,
        code,
        `HTTP ${code}`,
        now,
      );
      deps.logger.warn(
        { deliveryId: row.delivery_id, status: code },
        'webhook.delivery.failed_permanent',
      );
      return 'failed';
    }
    // 5xx → retry
    return await scheduleOrDie(deps, row, code, `HTTP ${code}`, now);
  }

  // network / timeout → retry
  return await scheduleOrDie(deps, row, null, `${result.error.kind}: ${result.error.message}`, now);
}

async function scheduleOrDie(
  deps: DeliveryLoopDeps,
  row: WebhookDeliveryRow,
  statusCode: number | null,
  errorMessage: string,
  now: Date,
): Promise<'retry' | 'dead'> {
  const nextAttempt = row.attempt + 1;
  if (nextAttempt >= row.max_attempts) {
    await deps.repo.markDead(row.delivery_id, statusCode, errorMessage, now);
    deps.logger.error(
      { deliveryId: row.delivery_id, attempts: nextAttempt, statusCode },
      'webhook.delivery.dead',
    );
    if (deps.onDead) {
      try {
        await deps.onDead({ ...row, attempt: nextAttempt });
      } catch (err) {
        deps.logger.error({ err }, 'webhook.delivery.onDead.failed');
      }
    }
    return 'dead';
  }
  const nextAt = nextAttemptAt(now, nextAttempt);
  await deps.repo.scheduleRetry(row.delivery_id, nextAttempt, nextAt, statusCode, errorMessage, now);
  deps.logger.warn(
    { deliveryId: row.delivery_id, attempt: nextAttempt, nextAt, statusCode },
    'webhook.delivery.retry_scheduled',
  );
  return 'retry';
}

export interface TickOptions {
  batchSize: number;
}

export async function runDeliveryTick(
  deps: DeliveryLoopDeps,
  opts: TickOptions,
): Promise<{ processed: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const claimed = await deps.repo.claimPendingBatch(opts.batchSize, now);
  for (const row of claimed) {
    await processDelivery(deps, row);
  }
  return { processed: claimed.length };
}

export function startDeliveryLoop(
  deps: DeliveryLoopDeps,
  opts: TickOptions & { intervalMs: number },
): { stop: () => void } {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await runDeliveryTick(deps, opts);
    } catch (err) {
      deps.logger.error({ err }, 'webhook.delivery.tick.failed');
    } finally {
      if (!stopped) setTimeout(tick, opts.intervalMs);
    }
  };
  setTimeout(tick, opts.intervalMs);
  return {
    stop: () => {
      stopped = true;
    },
  };
}
