import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export interface JwksClientOptions {
  jwksUri: string;
  cacheMaxAge?: number; // ms
  cooldownDuration?: number; // ms
  timeoutDuration?: number; // ms
}

const cache = new Map<string, JWTVerifyGetKey>();

/**
 * Returns a cached remote JWKS resolver keyed by URI. Safe to call repeatedly.
 */
export function createJwksClient(opts: JwksClientOptions): JWTVerifyGetKey {
  const key = opts.jwksUri;
  const existing = cache.get(key);
  if (existing) return existing;

  const jwks = createRemoteJWKSet(new URL(opts.jwksUri), {
    cacheMaxAge: opts.cacheMaxAge ?? 10 * 60 * 1000, // 10m
    cooldownDuration: opts.cooldownDuration ?? 30 * 1000,
    timeoutDuration: opts.timeoutDuration ?? 5000,
  });
  cache.set(key, jwks);
  return jwks;
}

/** Test helper — clears the internal cache. */
export function _resetJwksCache(): void {
  cache.clear();
}
