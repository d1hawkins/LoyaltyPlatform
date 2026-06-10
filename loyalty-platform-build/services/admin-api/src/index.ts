import express, { Express, Request, Response, NextFunction } from 'express';
import * as sql from 'mssql';
import { createLogger, Logger } from '@loyalty/shared-logger';
import { correlationId, requestLogger, errorHandler } from '@loyalty/shared-middleware';
import { UnauthorizedError } from '@loyalty/shared-errors';
import { loadConfig } from './config';
import { buildRouter, type RoutesDeps } from './routes';
import { buildIntegrationRouter } from './integration-routes';
import {
  buildPublicRouter,
  InMemoryTenantRepository,
  DevProvisioningService,
  type PublicRoutesDeps,
} from './public-routes';
import {
  InMemoryAuditRepository,
  type AuditRepository,
} from './audit';
import {
  InMemoryProgramConfigRepo,
  InMemoryTierRepo,
  InMemoryWebhookRepo,
  InMemoryApiKeyRepo,
  InMemoryFeatureFlagRepo,
  InMemoryMemberClient,
  InMemoryLoyaltyEngineClient,
  InMemoryWebhookWorkerClient,
} from './repositories';
import {
  SqlAuditRepository,
  SqlProgramConfigRepo,
  SqlTierRepo,
  SqlWebhookRepo,
  SqlApiKeyRepo,
  SqlFeatureFlagRepo,
  SqlTransactionRepository,
  SqlMemberClient,
} from './sql-repositories';
import {
  HttpMemberClient,
  HttpLoyaltyEngineClient,
  HttpWebhookWorkerClient,
} from './http-clients';

const SERVICE_NAME = 'admin-api';
const VERSION = '0.1.0';

export type { RoutesDeps } from './routes';
export { requireRole, extractRoles, highestRole } from './rbac';
export {
  InMemoryAuditRepository,
  type AuditRepository,
  type AuditRecord,
  auditedMutation,
} from './audit';
export * from './repositories';
export * from './public-routes';
export { partitionBulk, BULK_MAX_IDS, BULK_CHUNK_SIZE } from './bulk';
export { streamCsv, csvEscape, rowToCsv } from './csv';
export { buildIntegrationRouter } from './integration-routes';
export { ActiveCampaignSync, handleLoyaltyEvent } from './contact-sync';
export type { MemberData, IntegrationConfig, LoyaltyEvent, SyncResult } from './contact-sync';

export interface CreateAppOptions {
  deps?: Partial<RoutesDeps>;
  publicDeps?: Partial<PublicRoutesDeps>;
  /** If true, populate req.user from x-tenant-id / x-user-id / x-user-role headers.
   *  Defaults to true in tests & when SKIP_AUTH=true. */
  devAuth?: boolean;
}

function devAuthMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const tenantId = req.header('x-tenant-id');
    const userId = req.header('x-user-id');
    if (!tenantId || !userId) {
      return next(new UnauthorizedError('Missing x-tenant-id or x-user-id in dev mode'));
    }
    const roleHeader = req.header('x-user-role');
    const roles = roleHeader ? [roleHeader] : [];
    req.user = { userId, tenantId, roles };
    return next();
  };
}

export function buildDefaultDeps(): RoutesDeps {
  const audit: AuditRepository = new InMemoryAuditRepository();
  return {
    audit,
    programConfig: new InMemoryProgramConfigRepo(),
    tiers: new InMemoryTierRepo(),
    webhooks: new InMemoryWebhookRepo(),
    apiKeys: new InMemoryApiKeyRepo(),
    featureFlags: new InMemoryFeatureFlagRepo(),
    members: new InMemoryMemberClient(),
    loyaltyEngine: new InMemoryLoyaltyEngineClient(),
    webhookWorker: new InMemoryWebhookWorkerClient(),
  };
}

export function createApp(options: CreateAppOptions = {}): {
  app: Express;
  logger: Logger;
  deps: RoutesDeps;
  publicDeps: PublicRoutesDeps;
} {
  const logger = createLogger(SERVICE_NAME);
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

  const defaults = buildDefaultDeps();
  const deps: RoutesDeps = { ...defaults, ...(options.deps ?? {}) };

  // Public provisioning routes (no auth required)
  const tenantRepo = (options.publicDeps?.tenants as InMemoryTenantRepository | undefined) ?? new InMemoryTenantRepository();
  const provisioningSvc = options.publicDeps?.provisioning ?? new DevProvisioningService(tenantRepo);
  const publicDeps: PublicRoutesDeps = {
    tenants: tenantRepo,
    provisioning: provisioningSvc,
    ...options.publicDeps,
  };
  app.use('/v1/public', buildPublicRouter(publicDeps));

  const useDevAuth =
    options.devAuth ?? (process.env.NODE_ENV === 'test' || process.env.SKIP_AUTH === 'true');

  if (useDevAuth) {
    app.use('/v1/admin', devAuthMiddleware());
  }
  app.use('/v1/admin', buildRouter(deps));
  app.use('/v1/admin/integrations', buildIntegrationRouter({
    programConfig: deps.programConfig,
    members: deps.members,
  }));

  app.use(errorHandler(logger));
  return { app, logger, deps, publicDeps };
}

if (require.main === module) {
  const config = loadConfig();

  const start = async () => {
    let deps: Partial<RoutesDeps> | undefined;

    if (config.TENANT_SQL_CONNSTR) {
      const tenantPool = await new sql.ConnectionPool(config.TENANT_SQL_CONNSTR).connect();

      const audit = new SqlAuditRepository(tenantPool);
      const programConfig = new SqlProgramConfigRepo(tenantPool);
      const tiers = new SqlTierRepo(tenantPool);
      const webhooks = new SqlWebhookRepo(tenantPool);

      // API keys + feature flags go against the control-plane DB if configured,
      // otherwise fall back to the tenant pool (single-DB dev mode).
      const cpPool = config.CONTROL_PLANE_SQL_CONNSTR
        ? await new sql.ConnectionPool(config.CONTROL_PLANE_SQL_CONNSTR).connect()
        : tenantPool;
      const apiKeys = new SqlApiKeyRepo(cpPool);
      const featureFlags = new SqlFeatureFlagRepo(tenantPool);

      const members = new SqlMemberClient(tenantPool);
      const loyaltyEngine = new HttpLoyaltyEngineClient(config.LOYALTY_ENGINE_URL);
      const webhookWorker = new HttpWebhookWorkerClient(config.WEBHOOK_WORKER_URL);

      const transactions = new SqlTransactionRepository(tenantPool);
      deps = { audit, programConfig, tiers, webhooks, apiKeys, featureFlags, transactions, members, loyaltyEngine, webhookWorker };
    }

    const { app, logger } = createApp({ deps, devAuth: config.SKIP_AUTH || !config.TENANT_SQL_CONNSTR });
    app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, service: SERVICE_NAME, sql: !!config.TENANT_SQL_CONNSTR }, 'service.started');
    });
  };

  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start admin-api', err);
    process.exit(1);
  });
}
