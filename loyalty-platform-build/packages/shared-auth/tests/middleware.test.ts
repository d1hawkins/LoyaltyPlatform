import type { Request, Response, NextFunction } from 'express';
import { makeTestKey, signTestJwt, type TestKey } from './test-utils';

const ISSUER = 'https://issuer/';
const AUDIENCE = 'api://aud';

let key: TestKey;

jest.mock('../src/jwks-client', () => {
  const actual = jest.requireActual('../src/jwks-client');
  return { ...actual, createJwksClient: jest.fn() };
});

import { createJwksClient } from '../src/jwks-client';
import { b2bAuthMiddleware } from '../src/middleware';

beforeAll(async () => {
  key = await makeTestKey('kid-m');
});

beforeEach(() => {
  (createJwksClient as jest.Mock).mockImplementation(() => async () => key.publicKey);
});

function mockReq(headers: Record<string, string>): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe('b2bAuthMiddleware', () => {
  const opts = { jwksUri: 'https://x', issuer: ISSUER, audience: AUDIENCE };

  it('populates req.auth on valid bearer', async () => {
    const token = await signTestJwt(
      key,
      { sub: 'c', azp: 'c', extension_tenantId: 't', scp: 'x' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
    );
    const mw = b2bAuthMiddleware(opts);
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = jest.fn() as NextFunction;
    await mw(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ tenantId: 't', clientId: 'c', scopes: ['x'] });
  });

  it('rejects missing bearer', async () => {
    const mw = b2bAuthMiddleware(opts);
    const next = jest.fn() as NextFunction;
    await mw(mockReq({}), {} as Response, next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('forwards verify errors to next', async () => {
    const mw = b2bAuthMiddleware(opts);
    const next = jest.fn() as NextFunction;
    await mw(mockReq({ authorization: 'Bearer garbage' }), {} as Response, next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('skipAuth mode populates from headers', async () => {
    const mw = b2bAuthMiddleware({ ...opts, skipAuth: true });
    const req = mockReq({
      'x-tenant-id': 't-dev',
      'x-client-id': 'cid',
      'x-scopes': 'a b',
    });
    const next = jest.fn() as NextFunction;
    await mw(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ tenantId: 't-dev', clientId: 'cid', scopes: ['a', 'b'] });
  });

  it('skipAuth mode requires x-tenant-id', async () => {
    const mw = b2bAuthMiddleware({ ...opts, skipAuth: true });
    const next = jest.fn() as NextFunction;
    await mw(mockReq({}), {} as Response, next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('skipAuth mode defaults scopes/clientId', async () => {
    const mw = b2bAuthMiddleware({ ...opts, skipAuth: true });
    const req = mockReq({ 'x-tenant-id': 't' });
    const next = jest.fn() as NextFunction;
    await mw(req, {} as Response, next);
    expect(req.auth).toEqual({ tenantId: 't', clientId: 'dev-client', scopes: [] });
  });
});
