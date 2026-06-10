import express, { Express } from 'express';
import { createLogger, type Logger } from '@loyalty/shared-logger';
import {
  correlationId,
  requestLogger,
  errorHandler,
  authenticateJWT,
} from '@loyalty/shared-middleware';
import { loadConfig, type Config } from './config';
import { InMemoryNotificationRepository } from './repository.memory';
import { TemplateLoader } from './templates';
import { createEmailProvider, type EmailProvider } from './providers';
import { createPushProvider, type PushProvider } from './providers/push-provider';
import { createSmsProvider, type SmsProvider } from './providers/sms-provider';
import { HttpMemberClient, InMemoryMemberClient, type MemberClient } from './member-client';
import { NotificationService } from './service';
import { notificationRouter } from './routes';
import { createEventRouter, SUBSCRIBED_TOPICS, SUBSCRIPTION_NAME } from './event-handlers';

const SERVICE_NAME = 'notification-service';
const VERSION = '0.1.0';

export interface AppDeps {
  service: NotificationService;
  logger: Logger;
}

export function createApp(deps?: Partial<AppDeps>): {
  app: Express;
  logger: Logger;
  service: NotificationService;
} {
  const logger = deps?.logger ?? createLogger(SERVICE_NAME);
  const service = deps?.service ?? buildInMemoryService(loadConfig(), logger).service;

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

  const skipAuth = process.env.SKIP_AUTH === 'true';
  app.use(
    '/v1/notifications',
    authenticateJWT({ skipAuth }),
    notificationRouter(service),
  );

  app.use(errorHandler(logger));
  return { app, logger, service };
}

export interface BuiltService {
  service: NotificationService;
  repo: InMemoryNotificationRepository;
  memberClient: MemberClient;
  provider: EmailProvider;
  pushProvider: PushProvider;
  smsProvider: SmsProvider;
  templates: TemplateLoader;
}

export function buildInMemoryService(config: Config, logger: Logger): BuiltService {
  const repo = new InMemoryNotificationRepository();
  const templates = new TemplateLoader();
  const provider = createEmailProvider(config, logger);
  const pushProvider = createPushProvider(
    { PUSH_PROVIDER: config.PUSH_PROVIDER, AZURE_NH_CONNECTION_STRING: config.AZURE_NH_CONNECTION_STRING, AZURE_NH_HUB_NAME: config.AZURE_NH_HUB_NAME },
    logger,
  );
  const smsProvider = createSmsProvider(
    { SMS_PROVIDER: config.SMS_PROVIDER, AZURE_COMM_CONNECTION_STRING: config.AZURE_COMM_CONNECTION_STRING, SMS_FROM_NUMBER: config.SMS_FROM_NUMBER },
    logger,
  );
  const memberClient = new InMemoryMemberClient();
  const service = new NotificationService(
    repo,
    templates,
    provider,
    memberClient,
    {
      piiKeyHex: config.NOTIFICATION_PII_KEY_HEX,
      recipientPepper: config.NOTIFICATION_RECIPIENT_PEPPER,
      fromEmail: config.FROM_EMAIL,
      supportEmail: config.SUPPORT_EMAIL,
      programName: config.PROGRAM_NAME,
      tenantName: config.TENANT_NAME,
      unsubscribeBaseUrl: config.UNSUBSCRIBE_BASE_URL,
    },
    logger,
    pushProvider,
    smsProvider,
  );
  return { service, repo, memberClient, provider, pushProvider, smsProvider, templates };
}

export function buildHttpService(config: Config, logger: Logger): NotificationService {
  const repo = new InMemoryNotificationRepository();
  const templates = new TemplateLoader();
  const provider = createEmailProvider(config, logger);
  const pushProvider = createPushProvider(
    { PUSH_PROVIDER: config.PUSH_PROVIDER, AZURE_NH_CONNECTION_STRING: config.AZURE_NH_CONNECTION_STRING, AZURE_NH_HUB_NAME: config.AZURE_NH_HUB_NAME },
    logger,
  );
  const smsProvider = createSmsProvider(
    { SMS_PROVIDER: config.SMS_PROVIDER, AZURE_COMM_CONNECTION_STRING: config.AZURE_COMM_CONNECTION_STRING, SMS_FROM_NUMBER: config.SMS_FROM_NUMBER },
    logger,
  );
  const memberClient = new HttpMemberClient(config.MEMBER_SERVICE_URL);
  return new NotificationService(
    repo,
    templates,
    provider,
    memberClient,
    {
      piiKeyHex: config.NOTIFICATION_PII_KEY_HEX,
      recipientPepper: config.NOTIFICATION_RECIPIENT_PEPPER,
      fromEmail: config.FROM_EMAIL,
      supportEmail: config.SUPPORT_EMAIL,
      programName: config.PROGRAM_NAME,
      tenantName: config.TENANT_NAME,
      unsubscribeBaseUrl: config.UNSUBSCRIBE_BASE_URL,
    },
    logger,
    pushProvider,
    smsProvider,
  );
}

/**
 * Start the notification service. Mirrors the A-08 / tier-eval-worker
 * pattern: in-memory mode when Service Bus env is missing, live-mode
 * deliberately throws until the subscriber bootstrap is wired end-to-end.
 */
export async function startService(): Promise<{ stop: () => Promise<void> }> {
  const logger = createLogger(SERVICE_NAME);
  const config = loadConfig();
  const liveMode = Boolean(config.SERVICE_BUS_CONNECTION_STRING);

  const service = liveMode
    ? buildHttpService(config, logger)
    : buildInMemoryService(config, logger).service;

  const { app } = createApp({ service, logger });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, service: SERVICE_NAME, liveMode }, 'service.started');
  });

  if (liveMode) {
    logger.warn(
      { topics: SUBSCRIBED_TOPICS, subscription: SUBSCRIPTION_NAME },
      'notification.boot.live_mode_not_implemented',
    );
    throw new Error(
      'notification-service live-mode not yet implemented; unset SERVICE_BUS_CONNECTION_STRING to run in in-memory mode',
    );
  } else {
    logger.warn(
      { topics: SUBSCRIBED_TOPICS, subscription: SUBSCRIPTION_NAME },
      'notification.boot.in_memory_mode',
    );
    // In-memory mode: event router exists but no transport is wired.
    // Tests drive the router directly via createEventRouter().
    createEventRouter({ service, logger });
  }

  return {
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

if (require.main === module) {
  startService().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('notification-service failed to start', err);
    process.exit(1);
  });
}
