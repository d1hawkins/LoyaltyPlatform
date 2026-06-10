import { InMemoryAuditRepository, auditedMutation } from '../src/audit';
import type { Request, Response, NextFunction } from 'express';

describe('audit middleware', () => {
  it('records before + after + reason', async () => {
    const repo = new InMemoryAuditRepository();
    const handler = auditedMutation(repo, {
      action: 'thing.update',
      entity: 'thing',
      extractEntityId: () => 'thing-1',
      before: async () => ({ value: 'old' }),
      mutate: async () => ({ value: 'new' }),
      reason: () => 'because',
    });
    const req = {
      user: { userId: 'u1', tenantId: 't1' },
      correlationId: 'c1',
      ip: '1.2.3.4',
      header: () => 'jest',
      body: {},
    } as unknown as Request & { actorRole?: string };
    (req as Request & { actorRole?: string }).actorRole = 'manager';
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;
    await handler(req, res, next);

    const page = await repo.list('t1', {});
    expect(page.items).toHaveLength(1);
    const row = page.items[0]!;
    expect(row.action).toBe('thing.update');
    expect(row.entity).toBe('thing');
    expect(row.entityId).toBe('thing-1');
    expect(row.beforeJson).toEqual({ value: 'old' });
    expect(row.afterJson).toEqual({ value: 'new' });
    expect(row.reason).toBe('because');
    expect(row.actorRole).toBe('manager');
    expect(res.json).toHaveBeenCalledWith({ value: 'new' });
  });

  it('passes errors to next()', async () => {
    const repo = new InMemoryAuditRepository();
    const handler = auditedMutation(repo, {
      action: 'x',
      entity: 'x',
      extractEntityId: () => null,
      before: async () => null,
      mutate: async () => {
        throw new Error('boom');
      },
    });
    const req = { user: { userId: 'u', tenantId: 't' }, header: () => undefined, body: {} } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;
    await handler(req, res, next);
    expect(next).toHaveBeenCalled();
    const page = await repo.list('t', {});
    expect(page.items).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const repo = new InMemoryAuditRepository();
    const handler = auditedMutation(repo, {
      action: 'x',
      entity: 'x',
      extractEntityId: () => null,
      before: async () => null,
      mutate: async () => ({}),
    });
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;
    const req = { header: () => undefined, body: {} } as unknown as Request;
    await handler(req, res, jest.fn() as NextFunction);
    expect(status).toHaveBeenCalledWith(401);
  });
});
