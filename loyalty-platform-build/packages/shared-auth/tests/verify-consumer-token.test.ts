import { makeTestKey, signTestJwt, type TestKey } from './test-utils';

const ISSUER = 'https://loyaltyplatformdev.b2clogin.com/tid/v2.0/';
const AUDIENCE = 'api://loyalty-consumer';

let key: TestKey;

jest.mock('../src/jwks-client', () => {
  const actual = jest.requireActual('../src/jwks-client');
  return { ...actual, createJwksClient: jest.fn() };
});

import { createJwksClient } from '../src/jwks-client';
import { verifyConsumerToken } from '../src/verify-consumer-token';

beforeAll(async () => {
  key = await makeTestKey('kid-c');
});

beforeEach(() => {
  (createJwksClient as jest.Mock).mockImplementation(() => async () => key.publicKey);
});

describe('verifyConsumerToken', () => {
  const opts = { jwksUri: 'https://x/keys', issuer: ISSUER, audience: AUDIENCE };

  it('verifies a valid consumer token', async () => {
    const token = await signTestJwt(
      key,
      {
        sub: 'member-xyz',
        extension_tenantId: 't-1',
        email: 'a@b.com',
      },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyConsumerToken(token, opts);
    expect(claims.memberId).toBe('member-xyz');
    expect(claims.tenantId).toBe('t-1');
    expect(claims.email).toBe('a@b.com');
  });

  it('uses extension_memberId when present', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'oid', extension_memberId: 'm-1', extension_tenantId: 't' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const claims = await verifyConsumerToken(token, opts);
    expect(claims.memberId).toBe('m-1');
  });

  it('rejects empty', async () => {
    await expect(verifyConsumerToken('', opts)).rejects.toThrow('Missing token');
  });

  it('rejects missing tenantId', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'm' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyConsumerToken(token, opts)).rejects.toThrow(/tenantId/);
  });

  it('rejects missing memberId/sub', async () => {
    const token = await signTestJwt(
      key,
      { extension_tenantId: 't' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyConsumerToken(token, opts)).rejects.toThrow(/memberId/);
  });

  it('rejects revoked', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'm', extension_tenantId: 't', revoked: true },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    await expect(verifyConsumerToken(token, opts)).rejects.toThrow(/revoked/);
  });

  it('rejects wrong audience', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'm', extension_tenantId: 't' },
      { issuer: ISSUER, audience: 'wrong', expiresIn: '1h' },
    );
    await expect(verifyConsumerToken(token, opts)).rejects.toThrow(/verification failed/);
  });
});
