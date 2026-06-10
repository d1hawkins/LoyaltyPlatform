import express, { Express } from 'express';
import * as sql from 'mssql';
import { createLogger, Logger } from '@loyalty/shared-logger';
import {
  authenticateJWT,
  correlationId,
  errorHandler,
  requestLogger,
  resolveTenant,
  type TenantLookup,
} from '@loyalty/shared-middleware';
import type { Tenant, TenantId } from '@loyalty/shared-types';
import { loadConfig } from './config';
import { memberRouter } from './routes';
import { MemberService } from './service';
import type { MemberRepository } from './repository';
import { InMemoryMemberRepository } from './repository.memory';
import { SqlMemberRepository } from './repository.sql';
import { InMemoryBalanceCache, RedisBalanceCache, type BalanceCache, type RedisLike } from './cache';
import { NoopEventPublisher, type EventPublisher } from './events';
import { StaticPiiKeyProvider, type PiiKeyProvider } from './pii';
import { mobileRouter, MobileService, InMemoryDashboardCache, InMemoryMobileDataProvider, SqlMobileDataProvider } from './mobile';
import type { DashboardCache, MobileDataProvider } from './mobile';

const SERVICE_NAME = 'member-service';
const VERSION = '0.1.0';

export interface CreateAppDeps {
  repo?: MemberRepository;
  cache?: BalanceCache;
  publisher?: EventPublisher;
  pii?: PiiKeyProvider;
  tenantLookup?: TenantLookup;
  hashPepper?: string;
  skipAuth?: boolean;
  dashboardCache?: DashboardCache;
  mobileData?: MobileDataProvider;
}

/**
 * A permissive in-memory tenant lookup used when SKIP_AUTH is on and no real
 * control-plane client has been wired up. It echoes any tenantId back as a
 * synthetic active tenant so that local dev + tests can proceed.
 */
class EchoTenantLookup implements TenantLookup {
  public async getTenant(tenantId: string): Promise<Tenant | null> {
    const now = new Date().toISOString();
    return {
      id: tenantId as TenantId,
      name: `Tenant ${tenantId}`,
      slug: tenantId,
      status: 'active',
      dbSecretName: `tenant-${tenantId}-sql-connstr`,
      config: { baseEarnRate: 1, tierMode: 'points', currency: 'USD' },
      createdAt: now,
      updatedAt: now,
    };
  }
}

export function createApp(deps: CreateAppDeps = {}): {
  app: Express;
  logger: Logger;
  service: MemberService;
  mobileService: MobileService;
} {
  const logger = createLogger(SERVICE_NAME);
  const app: Express = express();

  const pii =
    deps.pii ??
    new StaticPiiKeyProvider(
      process.env.MEMBER_PII_KEY_HEX ??
        // Deterministic dev/test key — DO NOT use in production.
        '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    );
  const repo = deps.repo ?? new InMemoryMemberRepository();
  const cache = deps.cache ?? new InMemoryBalanceCache();
  const publisher = deps.publisher ?? new NoopEventPublisher();
  const hashPepper =
    deps.hashPepper ?? process.env.MEMBER_HASH_PEPPER ?? 'loyalty-dev-pepper-change-me';
  const tenantLookup = deps.tenantLookup ?? new EchoTenantLookup();
  const skipAuth = deps.skipAuth ?? process.env.SKIP_AUTH === 'true';

  const service = new MemberService({ repo, cache, publisher, pii, hashPepper });

  // Mobile data & cache deps
  const dashboardCache = deps.dashboardCache ?? new InMemoryDashboardCache();
  const mobileData = deps.mobileData ?? new InMemoryMobileDataProvider();
  const mobileService = new MobileService({
    data: mobileData,
    balanceCache: cache,
    dashboardCache,
    pii,
  });

  app.use(express.json());
  app.use(correlationId());
  app.use(requestLogger(logger));

  // Health endpoints are intentionally unauthenticated.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, version: VERSION });
  });
  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  app.use('/v1/members', authenticateJWT({ skipAuth }));
  app.use('/v1/members', resolveTenant(tenantLookup));
  app.use('/v1/members', memberRouter(service));

  // Mobile API routes
  app.use('/v1/mobile', authenticateJWT({ skipAuth }));
  app.use('/v1/mobile', resolveTenant(tenantLookup));
  app.use('/v1/mobile', mobileRouter(mobileService));

  app.use(errorHandler(logger));
  return { app, logger, service, mobileService };
}

if (require.main === module) {
  (async () => {
    const config = loadConfig();
    const logger = createLogger(SERVICE_NAME);

    const deps: CreateAppDeps = {};

    // ── SQL repository ─────────────────────────────────────────────
    // TENANT_SQL_CONNSTR: direct connection to tenant DB (dev shortcut).
    // CONTROL_PLANE_SQL_CONNSTR: used in production via TenantDbClient.
    const tenantConnStr = process.env.TENANT_SQL_CONNSTR;
    const controlPlaneConnStr = process.env.CONTROL_PLANE_SQL_CONNSTR;

    if (tenantConnStr || controlPlaneConnStr) {
      try {
        const connStr = tenantConnStr ?? controlPlaneConnStr!;
        logger.info('sql.connecting (direct tenant pool)');
        const pool = await new sql.ConnectionPool(connStr).connect();
        deps.repo = new SqlMemberRepository(pool);
        deps.mobileData = new SqlMobileDataProvider(pool);
        logger.info('sql.connected');
      } catch (err) {
        logger.error({ err }, 'sql.connect.failed — falling back to in-memory');
      }
    }

    // ── Redis cache ────────────────────────────────────────────────
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        // Dynamic import to avoid hard failure when ioredis isn't available
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const IoRedis = require('ioredis') as typeof import('ioredis').default;
        const redis = new IoRedis(redisUrl, { lazyConnect: true, enableReadyCheck: true });
        await redis.connect();
        deps.cache = new RedisBalanceCache(redis as unknown as RedisLike);
        logger.info('redis.connected');
      } catch (err) {
        logger.error({ err }, 'redis.connect.failed — falling back to in-memory cache');
      }
    }

    const { app } = createApp(deps);
    app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, service: SERVICE_NAME }, 'service.started');
    });
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal startup error', err);
    process.exit(1);
  });
}
