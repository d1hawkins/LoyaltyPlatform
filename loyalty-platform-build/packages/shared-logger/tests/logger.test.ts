import { createLogger, withContext } from '../src';

describe('shared-logger', () => {
  it('creates a logger with service binding', () => {
    const logger = createLogger('test-service');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect((logger as any).bindings().service).toBe('test-service');
  });

  it('withContext adds tenantId/correlationId/userId', () => {
    const logger = createLogger('test-service');
    const child = withContext(logger, {
      tenantId: 't1',
      correlationId: 'c1',
      userId: 'u1',
    });
    const b = (child as any).bindings();
    expect(b.tenantId).toBe('t1');
    expect(b.correlationId).toBe('c1');
    expect(b.userId).toBe('u1');
  });

  it('injects environment', () => {
    const logger = createLogger('svc');
    expect((logger as any).bindings().environment).toBeDefined();
  });
});
