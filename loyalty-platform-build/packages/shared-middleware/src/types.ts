import type { Tenant } from '@loyalty/shared-types';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  roles?: string[];
  claims?: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: Tenant;
      user?: AuthenticatedUser;
      correlationId?: string;
    }
  }
}

export {};
