import { jwtVerify } from 'jose';
import { UnauthorizedError } from '@loyalty/shared-errors';
import { createJwksClient } from './jwks-client';
import type { B2BClaims, VerifyOptions } from './types';

/**
 * Verifies a B2B (client_credentials) token issued by Azure AD B2C.
 *
 * Validates:
 *  - RS256 signature via remote JWKS
 *  - iss, aud, exp
 *  - presence of tenantId claim (extension_tenantId | tid)
 */
export async function verifyB2BToken(
  token: string,
  opts: VerifyOptions,
): Promise<B2BClaims> {
  if (!token) throw new UnauthorizedError('Missing token');

  const jwks = createJwksClient({ jwksUri: opts.jwksUri });

  let payload;
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (err) {
    throw new UnauthorizedError(
      `B2B token verification failed: ${(err as Error).message}`,
    );
  }

  const tenantId =
    (payload['extension_tenantId'] as string | undefined) ??
    (payload['tid'] as string | undefined);
  if (!tenantId) {
    throw new UnauthorizedError('Token missing tenantId claim');
  }

  if (payload['revoked'] === true) {
    throw new UnauthorizedError('Token has been revoked');
  }

  const clientId =
    (payload['azp'] as string | undefined) ??
    (payload['appid'] as string | undefined) ??
    (payload.sub as string | undefined) ??
    '';

  const scopeClaim = payload['scp'] ?? payload['scope'];
  let scopes: string[] = [];
  if (typeof scopeClaim === 'string') {
    scopes = scopeClaim.split(' ').filter(Boolean);
  } else if (Array.isArray(scopeClaim)) {
    scopes = scopeClaim.filter((s): s is string => typeof s === 'string');
  }

  return { tenantId, clientId, scopes, raw: payload };
}
