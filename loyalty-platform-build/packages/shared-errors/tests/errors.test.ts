import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TenantNotFoundError,
  RateLimitError,
  TenantError,
} from '../src';

describe('shared-errors', () => {
  it('AppError base class captures fields', () => {
    const e = new AppError('boom', 'X', 500, { a: 1 });
    expect(e.message).toBe('boom');
    expect(e.code).toBe('X');
    expect(e.statusCode).toBe(500);
    expect(e.details).toEqual({ a: 1 });
    expect(e instanceof Error).toBe(true);
  });

  it.each([
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ValidationError(), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new ConflictError(), 409, 'CONFLICT'],
    [new TenantNotFoundError('t1'), 404, 'TENANT_NOT_FOUND'],
    [new RateLimitError(), 429, 'RATE_LIMIT'],
    [new TenantError(), 500, 'TENANT_ERROR'],
  ])('subclass %#', (err, status, code) => {
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
  });

  it('toJSON emits RFC 7807 Problem Details', () => {
    const e = new ValidationError('bad field', { field: 'email' });
    const json = e.toJSON();
    expect(json.type).toMatch(/VALIDATION_ERROR/);
    expect(json.title).toBe('ValidationError');
    expect(json.status).toBe(400);
    expect(json.detail).toBe('bad field');
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.field).toBe('email');
  });

  it('TenantNotFoundError includes tenantId in details', () => {
    const e = new TenantNotFoundError('abc');
    expect(e.toJSON().tenantId).toBe('abc');
  });
});
