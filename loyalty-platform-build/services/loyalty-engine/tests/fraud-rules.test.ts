/**
 * Unit tests for individual fraud detection rules.
 * Each rule is tested independently with boundary values.
 */

import {
  checkVelocityTxnCount,
  checkVelocityTxnAmount,
  checkRapidEnrollmentRedeem,
  checkDuplicateAmountPattern,
  checkBulkEnrollment,
} from '../src/fraud/rules';
import { InMemoryFraudCache } from '../src/fraud/repository.memory';
import type { TransactionInput, EnrollmentInput } from '../src/fraud/types';

function makeCtx(overrides?: { now?: number }) {
  return {
    tenantId: 'tenant-1',
    memberId: 'member-1',
    cache: new InMemoryFraudCache(),
    now: overrides?.now,
  };
}

const baseTxn: TransactionInput = {
  memberId: 'member-1',
  amount: 100,
  currency: 'USD',
  channel: 'pos',
  transactionId: 'txn-1',
};

describe('VELOCITY_TXN_COUNT', () => {
  const config = { maxCount: 3, windowMinutes: 60 };

  it('allows transactions at or below threshold', async () => {
    const ctx = makeCtx();
    for (let i = 0; i < 3; i++) {
      const result = await checkVelocityTxnCount(ctx, baseTxn, config);
      expect(result).toBeNull();
    }
  });

  it('flags when count exceeds threshold', async () => {
    const ctx = makeCtx();
    // First 3 are fine
    for (let i = 0; i < 3; i++) {
      await checkVelocityTxnCount(ctx, baseTxn, config);
    }
    // 4th exceeds threshold
    const result = await checkVelocityTxnCount(ctx, baseTxn, config);
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('VELOCITY_TXN_COUNT');
    expect(result!.severity).toBe('warning');
    expect(result!.details.actual).toBe(4);
    expect(result!.details.threshold).toBe(3);
  });

  it('returns correct details in flag', async () => {
    const ctx = makeCtx();
    for (let i = 0; i < 4; i++) {
      await checkVelocityTxnCount(ctx, baseTxn, config);
    }
    const result = await checkVelocityTxnCount(ctx, baseTxn, config);
    expect(result).not.toBeNull();
    expect(result!.details.windowMinutes).toBe(60);
  });
});

describe('VELOCITY_TXN_AMOUNT', () => {
  const config = { maxAmount: 500, windowMinutes: 60 };

  it('allows when cumulative amount is within threshold', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const txn = { ...baseTxn, amount: 200, transactionId: 'txn-a' };
    const result = await checkVelocityTxnAmount(ctx, txn, config);
    expect(result).toBeNull();
  });

  it('flags when cumulative amount exceeds threshold', async () => {
    const ctx = makeCtx({ now: Date.now() });
    // Simulate multiple transactions summing over 500
    for (let i = 0; i < 3; i++) {
      const txn = { ...baseTxn, amount: 200, transactionId: `txn-${i}` };
      await checkVelocityTxnAmount(ctx, txn, config);
    }
    const result = await checkVelocityTxnAmount(
      { ...ctx, now: (ctx.now ?? Date.now()) + 1 },
      { ...baseTxn, amount: 200, transactionId: 'txn-final' },
      config,
    );
    // 200*4 = 800 > 500
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('VELOCITY_TXN_AMOUNT');
    expect(result!.details.actual).toBeGreaterThan(500);
  });
});

describe('RAPID_ENROLLMENT_REDEEM', () => {
  const config = { minHoursAfterEnroll: 24 };

  it('does not flag non-redemption transactions', async () => {
    const ctx = makeCtx();
    const result = await checkRapidEnrollmentRedeem(ctx, baseTxn, config, {
      isRedemption: false,
      enrolledAt: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it('does not flag redemptions after the enrollment window', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const enrolledAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
    const result = await checkRapidEnrollmentRedeem(ctx, baseTxn, config, {
      isRedemption: true,
      enrolledAt,
    });
    expect(result).toBeNull();
  });

  it('flags redemptions too soon after enrollment', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const enrolledAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const result = await checkRapidEnrollmentRedeem(ctx, baseTxn, config, {
      isRedemption: true,
      enrolledAt,
    });
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('RAPID_ENROLLMENT_REDEEM');
    expect(result!.severity).toBe('block');
  });

  it('flags at exactly the boundary (< 24h)', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const enrolledAt = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(); // 23 hours
    const result = await checkRapidEnrollmentRedeem(ctx, baseTxn, config, {
      isRedemption: true,
      enrolledAt,
    });
    expect(result).not.toBeNull();
  });

  it('does not flag when no enrolledAt is provided', async () => {
    const ctx = makeCtx();
    const result = await checkRapidEnrollmentRedeem(ctx, baseTxn, config, {
      isRedemption: true,
    });
    expect(result).toBeNull();
  });
});

describe('DUPLICATE_AMOUNT_PATTERN', () => {
  const config = { maxRepeats: 2, windowMinutes: 30 };

  it('allows within repeat threshold', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn, amount: 500 };
    const r1 = await checkDuplicateAmountPattern(ctx, txn, config);
    expect(r1).toBeNull();
    const r2 = await checkDuplicateAmountPattern(ctx, txn, config);
    expect(r2).toBeNull();
  });

  it('flags when repeat count exceeds threshold', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn, amount: 500 };
    await checkDuplicateAmountPattern(ctx, txn, config);
    await checkDuplicateAmountPattern(ctx, txn, config);
    const result = await checkDuplicateAmountPattern(ctx, txn, config);
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('DUPLICATE_AMOUNT_PATTERN');
    expect(result!.details.amount).toBe(500);
    expect(result!.details.actual).toBe(3);
  });

  it('does not cross-pollinate between different amounts', async () => {
    const ctx = makeCtx();
    await checkDuplicateAmountPattern(ctx, { ...baseTxn, amount: 100 }, config);
    await checkDuplicateAmountPattern(ctx, { ...baseTxn, amount: 200 }, config);
    await checkDuplicateAmountPattern(ctx, { ...baseTxn, amount: 300 }, config);
    const result = await checkDuplicateAmountPattern(ctx, { ...baseTxn, amount: 100 }, config);
    // Only 2 for amount=100 — not over threshold
    expect(result).toBeNull();
  });
});

describe('BULK_ENROLLMENT', () => {
  const config = { maxEnrollments: 2, windowMinutes: 60 };

  it('allows enrollments within threshold', async () => {
    const ctx = makeCtx();
    const input: EnrollmentInput = { sourceIp: '1.2.3.4', email: 'a@test.com', emailDomain: 'test.com' };
    const r1 = await checkBulkEnrollment(ctx, input, config);
    expect(r1).toBeNull();
    const r2 = await checkBulkEnrollment(ctx, input, config);
    expect(r2).toBeNull();
  });

  it('flags when enrollments from same IP exceed threshold', async () => {
    const ctx = makeCtx();
    const input: EnrollmentInput = { sourceIp: '1.2.3.4', email: 'a@test.com', emailDomain: 'test.com' };
    await checkBulkEnrollment(ctx, input, config);
    await checkBulkEnrollment(ctx, input, config);
    const result = await checkBulkEnrollment(ctx, input, config);
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('BULK_ENROLLMENT');
    expect(result!.severity).toBe('quarantine');
  });

  it('flags when enrollments from same email domain exceed threshold', async () => {
    const ctx = makeCtx();
    await checkBulkEnrollment(ctx, { sourceIp: '1.1.1.1', email: 'a@evil.com', emailDomain: 'evil.com' }, config);
    await checkBulkEnrollment(ctx, { sourceIp: '2.2.2.2', email: 'b@evil.com', emailDomain: 'evil.com' }, config);
    const result = await checkBulkEnrollment(ctx, { sourceIp: '3.3.3.3', email: 'c@evil.com', emailDomain: 'evil.com' }, config);
    expect(result).not.toBeNull();
    expect(result!.details.domainCount).toBe(3);
  });
});
