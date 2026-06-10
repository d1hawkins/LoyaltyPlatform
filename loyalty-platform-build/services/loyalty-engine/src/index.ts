import express, { Express } from 'express';
import { createLogger, Logger } from '@loyalty/shared-logger';
import { correlationId, requestLogger, errorHandler } from '@loyalty/shared-middleware';
import { loadConfig } from './config';
import { LoyaltyEngine, EngineDeps } from './engine';
import { buildRoutes } from './routes';
import { InMemoryCache, InMemoryDb, InMemoryMemberClient, InMemoryPublisher } from './in-memory';
import { ExpiryWorker } from './expiry';
import { FraudEngine, InMemoryFraudCache, InMemoryFraudRepository } from './fraud';
import type { FraudRepository } from './fraud';
import { buildFraudAdminRoutes } from './fraud/routes';
import type { CacheClient, LoyaltyDb, MemberClient } from './deps';

const SERVICE_NAME = 'loyalty-engine';
const VERSION = '0.3.0';

export interface CreateAppOptions {
  deps?: Partial<EngineDeps>;
  fraudEnabled?: boolean;
  fraudRepo?: FraudRepository;
}

/**
 * Boot real adapters when TENANT_SQL_CONNSTR is set; otherwise fall back
 * to in-memory implementations (dev / test mode).
 */
async function resolveAdapters(logger: Logger): Promise<{
  db: LoyaltyDb;
  cache: CacheClient;
  memberClient: MemberClient;
}> {
  if (process.env.TENANT_SQL_CONNSTR) {
    // Dynamic imports so the mssql/ioredis packages are not required when
    // running in in-memory mode (tests, local dev without Docker).
    const sql = await import('mssql');
    const { SqlLoyaltyDb } = await import('./adapters/sql-db.js');
    const { HttpMemberClient } = await import('./adapters/http-member-client.js');

    const pool = await new sql.default.ConnectionPool(
      process.env.TENANT_SQL_CONNSTR,
    ).connect();
    logger.info('sql.pool.connected');

    const db = new SqlLoyaltyDb(pool);
    await db.ensureIdempotencyTable();

    const memberClient = new HttpMemberClient(
      process.env.MEMBER_SERVICE_URL || 'http://member-service:3001',
    );

    let cache: CacheClient;
    if (process.env.REDIS_URL) {
      const { Redis } = await import('ioredis');
      const { RedisCacheClient } = await import('./adapters/redis-cache.js');

      let redisClient: InstanceType<typeof Redis>;
      const redisUrl = process.env.REDIS_URL;

      if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
        // Standard Redis URL
        redisClient = new Redis(redisUrl);
      } else {
        // Azure Cache for Redis connection string format:
        // hostname:port,password=xxx,ssl=True,abortConnect=False
        const parts = redisUrl.split(',');
        const hostPort = parts[0]!.split(':');
        const host = hostPort[0]!;
        const port = parseInt(hostPort[1] ?? '6380', 10);
        const params = new Map(
          parts.slice(1).map((p) => {
            const [k, ...v] = p.split('=');
            return [k!.toLowerCase().trim(), v.join('=')] as [string, string];
          }),
        );
        const password = params.get('password') ?? undefined;
        const useTls = params.get('ssl')?.toLowerCase() === 'true' || port === 6380;

        redisClient = new Redis({
          host,
          port,
          password,
          tls: useTls ? { servername: host } : undefined,
          maxRetriesPerRequest: 3,
        });
      }

      cache = new RedisCacheClient(redisClient);
      logger.info('redis.connected');
    } else {
      cache = new InMemoryCache();
    }

    return { db, cache, memberClient };
  }

  // In-memory fallback
  return {
    db: new InMemoryDb(),
    cache: new InMemoryCache(),
    memberClient: new InMemoryMemberClient(),
  };
}

export function createApp(options: CreateAppOptions = {}): {
  app: Express;
  logger: Logger;
  engine: LoyaltyEngine;
  expiryWorker: ExpiryWorker;
  fraudEngine?: FraudEngine;
} {
  const logger = createLogger(SERVICE_NAME);

  const fraudEnabled = options.fraudEnabled ?? (process.env.FRAUD_ENABLED !== 'false');
  const fraudRepo = options.fraudRepo ?? new InMemoryFraudRepository();
  const fraudCache = new InMemoryFraudCache();
  const fraudEngine = fraudEnabled
    ? new FraudEngine({ repo: fraudRepo, cache: fraudCache, logger })
    : undefined;

  const deps: EngineDeps = {
    db: options.deps?.db ?? new InMemoryDb(),
    cache: options.deps?.cache ?? new InMemoryCache(),
    publisher: options.deps?.publisher ?? new InMemoryPublisher(),
    memberClient: options.deps?.memberClient ?? new InMemoryMemberClient(),
    logger: options.deps?.logger ?? logger,
    fraudEngine,
    fraudEnabled,
  };
  const engine = new LoyaltyEngine(deps);
  const expiryWorker = new ExpiryWorker({
    db: deps.db,
    cache: deps.cache,
    publisher: deps.publisher,
    logger: deps.logger,
  });

  const app: Express = express();
  app.use(express.json());
  app.use(correlationId());
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, version: VERSION });
  });
  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  // Dev-mode tenant injection if SKIP_AUTH set: trust x-tenant-id header.
  // Actual JWT auth is terminated at APIM in production.
  app.use((req, _res, next) => {
    if (!req.user) {
      const t = req.header('x-tenant-id');
      const u = req.header('x-user-id');
      if (t && u) req.user = { tenantId: t, userId: u };
    }
    next();
  });

  app.use(buildRoutes(engine, expiryWorker));

  // Fraud admin routes (admin only)
  if (fraudEnabled) {
    app.use(buildFraudAdminRoutes(fraudRepo));
  }

  app.use(errorHandler(logger));
  return { app, logger, engine, expiryWorker, fraudEngine };
}

if (require.main === module) {
  const config = loadConfig();
  const logger = createLogger(SERVICE_NAME);

  resolveAdapters(logger)
    .then((adapters) => {
      const { app, logger: appLogger } = createApp({
        deps: {
          db: adapters.db,
          cache: adapters.cache,
          memberClient: adapters.memberClient,
        },
      });
      app.listen(config.PORT, () => {
        appLogger.info({ port: config.PORT, service: SERVICE_NAME }, 'service.started');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'startup.failed');
      process.exit(1);
    });
}
