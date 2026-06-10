import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '@loyalty/shared-errors';
import { ZodError } from 'zod';
import {
  dashboardParamsSchema,
  transactionQuerySchema,
  offersParamsSchema,
  tierProgressParamsSchema,
  notificationQuerySchema,
  pushRegisterSchema,
  notificationPreferencesSchema,
} from './schemas';
import type { MobileService } from './service';

function zodErr(err: unknown): ValidationError {
  if (err instanceof ZodError) {
    return new ValidationError('Invalid request', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return new ValidationError('Invalid request');
}

function requireTenantHeader(req: Request): string {
  const header = req.header('x-tenant-id');
  if (!header) throw new ValidationError('x-tenant-id header is required');
  return req.user?.tenantId ?? header;
}

export function mobileRouter(service: MobileService): Router {
  const router = Router();

  // GET /v1/mobile/dashboard/:memberId
  router.get('/dashboard/:memberId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const params = dashboardParamsSchema.parse(req.params);
      const dashboard = await service.getDashboard(tenantId, params.memberId);
      res.json(dashboard);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  // GET /v1/mobile/transactions/:memberId
  router.get(
    '/transactions/:memberId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = requireTenantHeader(req);
        const params = dashboardParamsSchema.parse(req.params);
        const query = transactionQuerySchema.parse(req.query);
        const result = await service.getTransactions(
          tenantId,
          params.memberId,
          query.limit,
          query.after,
        );
        res.json(result);
      } catch (err) {
        if (err instanceof ZodError) return next(zodErr(err));
        next(err);
      }
    },
  );

  // GET /v1/mobile/offers/:memberId
  router.get('/offers/:memberId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const params = offersParamsSchema.parse(req.params);
      const offers = await service.getOffers(tenantId, params.memberId);
      res.json({ offers });
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  // GET /v1/mobile/tier-progress/:memberId
  router.get(
    '/tier-progress/:memberId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = requireTenantHeader(req);
        const params = tierProgressParamsSchema.parse(req.params);
        const progress = await service.getTierProgress(tenantId, params.memberId);
        res.json(progress);
      } catch (err) {
        if (err instanceof ZodError) return next(zodErr(err));
        next(err);
      }
    },
  );

  // POST /v1/mobile/notifications/preferences
  router.post(
    '/notifications/preferences',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = requireTenantHeader(req);
        const body = notificationPreferencesSchema.parse(req.body);
        await service.updateNotificationPreferences(tenantId, body);
        res.status(204).send();
      } catch (err) {
        if (err instanceof ZodError) return next(zodErr(err));
        next(err);
      }
    },
  );

  // GET /v1/mobile/notifications/:memberId
  router.get(
    '/notifications/:memberId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = requireTenantHeader(req);
        const params = dashboardParamsSchema.parse(req.params);
        const query = notificationQuerySchema.parse(req.query);
        const notifications = await service.getNotifications(
          tenantId,
          params.memberId,
          query.limit,
        );
        res.json({ notifications });
      } catch (err) {
        if (err instanceof ZodError) return next(zodErr(err));
        next(err);
      }
    },
  );

  // POST /v1/mobile/push/register
  router.post('/push/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTenantHeader(req); // validates tenant header is present
      const body = pushRegisterSchema.parse(req.body);
      const registration = await service.registerPushDevice(body);
      res.status(201).json(registration);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  return router;
}
