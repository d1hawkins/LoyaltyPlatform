import express, { Express } from 'express';
import * as sql from 'mssql';
import { createLogger, Logger } from '@loyalty/shared-logger';
import { correlationId, requestLogger, errorHandler } from '@loyalty/shared-middleware';
import { loadConfig } from './config';
import { buildRoutes, RouteDeps } from './routes';
import { AnalyticsEventConsumer, EventConsumerDeps } from './event-consumer';
import { AnalyticsScheduler, SchedulerDeps } from './scheduler';
import {
  SummaryRepository,
  CohortRepository,
  TierRepository,
  ExportRepository,
  RealtimeRepository,
  InMemorySummaryRepository,
  InMemoryCohortRepository,
  InMemoryTierRepository,
  InMemoryExportRepository,
  InMemoryRealtimeRepository,
} from './repositories';
import {
  SqlSummaryRepository,
  SqlCohortRepository,
  SqlTierRepository,
  SqlExportRepository,
  SqlRealtimeRepository,
} from './sql-repositories';
import {
  buildReportingRoutes,
  ReportingRepository,
  SqlReportingRepository,
  InMemoryReportingRepository,
} from './reporting-routes';

const SERVICE_NAME = 'analytics-service';
const VERSION = '1.0.0';

export interface AnalyticsServiceDeps {
  summaryRepo?: SummaryRepository;
  cohortRepo?: CohortRepository;
  tierRepo?: TierRepository;
  exportRepo?: ExportRepository;
  realtimeRepo?: RealtimeRepository;
  reportingRepo?: ReportingRepository;
  logger?: Logger;
}

export function createApp(opts: AnalyticsServiceDeps = {}): {
  app: Express;
  logger: Logger;
  consumer: AnalyticsEventConsumer;
  scheduler: AnalyticsScheduler;
  deps: {
    summaryRepo: SummaryRepository;
    cohortRepo: CohortRepository;
    tierRepo: TierRepository;
    exportRepo: ExportRepository;
    realtimeRepo: RealtimeRepository;
  };
} {
  const logger = opts.logger ?? createLogger(SERVICE_NAME);

  const summaryRepo = opts.summaryRepo ?? new InMemorySummaryRepository();
  const cohortRepo = opts.cohortRepo ?? new InMemoryCohortRepository();
  const tierRepo = opts.tierRepo ?? new InMemoryTierRepository();
  const exportRepo = opts.exportRepo ?? new InMemoryExportRepository();
  const realtimeRepo = opts.realtimeRepo ?? new InMemoryRealtimeRepository();
  const reportingRepo = opts.reportingRepo ?? new InMemoryReportingRepository();

  const routeDeps: RouteDeps = { summaryRepo, cohortRepo, tierRepo, exportRepo, realtimeRepo };
  const consumerDeps: EventConsumerDeps = { summaryRepo, realtimeRepo, logger };
  const schedulerDeps: SchedulerDeps = { summaryRepo, cohortRepo, logger };

  const consumer = new AnalyticsEventConsumer(consumerDeps);
  const scheduler = new AnalyticsScheduler(schedulerDeps);

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

  // Dev-mode tenant injection: trust x-tenant-id header when SKIP_AUTH is set
  app.use((req, _res, next) => {
    if (!(req as any).user) {
      const t = req.header('x-tenant-id');
      const u = req.header('x-user-id');
      if (t && u) (req as any).user = { tenantId: t, userId: u };
    }
    next();
  });

  app.use(buildRoutes(routeDeps));
  app.use(buildReportingRoutes({ reportingRepo }));

  app.use(errorHandler(logger));

  return {
    app,
    logger,
    consumer,
    scheduler,
    deps: { summaryRepo, cohortRepo, tierRepo, exportRepo, realtimeRepo },
  };
}

if (require.main === module) {
  const config = loadConfig();

  const start = async () => {
    let opts: AnalyticsServiceDeps = {};

    if (config.TENANT_SQL_CONNSTR) {
      const pool = await new sql.ConnectionPool(config.TENANT_SQL_CONNSTR).connect();
      opts = {
        summaryRepo: new SqlSummaryRepository(pool),
        cohortRepo: new SqlCohortRepository(pool),
        tierRepo: new SqlTierRepository(pool),
        exportRepo: new SqlExportRepository(pool),
        realtimeRepo: new SqlRealtimeRepository(pool),
        reportingRepo: new SqlReportingRepository(pool),
      };
    }

    const { app, logger, scheduler } = createApp(opts);

    scheduler.start();

    const server = app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, service: SERVICE_NAME, sql: !!config.TENANT_SQL_CONNSTR }, 'service.started');
    });

    const shutdown = () => {
      logger.info('service.shutting_down');
      scheduler.stop();
      server.close(() => {
        logger.info('service.stopped');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  };

  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start analytics-service', err);
    process.exit(1);
  });
}
