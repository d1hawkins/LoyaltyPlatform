import { createJwksClient, _resetJwksCache } from '../src/jwks-client';

describe('createJwksClient', () => {
  beforeEach(() => _resetJwksCache());

  it('caches resolvers by URI', () => {
    const a = createJwksClient({ jwksUri: 'https://example.com/keys' });
    const b = createJwksClient({ jwksUri: 'https://example.com/keys' });
    expect(a).toBe(b);
  });

  it('returns distinct resolvers for distinct URIs', () => {
    const a = createJwksClient({ jwksUri: 'https://a/keys' });
    const b = createJwksClient({ jwksUri: 'https://b/keys' });
    expect(a).not.toBe(b);
  });

  it('accepts custom cache options', () => {
    const resolver = createJwksClient({
      jwksUri: 'https://c/keys',
      cacheMaxAge: 1000,
      cooldownDuration: 500,
      timeoutDuration: 1000,
    });
    expect(typeof resolver).toBe('function');
  });
});
