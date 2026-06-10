import type { Request, Response, NextFunction } from 'express';
import type { Logger } from '@loyalty/shared-logger';

export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.info(
        {
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          correlationId: req.correlationId,
          tenantId: req.user?.tenantId,
          userId: req.user?.userId,
        },
        'http.request',
      );
    });
    next();
  };
}
