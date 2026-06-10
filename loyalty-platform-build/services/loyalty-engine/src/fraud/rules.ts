/**
 * Individual fraud detection rules. Each is a pure function that checks a
 * specific condition using only the cache (Redis) for O(1) velocity tracking.
 * No SQL in the hot path — all state is maintained in Redis with TTL-based
 * sliding windows.
 */

import type { FraudCacheClient, FraudFlag, TransactionInput, EnrollmentInput } from './types';

export interface RuleContext {
  tenantId: string;
  memberId: string;
  cache: FraudCacheClient;
  now?: number; // ms epoch, for testing
}

// ─── VELOCITY_TXN_COUNT ─────────────────────────────────────────────────────
// Count transactions for member in last N minutes using Redis INCR + EXPIRE.
// Key: fraud:txn_count:{tenantId}:{memberId}, TTL = windowMinutes * 60.

export async function checkVelocityTxnCount(
  ctx: RuleContext,
  _txn: TransactionInput,
  config: { maxCount: number; windowMinutes: number },
): Promise<FraudFlag | null> {
  const key = `fraud:txn_count:${ctx.tenantId}:${ctx.memberId}`;
  const count = await ctx.cache.incr(key);
  // Set TTL only on first increment (key just created).
  const ttl = await ctx.cache.ttl(key);
  if (ttl === -1 || ttl === -2) {
    await ctx.cache.expire(key, config.windowMinutes * 60);
  }
  if (count > config.maxCount) {
    return {
      ruleCode: 'VELOCITY_TXN_COUNT',
      severity: 'warning',
      details: { threshold: config.maxCount, actual: count, windowMinutes: config.windowMinutes },
    };
  }
  return null;
}

// ─── VELOCITY_TXN_AMOUNT ────────────────────────────────────────────────────
// Sum transaction amounts for member in window using Redis sorted set with
// timestamp scores. Key: fraud:txn_amount:{tenantId}:{memberId}.

export async function checkVelocityTxnAmount(
  ctx: RuleContext,
  txn: TransactionInput,
  config: { maxAmount: number; windowMinutes: number },
): Promise<FraudFlag | null> {
  const key = `fraud:txn_amount:${ctx.tenantId}:${ctx.memberId}`;
  const now = ctx.now ?? Date.now();
  const windowStart = now - config.windowMinutes * 60 * 1000;

  // Add current transaction
  const member = `${txn.transactionId ?? 'txn'}:${now}`;
  await ctx.cache.zadd(key, now, member);
  // Store the amount as a separate key so we can sum properly
  await ctx.cache.set(`${key}:amt:${member}`, String(txn.amount), config.windowMinutes * 60);

  // Prune entries outside window
  await ctx.cache.zremrangebyscore(key, 0, windowStart);

  // Get all entries in window and sum their amounts
  const entries = await ctx.cache.zrangebyscoreWithScores(key, windowStart, now);
  let totalAmount = 0;
  for (const entry of entries) {
    const amtStr = await ctx.cache.get(`${key}:amt:${entry.member}`);
    if (amtStr) totalAmount += Number(amtStr);
  }

  // Set expiry on the sorted set
  await ctx.cache.expire(key, config.windowMinutes * 60);

  if (totalAmount > config.maxAmount) {
    return {
      ruleCode: 'VELOCITY_TXN_AMOUNT',
      severity: 'warning',
      details: { threshold: config.maxAmount, actual: totalAmount, windowMinutes: config.windowMinutes },
    };
  }
  return null;
}

// ─── RAPID_ENROLLMENT_REDEEM ────────────────────────────────────────────────
// If member enrolled_at + configurable hours > now AND action is redemption → block.
// This uses a cache key set at enrollment time.

export async function checkRapidEnrollmentRedeem(
  ctx: RuleContext,
  _txn: TransactionInput,
  config: { minHoursAfterEnroll: number },
  opts: { isRedemption: boolean; enrolledAt?: string },
): Promise<FraudFlag | null> {
  if (!opts.isRedemption || !opts.enrolledAt) return null;

  const now = ctx.now ?? Date.now();
  const enrolledAt = new Date(opts.enrolledAt).getTime();
  const hoursElapsed = (now - enrolledAt) / (1000 * 60 * 60);

  if (hoursElapsed < config.minHoursAfterEnroll) {
    return {
      ruleCode: 'RAPID_ENROLLMENT_REDEEM',
      severity: 'block',
      details: {
        minHoursRequired: config.minHoursAfterEnroll,
        hoursElapsed: Math.round(hoursElapsed * 100) / 100,
        enrolledAt: opts.enrolledAt,
      },
    };
  }
  return null;
}

// ─── DUPLICATE_AMOUNT_PATTERN ───────────────────────────────────────────────
// Count same-amount transactions for member in window using Redis counter.
// Key: fraud:dup_amount:{tenantId}:{memberId}:{amount}

export async function checkDuplicateAmountPattern(
  ctx: RuleContext,
  txn: TransactionInput,
  config: { maxRepeats: number; windowMinutes: number },
): Promise<FraudFlag | null> {
  const key = `fraud:dup_amount:${ctx.tenantId}:${ctx.memberId}:${txn.amount}`;
  const count = await ctx.cache.incr(key);
  const ttl = await ctx.cache.ttl(key);
  if (ttl === -1 || ttl === -2) {
    await ctx.cache.expire(key, config.windowMinutes * 60);
  }

  if (count > config.maxRepeats) {
    return {
      ruleCode: 'DUPLICATE_AMOUNT_PATTERN',
      severity: 'warning',
      details: {
        amount: txn.amount,
        threshold: config.maxRepeats,
        actual: count,
        windowMinutes: config.windowMinutes,
      },
    };
  }
  return null;
}

// ─── RAPID_BALANCE_DRAIN ─────────────────────────────────────────────────────
// Detects when a member redeems a large percentage of their balance shortly
// after earning. If member redeems > maxDrainPercent of balance within
// windowMinutes of last earn, flag.
// Uses Redis: track last earn timestamp per member.

export async function checkRapidBalanceDrain(
  ctx: RuleContext,
  txn: TransactionInput,
  config: { maxDrainPercent: number; windowMinutes: number },
  opts: { isRedemption: boolean; currentBalance: number; redeemAmount: number },
): Promise<FraudFlag | null> {
  if (!opts.isRedemption) return null;

  const lastEarnKey = `fraud:last_earn:${ctx.tenantId}:${ctx.memberId}`;
  const now = ctx.now ?? Date.now();

  // Check if there was a recent earn
  const lastEarnStr = await ctx.cache.get(lastEarnKey);
  if (!lastEarnStr) return null;

  const lastEarnTime = Number(lastEarnStr);
  const minutesSinceEarn = (now - lastEarnTime) / (1000 * 60);

  if (minutesSinceEarn > config.windowMinutes) return null;

  // Calculate drain percentage: redeemAmount / (currentBalance + redeemAmount) * 100
  // (currentBalance is the balance AFTER the redeem, so pre-redeem = currentBalance + redeemAmount)
  const preRedeemBalance = opts.currentBalance + opts.redeemAmount;
  if (preRedeemBalance <= 0) return null;

  const drainPercent = (opts.redeemAmount / preRedeemBalance) * 100;

  if (drainPercent > config.maxDrainPercent) {
    return {
      ruleCode: 'RAPID_BALANCE_DRAIN',
      severity: 'warning',
      details: {
        maxDrainPercent: config.maxDrainPercent,
        actualDrainPercent: Math.round(drainPercent * 100) / 100,
        redeemAmount: opts.redeemAmount,
        preRedeemBalance,
        minutesSinceEarn: Math.round(minutesSinceEarn * 100) / 100,
        windowMinutes: config.windowMinutes,
      },
    };
  }
  return null;
}

/**
 * Record an earn event timestamp for RAPID_BALANCE_DRAIN tracking.
 * Should be called whenever points are earned.
 */
export async function recordEarnTimestamp(
  ctx: RuleContext,
  windowMinutes: number,
): Promise<void> {
  const key = `fraud:last_earn:${ctx.tenantId}:${ctx.memberId}`;
  const now = ctx.now ?? Date.now();
  await ctx.cache.set(key, String(now), windowMinutes * 60);
}

// ─── LOCATION_VELOCITY ──────────────────────────────────────────────────────
// Detects impossible travel: transactions from widely separated locations
// in a short time window. If two transactions have different locationIds
// within N minutes, flag.

export async function checkLocationVelocity(
  ctx: RuleContext,
  txn: TransactionInput,
  config: { windowMinutes: number },
): Promise<FraudFlag | null> {
  if (!txn.locationId) return null;

  const key = `fraud:last_location:${ctx.tenantId}:${ctx.memberId}`;
  const now = ctx.now ?? Date.now();

  const lastLocationData = await ctx.cache.get(key);

  // Store the current location + timestamp
  const newValue = JSON.stringify({ locationId: txn.locationId, timestamp: now });
  await ctx.cache.set(key, newValue, config.windowMinutes * 60);

  if (!lastLocationData) return null;

  let lastLocation: { locationId: string; timestamp: number };
  try {
    lastLocation = JSON.parse(lastLocationData) as { locationId: string; timestamp: number };
  } catch {
    return null;
  }

  // Same location is fine
  if (lastLocation.locationId === txn.locationId) return null;

  // Different location — check time window
  const minutesBetween = (now - lastLocation.timestamp) / (1000 * 60);
  if (minutesBetween <= config.windowMinutes) {
    return {
      ruleCode: 'LOCATION_VELOCITY',
      severity: 'warning',
      details: {
        previousLocationId: lastLocation.locationId,
        currentLocationId: txn.locationId,
        minutesBetween: Math.round(minutesBetween * 100) / 100,
        windowMinutes: config.windowMinutes,
      },
    };
  }
  return null;
}

// ─── DUPLICATE_EXTERNAL_REF ─────────────────────────────────────────────────
// Detects reuse of external reference IDs (e.g., same POS receipt number).
// If same externalRef appears in multiple transactions within the window, flag.
// Uses Redis: SET with TTL tracking seen externalRefs.

export async function checkDuplicateExternalRef(
  ctx: RuleContext,
  txn: TransactionInput,
  config: { windowHours: number },
): Promise<FraudFlag | null> {
  const externalRef = txn.externalRef;
  if (!externalRef) return null;

  const key = `fraud:ext_ref:${ctx.tenantId}:${externalRef}`;
  const ttlSeconds = config.windowHours * 3600;

  const existing = await ctx.cache.get(key);
  if (existing) {
    // This ref was already seen — flag it
    const count = Number(existing) + 1;
    await ctx.cache.set(key, String(count), ttlSeconds);
    return {
      ruleCode: 'DUPLICATE_EXTERNAL_REF',
      severity: 'warning',
      details: {
        externalRef,
        occurrences: count,
        windowHours: config.windowHours,
        previousMemberId: null, // We don't track who used it first in this simple impl
      },
    };
  }

  // First time seeing this ref — store it
  await ctx.cache.set(key, '1', ttlSeconds);
  return null;
}

// ─── BULK_ENROLLMENT ────────────────────────────────────────────────────────
// Count enrollments from same IP or email-domain in window.
// Key: fraud:bulk_enroll:{tenantId}:{source}

export async function checkBulkEnrollment(
  ctx: RuleContext,
  input: EnrollmentInput,
  config: { maxEnrollments: number; windowMinutes: number },
): Promise<FraudFlag | null> {
  // Check both IP and email domain
  const ipKey = `fraud:bulk_enroll:${ctx.tenantId}:ip:${input.sourceIp}`;
  const domainKey = `fraud:bulk_enroll:${ctx.tenantId}:domain:${input.emailDomain}`;

  const ipCount = await ctx.cache.incr(ipKey);
  const ipTtl = await ctx.cache.ttl(ipKey);
  if (ipTtl === -1 || ipTtl === -2) {
    await ctx.cache.expire(ipKey, config.windowMinutes * 60);
  }

  const domainCount = await ctx.cache.incr(domainKey);
  const domainTtl = await ctx.cache.ttl(domainKey);
  if (domainTtl === -1 || domainTtl === -2) {
    await ctx.cache.expire(domainKey, config.windowMinutes * 60);
  }

  const maxCount = Math.max(ipCount, domainCount);
  if (maxCount > config.maxEnrollments) {
    return {
      ruleCode: 'BULK_ENROLLMENT',
      severity: 'quarantine',
      details: {
        threshold: config.maxEnrollments,
        ipCount,
        domainCount,
        sourceIp: input.sourceIp,
        emailDomain: input.emailDomain,
        windowMinutes: config.windowMinutes,
      },
    };
  }
  return null;
}
