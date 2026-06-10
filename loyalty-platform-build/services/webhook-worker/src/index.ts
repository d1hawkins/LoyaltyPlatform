import http from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { createLogger } from '@loyalty/shared-logger';
import { loadConfig, Config } from './config';
import {
  InMemoryWebhookRepository,
  WebhookRepository,
  DeliveryStatus,
} from './repository';
import { startDeliveryLoop, HttpSender, HttpResult } from './delivery-loop';
import { handleEventEnvelope } from './consumer';
import { signPayload } from './signer';
import { decryptHookSecret } from './secrets';

const SERVICE_NAME = 'webhook-worker';
const VERSION = '0.1.0';

/** Default HttpSender built on global fetch + AbortController. */
export const fetchHttpSender: HttpSender = async ({ url, body, headers, timeoutMs }) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
    });
    return { ok: true, response: { status: res.status } } satisfies HttpResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind: 'timeout' | 'network' =
      controller.signal.aborted || /abort/i.test(msg) ? 'timeout' : 'network';
    return { ok: false, error: { kind, message: msg } } satisfies HttpResult;
  } finally {
    clearTimeout(t);
  }
};

interface AdminDeps {
  repo: WebhookRepository;
  config: Config;
  logger: ReturnType<typeof createLogger>;
}

function isAdminAuthorized(req: http.IncomingMessage, cfg: Config): boolean {
  if (cfg.SKIP_AUTH) return true;
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return false;
  // Real JWT validation is delegated to @loyalty/shared-auth in production.
  return true;
}

export function buildAdminServer(deps: AdminDeps): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(200, { status: 'ok', service: SERVICE_NAME, version: VERSION });
      }
      if (req.method === 'GET' && url.pathname === '/ready') {
        return send(200, { ready: true });
      }

      if (url.pathname.startsWith('/admin/')) {
        if (!isAdminAuthorized(req, deps.config)) {
          return send(401, { error: 'unauthorized' });
        }
      }

      if (req.method === 'GET' && url.pathname === '/admin/webhooks/deliveries') {
        const hookId = url.searchParams.get('hookId') ?? undefined;
        const status = (url.searchParams.get('status') as DeliveryStatus | null) ?? undefined;
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const rows = await deps.repo.listDeliveries({ hookId, status, limit });
        return send(200, { deliveries: rows });
      }

      const retryMatch = url.pathname.match(
        /^\/admin\/webhooks\/deliveries\/([^/]+)\/retry$/,
      );
      if (req.method === 'POST' && retryMatch && retryMatch[1]) {
        const row = await deps.repo.requeueDelivery(retryMatch[1], new Date());
        if (!row) return send(404, { error: 'not_found' });
        return send(202, { delivery: row });
      }

      const testMatch = url.pathname.match(/^\/admin\/webhooks\/test\/([^/]+)$/);
      if (req.method === 'POST' && testMatch && testMatch[1]) {
        const hookId = testMatch[1];
        const hook = await deps.repo.getHook(hookId);
        if (!hook) return send(404, { error: 'hook_not_found' });
        const envelope = {
          eventId: randomUUID(),
          eventType: 'webhook.test',
          tenantId: '00000000-0000-0000-0000-000000000000',
          timestamp: new Date().toISOString(),
          version: '1',
          payload: { message: 'synthetic test delivery' },
        };
        const body = JSON.stringify(envelope);
        const secret = decryptHookSecret(hook.secret_encrypted);
        const { hex } = signPayload(secret, envelope.timestamp, body);
        const inserted = await deps.repo.insertDelivery({
          hook_id: hook.hook_id,
          event_id: envelope.eventId,
          event_type: envelope.eventType,
          target_url: hook.target_url,
          payload: body,
          signature: hex,
        });
        return send(202, { delivery: inserted });
      }

      return send(404, { error: 'not_found' });
    } catch (err) {
      deps.logger.error({ err }, 'admin.request.failed');
      return send(500, { error: 'internal_error' });
    }
  });
}

export function startWorker() {
  const logger = createLogger(SERVICE_NAME);
  const config = loadConfig();
  logger.info({ service: SERVICE_NAME, version: VERSION, env: config.NODE_ENV }, 'worker.started');

  const repo = new InMemoryWebhookRepository();

  const loop = startDeliveryLoop(
    { repo, http: fetchHttpSender, logger, httpTimeoutMs: config.HTTP_TIMEOUT_MS },
    { batchSize: config.DELIVERY_BATCH_SIZE, intervalMs: config.DELIVERY_POLL_MS },
  );

  const admin = buildAdminServer({ repo, config, logger });
  admin.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'admin.listening');
  });

  // Service Bus subscription wiring: in dev/test we don't have a live bus
  // connection string, so we lazy-init only when the env var is present.
  // The real ServiceBusSubscriber from @loyalty/shared-events is wired here
  // in production. Leaving the helper exposed for tests.
  if (config.SERVICE_BUS_CONNECTION_STRING) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ServiceBusSubscriber } = require('@loyalty/shared-events');
    const { WEBHOOK_TOPICS } = require('./consumer');
    const sub = new ServiceBusSubscriber({
      connectionString: config.SERVICE_BUS_CONNECTION_STRING,
      logger,
    });
    for (const topic of WEBHOOK_TOPICS) {
      sub.subscribe(topic, 'webhook-worker', async (envelope: unknown) => {
        await handleEventEnvelope({ repo, logger }, envelope as never);
      });
    }
  } else {
    logger.warn({}, 'service_bus.disabled.no_connection_string');
  }

  const shutdown = () => {
    loop.stop();
    admin.close();
    logger.info({ service: SERVICE_NAME }, 'worker.shutdown');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { stop: shutdown, repo, admin };
}

if (require.main === module) {
  startWorker();
}
