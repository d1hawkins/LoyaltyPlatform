import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '@loyalty/shared-errors';

export type Role = 'owner' | 'manager' | 'analyst';

export const ROLE_RANK: Record<Role, number> = {
  analyst: 1,
  manager: 2,
  owner: 3,
};

/**
 * Extract the effective role(s) from the authenticated user.
 * Order of precedence:
 *  1. `req.user.roles` (populated from JWT claim `roles`)
 *  2. `x-user-role` header (dev only)
 */
export function extractRoles(req: Request): Role[] {
  const roles: Role[] = [];
  const userRoles = req.user?.roles;
  if (Array.isArray(userRoles)) {
    for (const r of userRoles) {
      if (r === 'owner' || r === 'manager' || r === 'analyst') {
        roles.push(r);
      }
    }
  }
  if (roles.length === 0) {
    const header = req.header('x-user-role');
    if (header === 'owner' || header === 'manager' || header === 'analyst') {
      roles.push(header);
    }
  }
  return roles;
}

/** Highest role the user holds, or null if none. */
export function highestRole(roles: Role[]): Role | null {
  let best: Role | null = null;
  for (const r of roles) {
    if (!best || ROLE_RANK[r] > ROLE_RANK[best]) {
      best = r;
    }
  }
  return best;
}

/**
 * Middleware factory: requires the caller to hold at least one of the allowed roles.
 * Ex: requireRole('owner'), requireRole('manager', 'owner'), requireRole('analyst','manager','owner').
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }
    const roles = extractRoles(req);
    if (roles.length === 0) {
      return next(new ForbiddenError('No admin role assigned'));
    }
    const ok = roles.some((r) => allowed.includes(r));
    if (!ok) {
      return next(
        new ForbiddenError(
          `Requires role: ${allowed.join(' or ')}; caller has: ${roles.join(',')}`,
        ),
      );
    }
    // stash highest role for audit logging
    (req as Request & { actorRole?: Role }).actorRole = highestRole(roles) ?? roles[0];
    return next();
  };
}
