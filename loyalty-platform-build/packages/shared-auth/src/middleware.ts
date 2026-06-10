import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { UnauthorizedError } from '@loyalty/shared-errors';
import { verifyB2BToken } from './verify-b2b-token';
import type { VerifyOptions } from './types';

export interface B2BAuthMiddlewareOptions extends VerifyOptions {
  skipAuth?: boolean;
}

/**
 * Express middleware factory that wraps verifyB2BToken and populates
 * `req.auth = { tenantId, clientId, scopes }` on success.
 *
 * If `skipAuth` is true (or SKIP_AUTH=true env), the middleware reads
 * `x-tenant-id` / `x-client-id` headers instead — dev bypass only.
 */
export function b2bAuthMiddleware(opts: B2BAuthMiddlewareOptions): RequestHandler {
  const skipAuth = opts.skipAuth ?? process.env.SKIP_AUTH === 'true';

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (skipAuth) {
      const tenantId = req.header('x-tenant-id');
      if (!tenantId) {
        next(new UnauthorizedError('Missing x-tenant-id in dev mode'));
        return;
      }
      req.auth = {
        tenantId,
        clientId: req.header('x-client-id') ?? 'dev-client',
        scopes: (req.header('x-scopes') ?? '').split(' ').filter(Boolean),
      };
      next();
      return;
    }

    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    try {
      const claims = await verifyB2BToken(header.slice('Bearer '.length), opts);
      req.auth = {
        tenantId: claims.tenantId,
        clientId: claims.clientId,
        scopes: claims.scopes,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
