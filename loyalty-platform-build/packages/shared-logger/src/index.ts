import pino, { Logger, LoggerOptions } from 'pino';

export type { Logger } from 'pino';

export interface LogContext {
  tenantId?: string;
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(service: string, options: LoggerOptions = {}): Logger {
  const environment = process.env.NODE_ENV ?? 'development';
  const level = process.env.LOG_LEVEL ?? (environment === 'production' ? 'info' : 'debug');

  return pino({
    level,
    base: {
      service,
      environment,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...options,
  });
}

export function withContext(logger: Logger, ctx: LogContext): Logger {
  return logger.child(ctx);
}
