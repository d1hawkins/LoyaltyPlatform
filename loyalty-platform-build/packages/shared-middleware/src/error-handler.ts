import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@loyalty/shared-errors';
import type { Logger } from '@loyalty/shared-logger';

export function errorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      const body = err.toJSON();
      const logFn = err.statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
      logFn(
        {
          err,
          code: err.code,
          statusCode: err.statusCode,
          path: req.originalUrl ?? req.url,
          correlationId: req.correlationId,
        },
        'request.error',
      );
      res.status(err.statusCode).type('application/problem+json').json(body);
      return;
    }

    logger.error(
      {
        err,
        path: req.originalUrl ?? req.url,
        correlationId: req.correlationId,
      },
      'request.unhandled',
    );
    res.status(500).type('application/problem+json').json({
      type: 'https://errors.loyalty-platform.io/INTERNAL_ERROR',
      title: 'InternalServerError',
      status: 500,
      detail: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    });
  };
}
