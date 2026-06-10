import type { Request, Response, NextFunction } from 'express';
import { requireRole, extractRoles, highestRole } from '../src/rbac';

function makeReq(opts: {
  user?: { userId: string; tenantId: string; roles?: string[] };
  header?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (opts.header) headers['x-user-role'] = opts.header;
  return {
    user: opts.user,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe('RBAC middleware', () => {
  it('extracts roles from req.user.roles', () => {
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1', roles: ['manager'] } });
    expect(extractRoles(req)).toEqual(['manager']);
  });

  it('falls back to x-user-role header when no user.roles', () => {
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1' }, header: 'analyst' });
    expect(extractRoles(req)).toEqual(['analyst']);
  });

  it('ignores unknown roles', () => {
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1', roles: ['superking'] } });
    expect(extractRoles(req)).toEqual([]);
  });

  it('highestRole picks owner over manager over analyst', () => {
    expect(highestRole(['analyst', 'manager'])).toBe('manager');
    expect(highestRole(['analyst', 'owner', 'manager'])).toBe('owner');
    expect(highestRole([])).toBeNull();
  });

  it('requireRole(owner) rejects manager', (done) => {
    const mw = requireRole('owner');
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1', roles: ['manager'] } });
    mw(req, {} as Response, ((err: unknown) => {
      expect(err).toBeDefined();
      expect((err as Error).message).toContain('Requires role');
      done();
    }) as NextFunction);
  });

  it('requireRole(owner) allows owner', (done) => {
    const mw = requireRole('owner');
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1', roles: ['owner'] } });
    mw(req, {} as Response, ((err: unknown) => {
      expect(err).toBeUndefined();
      done();
    }) as NextFunction);
  });

  it('requireRole rejects unauthenticated callers', (done) => {
    const mw = requireRole('manager', 'owner');
    const req = makeReq({});
    mw(req, {} as Response, ((err: unknown) => {
      expect(err).toBeDefined();
      expect((err as Error & { statusCode?: number }).statusCode).toBe(401);
      done();
    }) as NextFunction);
  });

  it('requireRole rejects authenticated caller with no admin role', (done) => {
    const mw = requireRole('analyst', 'manager', 'owner');
    const req = makeReq({ user: { userId: 'u1', tenantId: 't1', roles: [] } });
    mw(req, {} as Response, ((err: unknown) => {
      expect(err).toBeDefined();
      expect((err as Error & { statusCode?: number }).statusCode).toBe(403);
      done();
    }) as NextFunction);
  });
});
