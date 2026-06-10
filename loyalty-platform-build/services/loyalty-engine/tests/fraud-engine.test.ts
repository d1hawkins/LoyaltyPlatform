/**
 * FraudEngine integration tests — verifies action resolution (highest
 * severity wins), flag persistence, and performance (< 5ms with in-memory).
 */

import { FraudEngine } from '../src/fraud/engine';
import { InMemoryFraudCache, InMemoryFraudRepository } from '../src/fraud/repository.memory';
import type { TransactionInput } from '../src/fraud/types';

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

function setup() {
  const repo = new InMemoryFraudRepository();
  const cache = new InMemoryFraudCache();
  const engine = new FraudEngine({ repo, cache, logger: noopLogger });
  return { repo, cache, engine };
}

const baseTxn: TransactionInput = {
  memberId: 'member-1',
  amount: 100,
  currency: 'USD',
  channel: 'pos',
  transactionId: 'txn-1',
};

describe('FraudEngine', () => {
  it('returns allow when no rules are triggered', async () => {
    const { engine } = setup();
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn);
    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
    expect(result.flags).toHaveLength(0);
  });

  it('returns warn when a warning-severity rule triggers', async () => {
    const { engine, repo } = setup();
    // Lower threshold so the first txn triggers it
    repo.rules = repo.rules.map((r) =>
      r.ruleCode === 'VELOCITY_TXN_COUNT' ? { ...r, config: { maxCount: 0, windowMinutes: 60 } } : r,
    );
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn);
    expect(result.passed).toBe(false);
    expect(result.action).toBe('warn');
    expect(result.flags.some((f) => f.ruleCode === 'VELOCITY_TXN_COUNT')).toBe(true);
  });

  it('returns block when a block-severity rule triggers (highest severity wins)', async () => {
    const { engine } = setup();
    const enrolledAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn, {
      isRedemption: true,
      enrolledAt,
    });
    expect(result.action).toBe('block');
    expect(result.flags.some((f) => f.ruleCode === 'RAPID_ENROLLMENT_REDEEM')).toBe(true);
  });

  it('resolves multiple flags — highest severity wins', async () => {
    const { engine, repo } = setup();
    // Trigger both a warning and a block
    repo.rules = repo.rules.map((r) =>
      r.ruleCode === 'VELOCITY_TXN_COUNT' ? { ...r, config: { maxCount: 0, windowMinutes: 60 } } : r,
    );
    const enrolledAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn, {
      isRedemption: true,
      enrolledAt,
    });
    expect(result.action).toBe('block'); // block > warning
    expect(result.flags.length).toBeGreaterThanOrEqual(2);
  });

  it('persists flags to the repository', async () => {
    const { engine, repo } = setup();
    repo.rules = repo.rules.map((r) =>
      r.ruleCode === 'VELOCITY_TXN_COUNT' ? { ...r, config: { maxCount: 0, windowMinutes: 60 } } : r,
    );
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn);
    const ids = await engine.persistFlags('tenant-1', 'member-1', 'txn-1', result.flags);
    expect(ids.length).toBeGreaterThan(0);
    expect(repo.flags.length).toBeGreaterThan(0);
    expect(repo.flags[0]?.ruleCode).toBe('VELOCITY_TXN_COUNT');
    expect(repo.flags[0]?.status).toBe('open');
  });

  it('disabled rules are not checked', async () => {
    const { engine, repo } = setup();
    repo.rules = repo.rules.map((r) => ({ ...r, isEnabled: false }));
    const result = await engine.checkTransaction('tenant-1', 'member-1', baseTxn);
    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
  });

  it('checkEnrollment detects bulk enrollment', async () => {
    const { engine, repo } = setup();
    repo.rules = repo.rules.map((r) =>
      r.ruleCode === 'BULK_ENROLLMENT' ? { ...r, config: { maxEnrollments: 1, windowMinutes: 60 } } : r,
    );
    await engine.checkEnrollment('tenant-1', '1.2.3.4', 'a@evil.com');
    const result = await engine.checkEnrollment('tenant-1', '1.2.3.4', 'b@evil.com');
    expect(result.action).toBe('quarantine');
  });

  it('performance: checkTransaction completes in < 5ms with in-memory cache', async () => {
    const { engine } = setup();
    // Warm up
    await engine.checkTransaction('tenant-1', 'member-1', baseTxn);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await engine.checkTransaction('tenant-1', 'member-1', baseTxn);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;
    expect(avgMs).toBeLessThan(5);
  });
});
