import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '@loyalty/shared-errors';
import { requireRole } from './rbac';
import { auditedMutation, type AuditRepository } from './audit';
import { partitionBulk, BULK_MAX_IDS } from './bulk';
import { streamCsv } from './csv';
import type {
  ProgramConfigRepository,
  TierRepository,
  WebhookRepository,
  ApiKeyRepository,
  FeatureFlagRepository,
  MemberClient,
  LoyaltyEngineClient,
  WebhookWorkerClient,
} from './repositories';

export interface RoutesDeps {
  audit: AuditRepository;
  programConfig: ProgramConfigRepository;
  tiers: TierRepository;
  webhooks: WebhookRepository;
  apiKeys: ApiKeyRepository;
  featureFlags: FeatureFlagRepository;
  transactions?: import('./repositories').TransactionRepository;
  members: MemberClient;
  loyaltyEngine: LoyaltyEngineClient;
  webhookWorker: WebhookWorkerClient;
  /** deterministic id/token generator for tests */
  idGen?: () => string;
  /** deterministic plaintext key generator for tests */
  keyGen?: () => string;
  /** hashing function (bcrypt in prod, identity in tests) */
  hashFn?: (plaintext: string) => Promise<string>;
}

const DEFAULT_ID_GEN = () => `id_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

function pathParam(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || v.length === 0) {
    throw new ValidationError(`missing path parameter: ${name}`);
  }
  return v;
}

export function buildRouter(deps: RoutesDeps): Router {
  const router = Router();
  const idGen = deps.idGen ?? DEFAULT_ID_GEN;
  const keyGen = deps.keyGen ?? (() => `sk_live_${Math.random().toString(36).slice(2)}`);
  const hashFn = deps.hashFn ?? (async (p: string) => `hash:${p}`);

  // ---------------------------------------------------------------------
  // Program config
  // ---------------------------------------------------------------------

  router.get(
    '/program',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const row = await deps.programConfig.get(req.user!.tenantId);
        if (!row) return next(new NotFoundError('program_config not found'));
        res.json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  const programUpdateSchema = z.object({
    configJson: z.record(z.unknown()).optional(),
    programName: z.string().optional(),
    baseEarnRate: z.number().optional(),
    pointsExpiryDays: z.number().optional(),
    voidWindowHours: z.number().optional(),
    currency: z.string().optional(),
    timezone: z.string().optional(),
    earnMode: z.enum(['per-dollar', 'per-visit']).optional(),
    pointsPerVisit: z.number().int().min(1).optional(),
    visitMinSpendCents: z.number().int().min(0).optional(),
    maxVisitsPerDay: z.number().int().min(1).optional().nullable(),
    reason: z.string().optional(),
  }).transform((data) => ({
    configJson: data.configJson ?? {
      ...(data.programName ? { programName: data.programName } : {}),
      ...(data.baseEarnRate !== undefined ? { baseEarnRate: data.baseEarnRate } : {}),
      ...(data.pointsExpiryDays !== undefined ? { pointsExpiryDays: data.pointsExpiryDays } : {}),
      ...(data.voidWindowHours !== undefined ? { voidWindowHours: data.voidWindowHours } : {}),
      ...(data.currency ? { currency: data.currency } : {}),
      ...(data.timezone ? { timezone: data.timezone } : {}),
      ...(data.earnMode !== undefined ? { earnMode: data.earnMode } : {}),
      ...(data.pointsPerVisit !== undefined ? { pointsPerVisit: data.pointsPerVisit } : {}),
      ...(data.visitMinSpendCents !== undefined ? { visitMinSpendCents: data.visitMinSpendCents } : {}),
      ...(data.maxVisitsPerDay !== undefined ? { maxVisitsPerDay: data.maxVisitsPerDay } : {}),
    },
    reason: data.reason,
  }));

  router.put(
    '/program',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'program.update',
      entity: 'program_config',
      extractEntityId: (req) => req.user?.tenantId ?? null,
      before: async (req) => deps.programConfig.get(req.user!.tenantId),
      mutate: async (req) => {
        const parsed = programUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid program config body');
        return deps.programConfig.update(req.user!.tenantId, parsed.data.configJson);
      },
      reason: (req) => (req.body?.reason as string | undefined) ?? undefined,
    }),
  );

  router.get(
    '/program/version-history',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const history = await deps.audit.list(req.user!.tenantId, {
          entity: 'program_config',
          limit: Number.parseInt((req.query.limit as string) ?? '50', 10),
        });
        res.json(history);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------
  // Tiers
  // ---------------------------------------------------------------------

  router.get(
    '/tiers',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const rows = await deps.tiers.list(req.user!.tenantId);
        res.json({ items: rows });
      } catch (err) {
        next(err);
      }
    },
  );

  const tierCreateSchema = z.object({
    name: z.string().min(1),
    rank: z.number().int().nonnegative(),
    thresholdPoints: z.number().int().nonnegative(),
    benefits: z.record(z.unknown()).default({}),
    reason: z.string().optional(),
  });

  router.post(
    '/tiers',
    requireRole('owner'),
    auditedMutation(deps.audit, {
      action: 'tier.create',
      entity: 'tier',
      extractEntityId: (req) =>
        (req as Request & { createdTierId?: string }).createdTierId ?? null,
      before: async () => null,
      mutate: async (req) => {
        const parsed = tierCreateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid tier body');
        const id = idGen();
        (req as Request & { createdTierId?: string }).createdTierId = id;
        return deps.tiers.create({
          id,
          tenantId: req.user!.tenantId,
          name: parsed.data.name,
          rank: parsed.data.rank,
          thresholdPoints: parsed.data.thresholdPoints,
          benefits: parsed.data.benefits,
          isActive: true,
        });
      },
      reason: (req) => req.body?.reason,
      respond: (res, row) => {
        res.status(201).json(row);
      },
    }),
  );

  const tierUpdateSchema = z.object({
    name: z.string().optional(),
    rank: z.number().int().nonnegative().optional(),
    thresholdPoints: z.number().int().nonnegative().optional(),
    benefits: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
    reason: z.string().optional(),
  });

  router.put(
    '/tiers/:id',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'tier.update',
      entity: 'tier',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.tiers.get(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('tier not found');
        const parsed = tierUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid tier body');
        const { reason: _r, ...patch } = parsed.data;
        const updated = await deps.tiers.update(req.user!.tenantId, pathParam(req,'id'), patch);
        if (!updated) throw new NotFoundError('tier not found');
        return updated;
      },
      reason: (req) => req.body?.reason,
    }),
  );

  router.delete(
    '/tiers/:id',
    requireRole('owner'),
    auditedMutation(deps.audit, {
      action: 'tier.delete',
      entity: 'tier',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.tiers.get(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('tier not found');
        const row = await deps.tiers.deactivate(req.user!.tenantId, pathParam(req,'id'));
        return row;
      },
    }),
  );

  // ---------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------

  router.get(
    '/members/search',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const result = await deps.members.search(req.user!.tenantId, {
          q: req.query.q as string | undefined,
          tierId: req.query.tierId as string | undefined,
          status: req.query.status as string | undefined,
          limit: req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined,
          cursor: req.query.cursor as string | undefined,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/members/export.csv',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const all = await deps.members.search(req.user!.tenantId, {
          q: req.query.q as string | undefined,
          tierId: req.query.tierId as string | undefined,
          status: req.query.status as string | undefined,
          limit: 1000,
        });
        await streamCsv(
          res,
          'members.csv',
          ['id', 'firstName', 'lastName', 'status', 'tierId', 'pointsBalance', 'enrolledAt'],
          all.items as unknown as Array<Record<string, unknown>>,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/members/:id',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const row = await deps.members.getById(req.user!.tenantId, pathParam(req,'id'));
        if (!row) return next(new NotFoundError('member not found'));
        res.json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  const pointsAdjustSchema = z.object({
    delta: z.number().int(),
    reasonCode: z.string().min(1),
    notes: z.string().optional(),
  });

  router.post(
    '/members/:id/points-adjust',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'points.adjust',
      entity: 'member',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.members.getById(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('member not found');
        const parsed = pointsAdjustSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid points-adjust body');
        return deps.loyaltyEngine.adjustPoints(
          req.user!.tenantId,
          pathParam(req,'id'),
          parsed.data.delta,
          parsed.data.reasonCode,
          parsed.data.notes,
        );
      },
      reason: (req) => req.body?.reasonCode,
    }),
  );

  const tierOverrideSchema = z.object({
    toTierId: z.string().min(1),
    reason: z.string().min(1),
  });

  router.post(
    '/members/:id/tier-override',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'tier.override',
      entity: 'member',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.members.getById(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('member not found');
        const parsed = tierOverrideSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid tier-override body');
        return deps.loyaltyEngine.overrideTier(
          req.user!.tenantId,
          pathParam(req,'id'),
          parsed.data.toTierId,
          parsed.data.reason,
        );
      },
      reason: (req) => req.body?.reason,
    }),
  );

  const statusSchema = z.object({
    status: z.enum(['active', 'suspended', 'closed']),
    reason: z.string().min(1),
  });

  router.post(
    '/members/:id/status',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'member.status',
      entity: 'member',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.members.getById(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('member not found');
        const parsed = statusSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid status body');
        return deps.members.setStatus(req.user!.tenantId, pathParam(req,'id'), parsed.data.status);
      },
      reason: (req) => req.body?.reason,
    }),
  );

  const gdprDeleteSchema = z.object({
    confirm: z.boolean().optional(),
    reason: z.string().min(1),
  });

  router.post(
    '/members/:id/gdpr-delete',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'member.gdpr_delete',
      entity: 'member',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.members.getById(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('member not found');
        const parsed = gdprDeleteSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid gdpr-delete body');
        // Only owners may actually confirm the delete; managers can request.
        const actor = (req as Request & { actorRole?: string }).actorRole;
        const effectiveConfirm = Boolean(parsed.data.confirm);
        if (effectiveConfirm && actor !== 'owner') {
          throw new ForbiddenError('only owner may confirm gdpr delete');
        }
        const deleted = await deps.members.gdprDelete(
          req.user!.tenantId,
          pathParam(req,'id'),
          effectiveConfirm,
        );
        return { deleted, requested: !effectiveConfirm };
      },
      reason: (req) => req.body?.reason,
    }),
  );

  const bulkSchema = z.object({
    action: z.enum(['adjust', 'status', 'tag']),
    memberIds: z.array(z.string()).max(BULK_MAX_IDS),
    payload: z.record(z.unknown()).optional(),
  });

  router.post(
    '/members/bulk',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'member.bulk',
      entity: 'member',
      extractEntityId: () => null,
      before: async () => null,
      mutate: async (req) => {
        const parsed = bulkSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid bulk body');
        const part = partitionBulk(parsed.data.memberIds);
        return {
          action: parsed.data.action,
          total: part.total,
          chunkCount: part.chunks.length,
          acceptedAt: new Date().toISOString(),
        };
      },
    }),
  );

  // ---------------------------------------------------------------------
  // Transactions (read-only, from tenant DB)
  // ---------------------------------------------------------------------

  router.get(
    '/transactions',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        if (!deps.transactions) {
          res.json({ items: [], nextCursor: undefined });
          return;
        }
        const result = await deps.transactions.list(req.user!.tenantId, {
          memberId: req.query.memberId as string | undefined,
          limit: req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined,
          cursor: req.query.cursor as string | undefined,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------
  // API keys (control plane, owner only)
  // ---------------------------------------------------------------------

  router.get('/apikeys', requireRole('owner'), async (req, res, next) => {
    try {
      const items = await deps.apiKeys.list(req.user!.tenantId);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  const apiKeyCreateSchema = z.object({
    label: z.string().min(1),
    scope: z.enum(['read', 'read-write']).default('read-write'),
    reason: z.string().optional(),
  });

  router.post(
    '/apikeys',
    requireRole('owner'),
    auditedMutation(deps.audit, {
      action: 'apikey.create',
      entity: 'api_key',
      extractEntityId: (req) =>
        (req as Request & { createdKeyId?: string }).createdKeyId ?? null,
      before: async () => null,
      mutate: async (req) => {
        const parsed = apiKeyCreateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid apikey body');
        const plaintext = keyGen();
        const keyHash = await hashFn(plaintext);
        const row = await deps.apiKeys.create({
          tenantId: req.user!.tenantId,
          label: parsed.data.label,
          scope: parsed.data.scope,
          keyHash,
        });
        (req as Request & { createdKeyId?: string }).createdKeyId = row.keyId;
        // Plaintext is only returned once, never logged to audit.
        return { ...row, plaintextKey: plaintext };
      },
      // Strip plaintext before auditing.
      after: (_req, row) => {
        const { plaintextKey: _ignored, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      reason: (req) => req.body?.reason,
      respond: (res, row) => {
        res.status(201).json(row);
      },
    }),
  );

  router.delete(
    '/apikeys/:id',
    requireRole('owner'),
    auditedMutation(deps.audit, {
      action: 'apikey.revoke',
      entity: 'api_key',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async () => null,
      mutate: async (req) => {
        const row = await deps.apiKeys.revoke(req.user!.tenantId, pathParam(req,'id'));
        if (!row) throw new NotFoundError('api key not found');
        return row;
      },
    }),
  );

  // ---------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------

  router.get('/webhooks', requireRole('manager', 'owner'), async (req, res, next) => {
    try {
      const items = await deps.webhooks.list(req.user!.tenantId);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  const webhookCreateSchema = z.object({
    eventType: z.string().min(1),
    targetUrl: z.string().url(),
    isActive: z.boolean().default(true),
    reason: z.string().optional(),
  });

  router.post(
    '/webhooks',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'webhook.create',
      entity: 'webhook',
      extractEntityId: (req) =>
        (req as Request & { createdWebhookId?: string }).createdWebhookId ?? null,
      before: async () => null,
      mutate: async (req) => {
        const parsed = webhookCreateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid webhook body');
        const id = idGen();
        (req as Request & { createdWebhookId?: string }).createdWebhookId = id;
        return deps.webhooks.create({
          id,
          tenantId: req.user!.tenantId,
          eventType: parsed.data.eventType,
          targetUrl: parsed.data.targetUrl,
          isActive: parsed.data.isActive,
          retryCount: 0,
          createdAt: new Date().toISOString(),
        });
      },
      reason: (req) => req.body?.reason,
      respond: (res, row) => {
        res.status(201).json(row);
      },
    }),
  );

  const webhookUpdateSchema = z.object({
    targetUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
    eventType: z.string().optional(),
    reason: z.string().optional(),
  });

  router.put(
    '/webhooks/:id',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'webhook.update',
      entity: 'webhook',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.webhooks.get(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('webhook not found');
        const parsed = webhookUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid webhook body');
        const { reason: _r, ...patch } = parsed.data;
        const row = await deps.webhooks.update(req.user!.tenantId, pathParam(req,'id'), patch);
        if (!row) throw new NotFoundError('webhook not found');
        return row;
      },
      reason: (req) => req.body?.reason,
    }),
  );

  router.delete(
    '/webhooks/:id',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'webhook.delete',
      entity: 'webhook',
      extractEntityId: (req) => pathParam(req,'id'),
      before: async (req) => deps.webhooks.get(req.user!.tenantId, pathParam(req,'id')),
      mutate: async (req, before) => {
        if (!before) throw new NotFoundError('webhook not found');
        const removed = await deps.webhooks.remove(req.user!.tenantId, pathParam(req,'id'));
        return { removed };
      },
    }),
  );

  router.post(
    '/webhooks/:id/test',
    requireRole('manager', 'owner'),
    async (req, res, next) => {
      try {
        const exists = await deps.webhooks.get(req.user!.tenantId, pathParam(req,'id'));
        if (!exists) return next(new NotFoundError('webhook not found'));
        const result = await deps.webhookWorker.test(req.user!.tenantId, pathParam(req,'id'));
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/webhooks/:id/deliveries',
    requireRole('manager', 'owner'),
    async (req, res, next) => {
      try {
        const items = await deps.webhookWorker.listDeliveries(
          req.user!.tenantId,
          pathParam(req,'id'),
          req.query.status as string | undefined,
        );
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------

  router.get(
    '/audit',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const result = await deps.audit.list(req.user!.tenantId, {
          entity: req.query.entity as string | undefined,
          actor: req.query.actor as string | undefined,
          action: req.query.action as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          limit: req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined,
          cursor: req.query.cursor as string | undefined,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/audit/export.csv',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const page = await deps.audit.list(req.user!.tenantId, {
          entity: req.query.entity as string | undefined,
          actor: req.query.actor as string | undefined,
          action: req.query.action as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          limit: 1000,
        });
        const rows = page.items.map((r) => ({
          auditId: r.auditId,
          actorUserId: r.actorUserId,
          actorRole: r.actorRole,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId ?? '',
          reason: r.reason ?? '',
          createdAt: r.createdAt,
        }));
        await streamCsv(
          res,
          'audit.csv',
          ['auditId', 'actorUserId', 'actorRole', 'action', 'entity', 'entityId', 'reason', 'createdAt'],
          rows,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------

  router.get(
    '/feature-flags',
    requireRole('manager', 'owner'),
    async (req, res, next) => {
      try {
        const items = await deps.featureFlags.list(req.user!.tenantId);
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  const featureFlagUpdateSchema = z.object({
    enabled: z.boolean(),
    valueJson: z.record(z.unknown()).optional(),
    reason: z.string().optional(),
  });

  router.put(
    '/feature-flags/:key',
    requireRole('owner'),
    auditedMutation(deps.audit, {
      action: 'feature_flag.update',
      entity: 'feature_flag',
      extractEntityId: (req) => pathParam(req,'key'),
      before: async (req) => deps.featureFlags.get(req.user!.tenantId, pathParam(req,'key')),
      mutate: async (req) => {
        const parsed = featureFlagUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid feature flag body');
        return deps.featureFlags.upsert({
          tenantId: req.user!.tenantId,
          flagKey: pathParam(req,'key'),
          enabled: parsed.data.enabled,
          valueJson: parsed.data.valueJson ?? null,
          updatedAt: new Date().toISOString(),
        });
      },
      reason: (req) => req.body?.reason,
    }),
  );

  // ---------------------------------------------------------------------
  // Branding
  // ---------------------------------------------------------------------

  router.get(
    '/branding',
    requireRole('analyst', 'manager', 'owner'),
    async (req, res, next) => {
      try {
        const cfg = await deps.programConfig.get(req.user!.tenantId);
        const branding =
          (cfg?.configJson as { branding?: Record<string, unknown> } | undefined)?.branding ?? {};
        res.json(branding);
      } catch (err) {
        next(err);
      }
    },
  );

  const brandingUpdateSchema = z.object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    senderName: z.string().optional(),
    reason: z.string().optional(),
  });

  router.put(
    '/branding',
    requireRole('manager', 'owner'),
    auditedMutation(deps.audit, {
      action: 'branding.update',
      entity: 'program_config',
      extractEntityId: (req) => req.user?.tenantId ?? null,
      before: async (req) => deps.programConfig.get(req.user!.tenantId),
      mutate: async (req, before) => {
        const parsed = brandingUpdateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid branding body');
        const { reason: _r, ...branding } = parsed.data;
        const next = {
          ...(before?.configJson ?? {}),
          branding: { ...((before?.configJson as { branding?: Record<string, unknown> } | undefined)?.branding ?? {}), ...branding },
        };
        return deps.programConfig.update(req.user!.tenantId, next);
      },
      reason: (req) => req.body?.reason,
    }),
  );

  return router;
}
