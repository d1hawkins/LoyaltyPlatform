import request from 'supertest';
import { createApp } from '../src/index';

describe('health endpoints', () => {
  const { app } = createApp();

  it('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('admin-api');
  });

  it('GET /ready returns ready true', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});
