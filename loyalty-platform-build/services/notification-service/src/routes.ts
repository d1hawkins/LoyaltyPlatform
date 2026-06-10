import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from '@loyalty/shared-errors';
import type { NotificationService } from './service';

const channelSchema = z.enum(['email', 'sms', 'push']);

const sendSchema = z.object({
  memberId: z.string().uuid(),
  templateKey: z.string().min(1).max(100),
  channel: channelSchema,
  locale: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  triggeredByEventId: z.string().uuid().optional(),
});

const preferenceSchema = z.object({
  templateKey: z.string().min(1).max(100),
  channel: channelSchema,
  optedIn: z.boolean(),
});

const logQuerySchema = z.object({
  memberId: z.string().uuid().optional(),
  status: z.enum(['pending', 'sent', 'failed', 'suppressed']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function zodErr(err: unknown): ValidationError {
  if (err instanceof ZodError) {
    return new ValidationError('Invalid request', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return new ValidationError('Invalid request');
}

function requireTenantId(req: Request): string {
  const tenantId = req.user?.tenantId ?? req.header('x-tenant-id');
  if (!tenantId) throw new ValidationError('x-tenant-id required');
  return tenantId;
}

export function notificationRouter(service: NotificationService): Router {
  const router = Router();

  router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantId(req);
      const body = sendSchema.parse(req.body);
      const result = await service.send(tenantId, body);
      res.status(202).json(result);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      return next(err);
    }
  });

  router.get('/log', async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTenantId(req);
      const q = logQuerySchema.parse(req.query);
      const rows = await service.listLog(q);
      res.json({ items: rows, limit: q.limit, offset: q.offset });
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      return next(err);
    }
  });

  router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ templates: service.getTemplates() });
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    '/preferences/:memberId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireTenantId(req);
        const memberId = req.params.memberId as string;
        if (!memberId) throw new ValidationError('memberId path param required');
        const body = preferenceSchema.parse(req.body);
        await service.updatePreference(memberId, body.templateKey, body.channel, body.optedIn);
        res.status(204).end();
      } catch (err) {
        if (err instanceof ZodError) return next(zodErr(err));
        return next(err);
      }
    },
  );

  return router;
}
