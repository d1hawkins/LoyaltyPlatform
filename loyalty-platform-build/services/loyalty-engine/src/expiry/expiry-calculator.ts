/**
 * Pure functions for points expiry calculations.
 * No I/O — all data passed in.
 */

import type { ExpiringCredit } from '../deps';

export interface ExpiryResult {
  ledgerId: string;
  memberId: string;
  remainingDelta: number;
  expiresAt: string;
}

/**
 * Given a list of expiring credits, compute the remaining (unexpired) balance
 * for each. Credits that are fully redeemed/voided are skipped.
 */
export function computeExpirableCredits(credits: ExpiringCredit[]): ExpiryResult[] {
  const results: ExpiryResult[] = [];
  for (const credit of credits) {
    const remaining = credit.delta - credit.alreadyUsed;
    if (remaining <= 0) continue; // fully redeemed — nothing to expire
    results.push({
      ledgerId: credit.ledgerId,
      memberId: credit.memberId,
      remainingDelta: remaining,
      expiresAt: credit.expiresAt,
    });
  }
  return results;
}

/**
 * Calculate an expiry date from a creation date and expiry months.
 */
export function calculateExpiresAt(createdAt: string, expiryMonths: number): string {
  const d = new Date(createdAt);
  d.setUTCMonth(d.getUTCMonth() + expiryMonths);
  return d.toISOString();
}
