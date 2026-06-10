import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '@loyalty/shared-errors';
import { ZodError } from 'zod';
import {
  enrollMemberSchema,
  ledgerQuerySchema,
  lookupQuerySchema,
  setMemberStatusSchema,
  updateMemberSchema,
} from './schemas';
import type { MemberService } from './service';

function zodErr(err: unknown): ValidationError {
  if (err instanceof ZodError) {
    return new ValidationError('Invalid request body', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return new ValidationError('Invalid request');
}

function requireTenantHeader(req: Request): string {
  const header = req.header('x-tenant-id');
  if (!header) throw new ValidationError('x-tenant-id header is required');
  const tenantId = req.user?.tenantId ?? header;
  return tenantId;
}

export function memberRouter(service: MemberService): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const body = enrollMemberSchema.parse(req.body);
      const dto = await service.enroll(tenantId, body);
      res.status(201).json(dto);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      return next(err);
    }
  });

  // Lookup via query string OR list — for this service we only support lookups.
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const q = lookupQuerySchema.parse(req.query);
      if (q.phone) {
        const dto = await service.lookupByPhone(tenantId, q.phone);
        return res.json(dto);
      }
      if (q.email) {
        const dto = await service.lookupByEmail(tenantId, q.email);
        return res.json(dto);
      }
      throw new ValidationError('phone or email query parameter is required');
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      return next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const dto = await service.getById(tenantId, req.params.id as string);
      res.json(dto);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const body = updateMemberSchema.parse(req.body);
      const dto = await service.update(tenantId, req.params.id as string, body);
      res.json(dto);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  router.post('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const body = setMemberStatusSchema.parse(req.body);
      const dto = await service.setStatus(
        tenantId,
        req.params.id as string,
        body.status,
        body.reason,
      );
      res.json(dto);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      await service.deleteMember(tenantId, req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const data = await service.exportMember(tenantId, req.params.id as string);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = requireTenantHeader(req);
      const q = ledgerQuerySchema.parse(req.query);
      const page = await service.listLedger(tenantId, req.params.id as string, q.after, q.limit);
      res.json(page);
    } catch (err) {
      if (err instanceof ZodError) return next(zodErr(err));
      next(err);
    }
  });

  return router;
}
