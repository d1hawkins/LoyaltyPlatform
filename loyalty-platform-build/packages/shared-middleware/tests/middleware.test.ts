import express from 'express';
import request from 'supertest';
import {
  authenticateJWT,
  correlationId,
  errorHandler,
  requestLogger,
  resolveTenant,
} from '../src';
import { NotFoundError } from '@loyalty/shared-errors';
import { createLogger } from '@loyalty/shared-logger';

const logger = createLogger('test');

describe('shared-middleware', () => {
  it('correlationId generates or propagates header', async () => {
    const app = express();
    app.use(correlationId());
    app.get('/x', (req, res) => res.json({ cid: req.correlationId }));
    const r1 = await request(app).get('/x');
    expect(r1.headers['x-correlation-id']).toBeDefined();
    const r2 = await request(app).get('/x').set('x-correlation-id', 'abc');
    expect(r2.headers['x-correlation-id']).toBe('abc');
    expect(r2.body.cid).toBe('abc');
  });

  it('authenticateJWT in skipAuth mode reads headers', async () => {
    const app = express();
    app.use(authenticateJWT({ skipAuth: true }));
    app.get('/me', (req, res) => res.json(req.user));
    const res = await request(app).get('/me').set('x-tenant-id', 't1').set('x-user-id', 'u1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenantId: 't1', userId: 'u1' });
  });

  it('authenticateJWT skipAuth rejects when headers missing', async () => {
    const app = express();
    app.use(authenticateJWT({ skipAuth: true }));
    app.get('/me', (_req, res) => res.json({}));
    app.use(errorHandler(logger));
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('resolveTenant attaches tenant from lookup', async () => {
    const app = express();
    app.use(authenticateJWT({ skipAuth: true }));
    app.use(
      resolveTenant({
        getTenant: async (id) =>
          id === 't1'
            ? ({ id: 't1', name: 'Acme', slug: 'acme' } as any)
            : null,
      }),
    );
    app.get('/t', (req, res) => res.json(req.tenant));
    app.use(errorHandler(logger));
    const res = await request(app).get('/t').set('x-tenant-id', 't1').set('x-user-id', 'u1');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('acme');
  });

  it('errorHandler formats AppError as RFC 7807', async () => {
    const app = express();
    app.use(requestLogger(logger));
    app.get('/err', (_req, _res, next) => next(new NotFoundError('nope')));
    app.use(errorHandler(logger));
    const res = await request(app).get('/err');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.status).toBe(404);
    expect(res.body.type).toMatch(/NOT_FOUND/);
  });

  it('errorHandler formats unknown errors as 500', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(new Error('kaboom')));
    app.use(errorHandler(logger));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});
