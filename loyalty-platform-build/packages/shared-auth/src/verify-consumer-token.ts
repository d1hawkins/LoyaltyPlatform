import { jwtVerify } from 'jose';
import { UnauthorizedError } from '@loyalty/shared-errors';
import { createJwksClient } from './jwks-client';
import type { ConsumerClaims, VerifyOptions } from './types';

/**
 * Verifies a consumer PKCE access token issued by Azure AD B2C.
 */
export async function verifyConsumerToken(
  token: string,
  opts: VerifyOptions,
): Promise<ConsumerClaims> {
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
      `Consumer token verification failed: ${(err as Error).message}`,
    );
  }

  const memberId =
    (payload['extension_memberId'] as string | undefined) ??
    (payload.sub as string | undefined);
  const tenantId =
    (payload['extension_tenantId'] as string | undefined) ??
    (payload['tid'] as string | undefined);

  if (!memberId) throw new UnauthorizedError('Token missing memberId/sub');
  if (!tenantId) throw new UnauthorizedError('Token missing tenantId claim');
  if (payload['revoked'] === true) {
    throw new UnauthorizedError('Token has been revoked');
  }

  const email = payload['email'] as string | undefined;
  return { memberId, tenantId, email, raw: payload };
}
