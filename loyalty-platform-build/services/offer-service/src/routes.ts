import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ForbiddenError, ValidationError } from '@loyalty/shared-errors';
import { OfferService } from './service';
import {
  createOfferSchema,
  updateOfferSchema,
  createRedemptionSchema,
  reverseRedemptionSchema,
  generateCodesSchema,
} from './schemas';

function parseOrThrow<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError(err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
    }
    throw err;
  }
}

function tenantOf(req: Request): string {
  const t = req.user?.tenantId || req.header('x-tenant-id');
  if (!t) throw new ValidationError('tenantId missing');
  return t;
}

function requireAdminOrManager(req: Request): void {
  const roles = req.user?.roles ?? [];
  const headerRole = req.header('x-user-role');
  const claimRole = req.user?.claims?.role as string | undefined;
  const allowed = ['admin', 'manager', 'owner'];
  const isAllowed =
    roles.some((r) => allowed.includes(r)) ||
    (headerRole !== undefined && allowed.includes(headerRole)) ||
    (claimRole !== undefined && allowed.includes(claimRole));
  if (!isAllowed) throw new ForbiddenError('admin or manager role required');
}

function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function buildRoutes(service: OfferService): Router {
  const router = Router();

  // ─── Offer CRUD ───

  router.get(
    '/v1/offers',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const type = req.query.type as string | undefined;
      const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
      const offers = await service.listOffers(tenantId, { type, active });
      res.json({ items: offers });
    }),
  );

  router.get(
    '/v1/offers/:id',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const offer = await service.getOffer(tenantId, req.params.id as string);
      res.json(offer);
    }),
  );

  router.post(
    '/v1/offers',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdminOrManager(req);
      const input = parseOrThrow(() => createOfferSchema.parse(req.body));
      const offer = await service.createOffer(tenantId, input);
      res.status(201).json(offer);
    }),
  );

  router.put(
    '/v1/offers/:id',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdminOrManager(req);
      const input = parseOrThrow(() => updateOfferSchema.parse(req.body));
      const offer = await service.updateOffer(tenantId, req.params.id as string, input);
      res.json(offer);
    }),
  );

  router.delete(
    '/v1/offers/:id',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdminOrManager(req);
      await service.deactivateOffer(tenantId, req.params.id as string);
      res.status(204).end();
    }),
  );

  // ─── Personalized eligible offers ───

  router.get(
    '/v1/members/:memberId/offers',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const offers = await service.getEligibleOffers(tenantId, req.params.memberId as string);
      res.json({ items: offers });
    }),
  );

  // ─── Redemptions ───

  router.post(
    '/v1/redemptions',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const input = parseOrThrow(() => createRedemptionSchema.parse(req.body));
      const result = await service.redeemOffer(tenantId, input);
      res.status(201).json(result);
    }),
  );

  router.post(
    '/v1/redemptions/:id/reverse',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      parseOrThrow(() => reverseRedemptionSchema.parse(req.body ?? {}));
      const result = await service.reverseRedemption(tenantId, req.params.id as string);
      res.json(result);
    }),
  );

  // ─── Offer Codes ───

  router.post(
    '/v1/offers/:id/generate-codes',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      requireAdminOrManager(req);
      const input = parseOrThrow(() => generateCodesSchema.parse(req.body));
      const result = await service.generateCodes(tenantId, req.params.id as string, input);
      res.status(201).json(result);
    }),
  );

  router.get(
    '/v1/offers/:id/codes',
    asyncRoute(async (req, res) => {
      const tenantId = tenantOf(req);
      const status = req.query.status as string | undefined;
      const result = await service.listCodes(tenantId, req.params.id as string, status);
      res.json(result);
    }),
  );

  // ── Internal: Visit milestone check (called by loyalty-engine after each transaction) ──
  router.post('/v1/internal/milestones/check', asyncRoute(async (req, res) => {
    const tenantId = req.header('x-tenant-id') || '';
    const { memberId } = req.body as { memberId: string; amountCents?: number };
    if (!memberId) { res.json({ checked: 0, triggered: [] }); return; }

    const allOffersRaw = await service.listOffers(tenantId, { active: true });
    const allOffers = (Array.isArray(allOffersRaw) ? allOffersRaw : []) as unknown as Record<string, unknown>[];
    const visitOffers = allOffers.filter(o => o.minVisits && (o.minVisits as number) > 0);

    const triggered: Array<{ offerId: string; name: string; code: string }> = [];

    for (const offer of visitOffers) {
      const o = offer as Record<string, unknown>;
      const visitCount = await service.getQualifiedVisitCountForMilestone(tenantId, memberId, {
        windowDays: o.visitWindowDays as number | null,
        minSpendCents: o.visitMinSpendCents as number | null,
        minItems: o.visitMinItems as number | null,
        channels: o.visitChannels as string[] | null,
        storeIds: o.visitStoreIds as string[] | null,
        visitCountMode: (o.visitCountMode as string) || 'per-transaction',
      });

      if (visitCount === (o.minVisits as number)) {
        // Generate coupon code
        const code = `DAISO-${(o.offerId as string).slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        triggered.push({ offerId: o.offerId as string, name: o.name as string, code });

        // Persist the code bound to this member
        await service.insertOfferCode(tenantId, {
          code,
          offerId: o.offerId as string,
          memberId,
          status: 'assigned',
        });

        // Send SMS via notification service
        const notifUrl = process.env.NOTIFICATION_SERVICE_URL;
        if (notifUrl) {
          fetch(`${notifUrl}/v1/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'x-user-id': 'system', 'x-user-role': 'owner' },
            body: JSON.stringify({
              memberId,
              templateKey: 'visit_milestone_coupon',
              channel: 'sms',
              variables: {
                offerName: o.name,
                couponCode: code,
                value: o.type === 'percent' ? `${o.value}%` : `$${(o.value as number).toFixed(2)}`,
              },
            }),
          }).catch(() => { /* best-effort */ });
        }
      }
    }

    res.json({ checked: visitOffers.length, triggered });
  }));

  return router;
}
