import { Router, Request, Response, NextFunction } from 'express';
import { ForbiddenError, ValidationError } from '@loyalty/shared-errors';
import { LoyaltyEngine } from './engine';
import { ExpiryWorker } from './expiry';

function requireIdempotencyKey(req: Request): string {
  const key = req.header('idempotency-key');
  if (!key) throw new ValidationError('Idempotency-Key header required');
  return key;
}

function tenantOf(req: Request): string {
  const t = req.user?.tenantId || req.header('x-tenant-id');
  if (!t) throw new ValidationError('tenantId missing');
  return t;
}

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function requireAdmin(req: Request): void {
  const roles = req.user?.roles ?? [];
  const headerRole = req.header('x-user-role');
  const claimRole = req.user?.claims?.role as string | undefined;
  const isAdmin = roles.includes('admin') || headerRole === 'admin' || claimRole === 'admin';
  if (!isAdmin) throw new ForbiddenError('admin role required');
}

export function buildRoutes(engine: LoyaltyEngine, expiryWorker?: ExpiryWorker): Router {
  const router = Router();

  router.post(
    '/v1/transactions',
    asyncRoute(async (req, res) => {
      const key = requireIdempotencyKey(req);
      const tenantId = tenantOf(req);
      const result = await engine.withIdempotency(tenantId, key, req.body, async () => {
        const body = await engine.createTransaction(tenantId, req.body);
        return { statusCode: 201, body };
      });
      res.status(result.statusCode).json(result.body);
    }),
  );

  router.post(
    '/v1/transactions/:id/void',
    asyncRoute(async (req, res) => {
      const key = requireIdempotencyKey(req);
      const tenantId = tenantOf(req);
      const result = await engine.withIdempotency(tenantId, key, req.body, async () => {
        const body = await engine.voidTransaction(
          tenantId,
          req.params.id as string,
          req.body?.reason,
        );
        return { statusCode: 200, body };
      });
      res.status(result.statusCode).json(result.body);
    }),
  );

  router.post(
    '/v1/members/:id/adjustments',
    asyncRoute(async (req, res) => {
      const key = requireIdempotencyKey(req);
      const tenantId = tenantOf(req);
      requireAdmin(req);
      const result = await engine.withIdempotency(tenantId, key, req.body, async () => {
        const body = await engine.adjust(tenantId, req.params.id as string, req.body);
        return { statusCode: 200, body };
      });
      res.status(result.statusCode).json(result.body);
    }),
  );

  router.get(
    '/v1/members/:id/balance',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const out = await engine.getBalance(tenantId, req.params.id as string);
      res.json(out);
    }),
  );

  router.post(
    '/v1/redemptions',
    asyncRoute(async (req, res) => {
      const key = requireIdempotencyKey(req);
      const tenantId = tenantOf(req);
      const result = await engine.withIdempotency(tenantId, key, req.body, async () => {
        const body = await engine.redeem(tenantId, req.body);
        return { statusCode: 201, body };
      });
      res.status(result.statusCode).json(result.body);
    }),
  );

  // --- Expiry admin endpoints ---

  if (expiryWorker) {
    router.post(
      '/v1/admin/expiry/dry-run',
      asyncRoute(async (req, res) => {
        requireAdmin(req);
        const tenantId = tenantOf(req);
        const result = await expiryWorker.runExpiry(tenantId, true);
        res.json(result);
      }),
    );

    router.post(
      '/v1/admin/expiry/backfill',
      asyncRoute(async (req, res) => {
        requireAdmin(req);
        const tenantId = tenantOf(req);
        const result = await expiryWorker.backfill(tenantId);
        res.json(result);
      }),
    );

    router.post(
      '/v1/admin/expiry/run',
      asyncRoute(async (req, res) => {
        requireAdmin(req);
        const tenantId = tenantOf(req);
        const result = await expiryWorker.runExpiry(tenantId, false);
        res.json(result);
      }),
    );
  }

  return router;
}
