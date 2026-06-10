import express, { Express } from 'express';
import * as sql from 'mssql';
import { createLogger, Logger } from '@loyalty/shared-logger';
import { correlationId, requestLogger, errorHandler } from '@loyalty/shared-middleware';
import { loadConfig } from './config';
import { OfferService, OfferServiceDeps } from './service';
import { buildRoutes } from './routes';
import {
  InMemoryOfferDb,
  InMemoryPublisher,
  InMemoryLoyaltyEngineClient,
  InMemoryMemberClient,
} from './in-memory';
import { SqlOfferDb } from './sql-db';
import {
  HttpLoyaltyEngineClient,
  HttpMemberClient,
} from './http-clients';

const SERVICE_NAME = 'offer-service';
const VERSION = '0.2.0';

export interface CreateAppOptions {
  deps?: Partial<OfferServiceDeps>;
}

export function createApp(options: CreateAppOptions = {}): {
  app: Express;
  logger: Logger;
  service: OfferService;
} {
  const logger = createLogger(SERVICE_NAME);

  const deps: OfferServiceDeps = {
    db: options.deps?.db ?? new InMemoryOfferDb(),
    publisher: options.deps?.publisher ?? new InMemoryPublisher(),
    engineClient: options.deps?.engineClient ?? new InMemoryLoyaltyEngineClient(),
    memberClient: options.deps?.memberClient ?? new InMemoryMemberClient(),
    logger: options.deps?.logger ?? logger,
  };
  const service = new OfferService(deps);

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
  app.use((req, _res, next) => {
    if (!req.user) {
      const t = req.header('x-tenant-id');
      const u = req.header('x-user-id');
      if (t && u) req.user = { userId: u, tenantId: t };
    }
    next();
  });

  app.use(buildRoutes(service));

  app.use(errorHandler(logger));
  return { app, logger, service };
}

if (require.main === module) {
  const config = loadConfig();

  const start = async () => {
    let deps: Partial<OfferServiceDeps> | undefined;

    if (config.TENANT_SQL_CONNSTR) {
      const pool = await new sql.ConnectionPool(config.TENANT_SQL_CONNSTR).connect();
      const logger = createLogger(SERVICE_NAME);
      deps = {
        db: new SqlOfferDb(pool),
        publisher: new InMemoryPublisher(), // event publisher stays in-memory for now
        engineClient: new HttpLoyaltyEngineClient(config.LOYALTY_ENGINE_URL),
        memberClient: new HttpMemberClient(config.MEMBER_SERVICE_URL, config.LOYALTY_ENGINE_URL),
        logger,
      };
    }

    const { app, logger } = createApp({ deps });
    app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, service: SERVICE_NAME, sql: !!config.TENANT_SQL_CONNSTR }, 'service.started');
    });
  };

  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start offer-service', err);
    process.exit(1);
  });
}
