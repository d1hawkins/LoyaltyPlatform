import type { Request, Response, NextFunction } from 'express';
import { TenantNotFoundError, UnauthorizedError } from '@loyalty/shared-errors';
import type { Tenant } from '@loyalty/shared-types';

export interface TenantLookup {
  getTenant(tenantId: string): Promise<Tenant | null>;
}

export function resolveTenant(tenantDbClient: TenantLookup) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(new UnauthorizedError('No tenant context'));
      }
      const tenant = await tenantDbClient.getTenant(tenantId);
      if (!tenant) {
        return next(new TenantNotFoundError(tenantId));
      }
      req.tenant = tenant;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
