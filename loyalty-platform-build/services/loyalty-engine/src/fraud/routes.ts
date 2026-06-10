/**
 * Admin fraud management routes — mounted at /v1/admin/fraud.
 * All endpoints require admin role.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ForbiddenError, NotFoundError, ValidationError } from '@loyalty/shared-errors';
import type { FraudRepository } from './types';

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function tenantOf(req: Request): string {
  const t = req.user?.tenantId || req.header('x-tenant-id');
  if (!t) throw new ValidationError('tenantId missing');
  return t;
}

function requireAdmin(req: Request): string {
  const roles = req.user?.roles ?? [];
  const headerRole = req.header('x-user-role');
  const claimRole = req.user?.claims?.role as string | undefined;
  const isAdmin = roles.includes('admin') || headerRole === 'admin' || claimRole === 'admin';
  const isOwner = roles.includes('owner') || headerRole === 'owner' || claimRole === 'owner';
  if (!isAdmin && !isOwner) throw new ForbiddenError('admin role required');
  return req.user?.userId || req.header('x-user-id') || 'unknown';
}

export function buildFraudAdminRoutes(repo: FraudRepository): Router {
  const router = Router();

  // GET /v1/admin/fraud/flags — list fraud flags
  router.get(
    '/v1/admin/fraud/flags',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdmin(req);
      const { memberId, status, severity, limit, offset } = req.query;
      const flags = await repo.getFlags(tenantId, {
        memberId: memberId as string | undefined,
        status: status as string | undefined,
        severity: severity as string | undefined,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });
      res.json({ items: flags, count: flags.length });
    }),
  );

  // POST /v1/admin/fraud/flags/:id/review — review a fraud flag
  router.post(
    '/v1/admin/fraud/flags/:id/review',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const reviewer = requireAdmin(req);
      const { status, notes } = req.body ?? {};
      if (!status || !['dismissed', 'confirmed'].includes(status)) {
        throw new ValidationError('status must be "dismissed" or "confirmed"');
      }
      const updated = await repo.reviewFlag(tenantId, req.params.id as string, {
        status,
        reviewedBy: reviewer,
        reviewNotes: notes,
      });
      if (!updated) throw new NotFoundError('fraud flag not found');
      res.json(updated);
    }),
  );

  // GET /v1/admin/fraud/rules — list fraud rules
  router.get(
    '/v1/admin/fraud/rules',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdmin(req);
      const rules = await repo.getRules(tenantId);
      res.json({ items: rules });
    }),
  );

  // PUT /v1/admin/fraud/rules/:ruleCode — update rule config
  router.put(
    '/v1/admin/fraud/rules/:ruleCode',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const headerRole = req.header('x-user-role');
      const roles = req.user?.roles ?? [];
      const isOwner = roles.includes('owner') || headerRole === 'owner';
      const isAdmin = roles.includes('admin') || headerRole === 'admin';
      if (!isOwner && !isAdmin) throw new ForbiddenError('owner or admin role required');

      const { isEnabled, severity, config } = req.body ?? {};
      const updated = await repo.updateRule(tenantId, req.params.ruleCode as string, {
        isEnabled,
        severity,
        configJson: config ? JSON.stringify(config) : undefined,
      });
      if (!updated) throw new NotFoundError('fraud rule not found');
      res.json(updated);
    }),
  );

  // GET /v1/admin/fraud/stats — summary statistics
  router.get(
    '/v1/admin/fraud/stats',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdmin(req);
      const stats = await repo.getFlagStats(tenantId);
      res.json(stats);
    }),
  );

  return router;
}
