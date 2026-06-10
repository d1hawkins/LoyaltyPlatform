import { generateKeyPair, SignJWT, exportJWK, type KeyLike, type JWTPayload } from 'jose';

export interface TestKey {
  privateKey: KeyLike;
  publicKey: KeyLike;
  kid: string;
}

export async function makeTestKey(kid = 'test-kid-1'): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  return { privateKey, publicKey, kid };
}

export async function signTestJwt(
  key: TestKey,
  payload: JWTPayload,
  opts: { issuer: string; audience: string; expiresIn?: string; notExpired?: boolean },
): Promise<string> {
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(opts.issuer)
    .setAudience(opts.audience);
  if (opts.expiresIn) jwt.setExpirationTime(opts.expiresIn);
  return jwt.sign(key.privateKey);
}

export async function jwkFromKey(key: TestKey): Promise<Record<string, unknown>> {
  const jwk = await exportJWK(key.publicKey);
  return { ...jwk, kid: key.kid, use: 'sig', alg: 'RS256' };
}
