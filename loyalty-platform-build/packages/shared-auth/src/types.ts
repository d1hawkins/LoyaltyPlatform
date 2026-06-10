import type { JWTPayload } from 'jose';

export interface B2BClaims {
  tenantId: string;
  clientId: string;
  scopes: string[];
  raw: JWTPayload;
}

export interface ConsumerClaims {
  memberId: string;
  tenantId: string;
  email?: string;
  raw: JWTPayload;
}

export interface VerifyOptions {
  jwksUri: string;
  issuer: string;
  audience: string;
}

export interface ApiKey {
  plaintext: string;
  hash: string;
}

export interface AuthContext {
  tenantId: string;
  clientId?: string;
  memberId?: string;
  scopes: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
