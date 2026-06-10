/**
 * Unit tests for the three new fraud detection rules:
 * RAPID_BALANCE_DRAIN, LOCATION_VELOCITY, DUPLICATE_EXTERNAL_REF
 */

import {
  checkRapidBalanceDrain,
  checkLocationVelocity,
  checkDuplicateExternalRef,
  recordEarnTimestamp,
} from '../src/fraud/rules';
import { InMemoryFraudCache } from '../src/fraud/repository.memory';
import type { TransactionInput } from '../src/fraud/types';

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

// ─── RAPID_BALANCE_DRAIN ─────────────────────────────────────────────────────

describe('RAPID_BALANCE_DRAIN', () => {
  const config = { maxDrainPercent: 80, windowMinutes: 60 };

  it('does not flag non-redemption transactions', async () => {
    const ctx = makeCtx({ now: Date.now() });
    await recordEarnTimestamp(ctx, config.windowMinutes);
    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: false,
      currentBalance: 100,
      redeemAmount: 900,
    });
    expect(result).toBeNull();
  });

  it('does not flag when no recent earn recorded', async () => {
    const ctx = makeCtx({ now: Date.now() });
    // No earn recorded
    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: true,
      currentBalance: 100,
      redeemAmount: 900,
    });
    expect(result).toBeNull();
  });

  it('flags when member redeems >80% of balance within window of last earn', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    // Record an earn 30 minutes ago
    const earnCtx = { ...ctx, now: now - 30 * 60 * 1000 };
    await recordEarnTimestamp(earnCtx, config.windowMinutes);

    // Now redeem 90% of balance
    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: true,
      currentBalance: 100, // balance after redeem
      redeemAmount: 900,   // pre-redeem was 1000, draining 900 = 90%
    });
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('RAPID_BALANCE_DRAIN');
    expect(result!.details.actualDrainPercent).toBe(90);
  });

  it('does not flag when drain is below threshold', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    const earnCtx = { ...ctx, now: now - 30 * 60 * 1000 };
    await recordEarnTimestamp(earnCtx, config.windowMinutes);

    // Redeem 50% of balance (below 80%)
    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: true,
      currentBalance: 500,
      redeemAmount: 500, // pre-redeem = 1000, drain = 50%
    });
    expect(result).toBeNull();
  });

  it('does not flag when earn was outside the window', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    // Earn was 2 hours ago, window is 60 minutes
    const earnCtx = { ...ctx, now: now - 120 * 60 * 1000 };
    await recordEarnTimestamp(earnCtx, 180); // TTL > 2h so key still exists

    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: true,
      currentBalance: 100,
      redeemAmount: 900,
    });
    expect(result).toBeNull();
  });

  it('returns correct details in flag', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    const earnCtx = { ...ctx, now: now - 10 * 60 * 1000 };
    await recordEarnTimestamp(earnCtx, config.windowMinutes);

    const result = await checkRapidBalanceDrain(ctx, baseTxn, config, {
      isRedemption: true,
      currentBalance: 50,
      redeemAmount: 950,
    });
    expect(result).not.toBeNull();
    expect(result!.details.maxDrainPercent).toBe(80);
    expect(result!.details.redeemAmount).toBe(950);
    expect(result!.details.preRedeemBalance).toBe(1000);
    expect(result!.details.windowMinutes).toBe(60);
  });
});

// ─── LOCATION_VELOCITY ──────────────────────────────────────────────────────

describe('LOCATION_VELOCITY', () => {
  const config = { windowMinutes: 30 };

  it('allows first transaction (no previous location)', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const txn = { ...baseTxn, locationId: 'store-A' };
    const result = await checkLocationVelocity(ctx, txn, config);
    expect(result).toBeNull();
  });

  it('allows same location within window', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });
    const txn = { ...baseTxn, locationId: 'store-A' };

    // First transaction
    await checkLocationVelocity(ctx, txn, config);

    // Second from same location 5 min later
    const ctx2 = { ...ctx, now: now + 5 * 60 * 1000 };
    const result = await checkLocationVelocity(ctx2, txn, config);
    expect(result).toBeNull();
  });

  it('flags different locations within window', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    // First transaction at store-A
    await checkLocationVelocity(ctx, { ...baseTxn, locationId: 'store-A' }, config);

    // Second at store-B 10 minutes later
    const ctx2 = { ...ctx, now: now + 10 * 60 * 1000 };
    const result = await checkLocationVelocity(ctx2, { ...baseTxn, locationId: 'store-B' }, config);
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('LOCATION_VELOCITY');
    expect(result!.details.previousLocationId).toBe('store-A');
    expect(result!.details.currentLocationId).toBe('store-B');
    expect(result!.details.minutesBetween).toBeCloseTo(10, 0);
  });

  it('allows different locations outside window', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    // First transaction at store-A
    await checkLocationVelocity(ctx, { ...baseTxn, locationId: 'store-A' }, config);

    // Second at store-B 45 minutes later (outside 30min window)
    const ctx2 = { ...ctx, now: now + 45 * 60 * 1000 };
    const result = await checkLocationVelocity(ctx2, { ...baseTxn, locationId: 'store-B' }, config);
    expect(result).toBeNull();
  });

  it('does not flag when locationId is absent', async () => {
    const ctx = makeCtx({ now: Date.now() });
    const txn = { ...baseTxn }; // no locationId
    delete (txn as Record<string, unknown>).locationId;
    const result = await checkLocationVelocity(ctx, txn, config);
    expect(result).toBeNull();
  });

  it('returns correct details in flag', async () => {
    const now = Date.now();
    const ctx = makeCtx({ now });

    await checkLocationVelocity(ctx, { ...baseTxn, locationId: 'NYC-001' }, config);

    const ctx2 = { ...ctx, now: now + 5 * 60 * 1000 };
    const result = await checkLocationVelocity(ctx2, { ...baseTxn, locationId: 'LA-002' }, config);
    expect(result).not.toBeNull();
    expect(result!.details.previousLocationId).toBe('NYC-001');
    expect(result!.details.currentLocationId).toBe('LA-002');
    expect(result!.details.windowMinutes).toBe(30);
  });
});

// ─── DUPLICATE_EXTERNAL_REF ─────────────────────────────────────────────────

describe('DUPLICATE_EXTERNAL_REF', () => {
  const config = { windowHours: 24 };

  it('allows unique external refs', async () => {
    const ctx = makeCtx();
    const txn1 = { ...baseTxn, externalRef: 'receipt-001' };
    const txn2 = { ...baseTxn, externalRef: 'receipt-002' };

    const r1 = await checkDuplicateExternalRef(ctx, txn1, config);
    expect(r1).toBeNull();

    const r2 = await checkDuplicateExternalRef(ctx, txn2, config);
    expect(r2).toBeNull();
  });

  it('flags duplicate external ref within window', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn, externalRef: 'receipt-dup-001' };

    // First use is fine
    const r1 = await checkDuplicateExternalRef(ctx, txn, config);
    expect(r1).toBeNull();

    // Second use of same ref — flagged
    const r2 = await checkDuplicateExternalRef(ctx, txn, config);
    expect(r2).not.toBeNull();
    expect(r2!.ruleCode).toBe('DUPLICATE_EXTERNAL_REF');
    expect(r2!.details.externalRef).toBe('receipt-dup-001');
    expect(r2!.details.occurrences).toBe(2);
  });

  it('counts multiple duplicates correctly', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn, externalRef: 'receipt-multi' };

    await checkDuplicateExternalRef(ctx, txn, config); // 1st
    await checkDuplicateExternalRef(ctx, txn, config); // 2nd
    const r3 = await checkDuplicateExternalRef(ctx, txn, config); // 3rd
    expect(r3).not.toBeNull();
    expect(r3!.details.occurrences).toBe(3);
  });

  it('does not flag when externalRef is absent', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn }; // no externalRef
    const result = await checkDuplicateExternalRef(ctx, txn, config);
    expect(result).toBeNull();
  });

  it('returns correct details in flag', async () => {
    const ctx = makeCtx();
    const txn = { ...baseTxn, externalRef: 'pos-12345' };

    await checkDuplicateExternalRef(ctx, txn, config);
    const result = await checkDuplicateExternalRef(ctx, txn, config);
    expect(result).not.toBeNull();
    expect(result!.details.externalRef).toBe('pos-12345');
    expect(result!.details.windowHours).toBe(24);
  });
});
