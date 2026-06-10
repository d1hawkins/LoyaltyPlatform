import type { Request, Response, NextFunction } from 'express';

export interface AuditRecord {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  createdAt: string;
}

export interface AuditRepository {
  insert(record: AuditRecord): Promise<AuditRecord & { auditId: number }>;
  list(
    tenantId: string,
    filter: {
      entity?: string;
      entityId?: string;
      actor?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: Array<AuditRecord & { auditId: number }>; nextCursor?: string }>;
}

export class InMemoryAuditRepository implements AuditRepository {
  private rows: Array<AuditRecord & { auditId: number }> = [];
  private next = 1;

  async insert(record: AuditRecord): Promise<AuditRecord & { auditId: number }> {
    const row = { ...record, auditId: this.next++ };
    this.rows.push(row);
    return row;
  }

  async list(
    tenantId: string,
    filter: {
      entity?: string;
      entityId?: string;
      actor?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: Array<AuditRecord & { auditId: number }>; nextCursor?: string }> {
    let items = this.rows.filter((r) => r.tenantId === tenantId);
    if (filter.entity) items = items.filter((r) => r.entity === filter.entity);
    if (filter.entityId) items = items.filter((r) => r.entityId === filter.entityId);
    if (filter.actor) items = items.filter((r) => r.actorUserId === filter.actor);
    if (filter.action) items = items.filter((r) => r.action === filter.action);
    if (filter.from) items = items.filter((r) => r.createdAt >= filter.from!);
    if (filter.to) items = items.filter((r) => r.createdAt <= filter.to!);
    items = items.sort((a, b) => b.auditId - a.auditId);

    const limit = Math.min(filter.limit ?? 50, 500);
    const cursorIdx = filter.cursor ? Number.parseInt(filter.cursor, 10) : 0;
    const slice = items.slice(cursorIdx, cursorIdx + limit);
    const nextCursor = cursorIdx + limit < items.length ? String(cursorIdx + limit) : undefined;
    return { items: slice, nextCursor };
  }
}

/** Options for wrapping a mutating endpoint so it is audited. */
export interface AuditedMutationOptions<Before, After> {
  action: string;
  entity: string;
  extractEntityId: (req: Request) => string | null | undefined;
  before: (req: Request) => Promise<Before>;
  mutate: (req: Request, before: Before) => Promise<After>;
  // optional extractor for the post-state to log (defaults to the mutate result)
  after?: (req: Request, result: After) => unknown;
  reason?: (req: Request) => string | undefined;
  respond?: (res: Response, result: After) => void;
}

export function auditedMutation<Before, After>(
  repo: AuditRepository,
  opts: AuditedMutationOptions<Before, After>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      const beforeState = await opts.before(req);
      const result = await opts.mutate(req, beforeState);
      const afterState = opts.after ? opts.after(req, result) : result;

      await repo.insert({
        tenantId: req.user.tenantId,
        actorUserId: req.user.userId,
        actorRole: (req as Request & { actorRole?: string }).actorRole ?? 'unknown',
        action: opts.action,
        entity: opts.entity,
        entityId: opts.extractEntityId(req) ?? null,
        beforeJson: beforeState ?? null,
        afterJson: afterState ?? null,
        reason: opts.reason ? opts.reason(req) ?? null : null,
        ipAddress: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
        correlationId: req.correlationId ?? null,
        createdAt: new Date().toISOString(),
      });

      if (opts.respond) {
        opts.respond(res, result);
      } else {
        res.json(result);
      }
    } catch (err) {
      next(err);
    }
  };
}
