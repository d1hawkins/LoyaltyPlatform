import type { Request, Response, NextFunction } from 'express';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UnauthorizedError } from '@loyalty/shared-errors';

export interface AuthenticateJWTOptions {
  skipAuth?: boolean;
  jwksUri?: string;
  issuer?: string;
  audience?: string;
}

export function authenticateJWT(options: AuthenticateJWTOptions = {}) {
  const { skipAuth = process.env.SKIP_AUTH === 'true', jwksUri, issuer, audience } = options;

  let client: jwksClient.JwksClient | null = null;
  if (!skipAuth && jwksUri) {
    client = jwksClient({ jwksUri, cache: true, rateLimit: true });
  }

  const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
    if (!client || !header.kid) {
      callback(new Error('JWKS client not configured'));
      return;
    }
    client.getSigningKey(header.kid, (err, key) => {
      if (err || !key) {
        callback(err ?? new Error('signing key not found'));
        return;
      }
      callback(null, key.getPublicKey());
    });
  };

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (skipAuth) {
      const tenantId = req.header('x-tenant-id');
      const userId = req.header('x-user-id');
      if (!tenantId || !userId) {
        return next(new UnauthorizedError('Missing x-tenant-id or x-user-id in dev mode'));
      }
      req.user = { userId, tenantId };
      return next();
    }

    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing bearer token'));
    }
    const token = authHeader.slice('Bearer '.length);

    jwt.verify(token, getKey, { issuer, audience, algorithms: ['RS256'] }, (err, decoded) => {
      if (err || !decoded || typeof decoded === 'string') {
        return next(new UnauthorizedError('Invalid token'));
      }
      const payload = decoded as jwt.JwtPayload & { tenantId?: string };
      const tenantId = (payload.tenantId ?? payload['tid']) as string | undefined;
      const userId = payload.sub;
      if (!tenantId || !userId) {
        return next(new UnauthorizedError('Token missing tenantId/sub'));
      }
      req.user = { tenantId, userId, claims: payload };
      return next();
    });
  };
}
