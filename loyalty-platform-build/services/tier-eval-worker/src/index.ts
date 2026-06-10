import { createLogger, type Logger } from '@loyalty/shared-logger';
import { EVENT_TYPES } from '@loyalty/shared-events';
import { loadConfig, type Config } from './config';
import { InMemoryTierRepository } from './repository.memory';
import { InMemoryDedupeStore } from './dedupe';
import {
  processMessage,
  runDemotionScan,
  type CacheInvalidator,
  type Publisher,
  type WorkerDeps,
} from './worker';
import type { TierRepository } from './repository';

const SERVICE_NAME = 'tier-eval-worker';
const VERSION = '0.1.0';

/**
 * Parse a cron expression of the form "M H * * *" (minute, hour, day-of-month,
 * month, day-of-week). Only the minute and hour fields are honored; the rest
 * must be "*". Supports a single integer value per field. This keeps us off
 * an external cron dependency for the common daily-demotion case.
 */
export function parseDailyCron(expr: string): { minute: number; hour: number } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression (expected 5 fields): ${expr}`);
  }
  const [m, h, dom, mon, dow] = parts;
  if (dom !== '*' || mon !== '*' || dow !== '*') {
    throw new Error(`Unsupported cron expression (only daily M H * * * supported): ${expr}`);
  }
  const minute = Number(m);
  const hour = Number(h);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid cron minute: ${m}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid cron hour: ${h}`);
  }
  return { minute, hour };
}

export function msUntilNext(target: { hour: number; minute: number }, from: Date = new Date()): number {
  const next = new Date(from);
  next.setUTCHours(target.hour, target.minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - from.getTime();
}

export interface StartedWorker {
  stop: () => Promise<void>;
}

/**
 * Start the worker with pre-built dependencies. Used by tests to inject
 * in-memory fakes; also used by the real bootstrap after it builds live
 * Service Bus / Redis / mssql clients.
 */
export function startWithDeps(
  config: Config,
  deps: WorkerDeps,
  logger: Logger,
): StartedWorker {
  logger.info({ service: SERVICE_NAME, version: VERSION, env: config.NODE_ENV }, 'worker.started');

  // Schedule demotion cron.
  const cronSpec = parseDailyCron(config.TIER_DEMOTION_CRON);
  let cronTimer: NodeJS.Timeout | null = null;
  const scheduleNext = () => {
    const delay = msUntilNext(cronSpec);
    cronTimer = setTimeout(async () => {
      try {
        await runDemotionScan(deps, config.TIER_DEMOTION_COOLDOWN_DAYS);
      } catch (err) {
        logger.error({ err }, 'tier-eval.demotion.scan_failed');
      }
      scheduleNext();
    }, delay);
  };
  scheduleNext();

  const shutdown = async () => {
    if (cronTimer) clearTimeout(cronTimer);
    logger.info({ service: SERVICE_NAME }, 'worker.shutdown');
  };

  process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });

  return { stop: shutdown };
}

/**
 * Production bootstrap. When any of the required live-mode env vars is unset
 * the worker falls back to an in-memory repo + dedupe + no-op publisher so it
 * can boot in CI/local without Azure. This matches the loyalty-engine pattern.
 */
export async function startWorker(): Promise<StartedWorker> {
  const logger = createLogger(SERVICE_NAME);
  const config = loadConfig();

  const liveMode = Boolean(
    config.SERVICE_BUS_CONNECTION_STRING &&
      config.CONTROL_PLANE_SQL_CONNSTR &&
      config.KEY_VAULT_URI &&
      config.REDIS_URL,
  );

  if (!liveMode) {
    logger.warn(
      {
        hasServiceBus: !!config.SERVICE_BUS_CONNECTION_STRING,
        hasSql: !!config.CONTROL_PLANE_SQL_CONNSTR,
        hasKeyVault: !!config.KEY_VAULT_URI,
        hasRedis: !!config.REDIS_URL,
      },
      'tier-eval.boot.in_memory_mode',
    );
    const repo: TierRepository = new InMemoryTierRepository();
    const deps: WorkerDeps = {
      repo,
      dedupe: new InMemoryDedupeStore(config.DEDUPE_TTL_SECONDS * 1000),
      publisher: { publish: async () => undefined } as Publisher,
      cache: { del: async () => 0 } as CacheInvalidator,
      logger,
    };
    return startWithDeps(config, deps, logger);
  }

  // Live-mode wiring (Service Bus + Redis + mssql-backed TierRepository) is
  // intentionally deferred to a follow-up once the shared Service Bus admin
  // plumbing, the mssql TierRepository and A-03 integration-test SQL server
  // are all available. Until then the worker fails loudly in live mode so it
  // can never silently mis-process events. In-memory mode (env vars unset)
  // is fully functional and is exercised by the test suite.
  logger.warn(
    { topics: [EVENT_TYPES.POINTS_EARNED, EVENT_TYPES.TRANSACTION_VOIDED] },
    'tier-eval.boot.live_mode_not_implemented',
  );
  throw new Error(
    'tier-eval-worker live-mode not yet implemented; unset SERVICE_BUS_CONNECTION_STRING/CONTROL_PLANE_SQL_CONNSTR/KEY_VAULT_URI/REDIS_URL to run in in-memory mode',
  );
}

if (require.main === module) {
  startWorker().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('tier-eval-worker failed to start', err);
    process.exit(1);
  });
}
