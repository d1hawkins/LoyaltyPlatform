import { makeTestKey, signTestJwt, type TestKey } from './test-utils';
import { UnauthorizedError } from '@loyalty/shared-errors';

const ISSUER = 'https://loyaltyplatformdev.b2clogin.com/tid/v2.0/';
const AUDIENCE = 'api://loyalty-b2b';

let key: TestKey;
let otherKey: TestKey;

jest.mock('../src/jwks-client', () => {
  const actual = jest.requireActual('../src/jwks-client');
  return {
    ...actual,
    createJwksClient: jest.fn(),
  };
});

import { createJwksClient } from '../src/jwks-client';
import { verifyB2BToken } from '../src/verify-b2b-token';

beforeAll(async () => {
  key = await makeTestKey('kid-1');
  otherKey = await makeTestKey('kid-2');
});

beforeEach(() => {
  (createJwksClient as jest.Mock).mockImplementation(() => {
    return async (header: { kid?: string }) => {
      if (header.kid === 'unknown-kid') {
        throw new Error('no matching key in JWKS');
      }
      return key.publicKey;
    };
  });
});

describe('verifyB2BToken', () => {
  const opts = { jwksUri: 'https://x/keys', issuer: ISSUER, audience: AUDIENCE };

  it('accepts a valid token and extracts claims', async () => {
    const token = await signTestJwt(
      key,
      {
        sub: 'client-abc',
        azp: 'client-abc',
        extension_tenantId: 'tenant-1',
        scp: 'members.read members.write',
      },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyB2BToken(token, opts);
    expect(claims.tenantId).toBe('tenant-1');
    expect(claims.clientId).toBe('client-abc');
    expect(claims.scopes).toEqual(['members.read', 'members.write']);
  });

  it('falls back to tid claim when extension_tenantId missing', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', tid: 'tenant-2', scope: ['a', 'b'] },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyB2BToken(token, opts);
    expect(claims.tenantId).toBe('tenant-2');
    expect(claims.scopes).toEqual(['a', 'b']);
  });

  it('rejects empty token', async () => {
    await expect(verifyB2BToken('', opts)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects expired token', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', extension_tenantId: 't', exp: Math.floor(Date.now() / 1000) - 60 },
      { issuer: ISSUER, audience: AUDIENCE },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/verification failed/);
  });

  it('rejects wrong audience', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', extension_tenantId: 't' },
      { issuer: ISSUER, audience: 'api://wrong', expiresIn: '1h' },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/verification failed/);
  });

  it('rejects wrong issuer', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', extension_tenantId: 't' },
      { issuer: 'https://evil/', audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/verification failed/);
  });

  it('rejects unknown kid', async () => {
    const token = await signTestJwt(
      { ...otherKey, kid: 'unknown-kid' },
      { sub: 'c', extension_tenantId: 't' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/verification failed/);
  });

  it('rejects token missing tenantId claim', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/tenantId/);
  });

  it('rejects revoked token', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', extension_tenantId: 't', revoked: true },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyB2BToken(token, opts)).rejects.toThrow(/revoked/);
  });

  it('handles missing scope claim gracefully', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', extension_tenantId: 't' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyB2BToken(token, opts);
    expect(claims.scopes).toEqual([]);
  });

  it('uses appid fallback for clientId', async () => {
    const token = await signTestJwt(
      key,
      { sub: 's', appid: 'appid-1', extension_tenantId: 't' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyB2BToken(token, opts);
    expect(claims.clientId).toBe('appid-1');
  });
});
