/**
 * Pure eligibility engine — no I/O.
 * 100% unit-test coverage required.
 */

import type { OfferRow, MemberInfo } from './deps';

export interface VisitData {
  qualifiedVisitCount: number; // pre-computed by the caller
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Evaluates whether a member is eligible for a given offer.
 *
 * @param member - The member attempting to use the offer
 * @param offer - The offer being evaluated
 * @param memberRedemptionCount - How many times this member has already redeemed this offer
 * @param currentTimestamp - Current time for date range checks (ISO string or Date)
 */
export function evaluateEligibility(
  member: MemberInfo,
  offer: OfferRow,
  memberRedemptionCount: number,
  currentTimestamp: string | Date,
  visitData?: VisitData,
): EligibilityResult {
  const reasons: string[] = [];
  const now = typeof currentTimestamp === 'string' ? new Date(currentTimestamp) : currentTimestamp;

  // 1. Offer must be active
  if (!offer.isActive) {
    reasons.push('offer_inactive');
  }

  // 2. Current date must be within valid_from..valid_to
  const validFrom = new Date(offer.validFrom);
  const validTo = new Date(offer.validTo);

  if (now < validFrom) {
    reasons.push('offer_not_started');
  }

  if (now > validTo) {
    reasons.push('offer_expired');
  }

  // 3. Global max redemptions not exceeded
  if (offer.maxRedemptions !== null && offer.currentRedemptions >= offer.maxRedemptions) {
    reasons.push('max_global_redemptions_reached');
  }

  // 4. Per-member limit not exceeded
  if (memberRedemptionCount >= offer.perMemberLimit) {
    reasons.push('per_member_limit_reached');
  }

  // 5. Member has enough points (if points_cost is set)
  if (offer.pointsCost !== null && offer.pointsCost > 0) {
    if (member.pointsBalance < offer.pointsCost) {
      reasons.push('insufficient_points');
    }
  }

  // 6. Visit-based eligibility check
  if (offer.minVisits && offer.minVisits > 0) {
    if (!visitData || visitData.qualifiedVisitCount < offer.minVisits) {
      reasons.push(`Need ${offer.minVisits} qualifying visits (have ${visitData?.qualifiedVisitCount ?? 0})`);
    }
  }

  // 7. Tier targeting check
  if (offer.targetingJson) {
    const targeting = offer.targetingJson;

    // Check required tiers
    if (targeting.requiredTiers && Array.isArray(targeting.requiredTiers)) {
      const requiredTiers = targeting.requiredTiers as string[];
      if (requiredTiers.length > 0 && !requiredTiers.includes(member.tierId)) {
        reasons.push('tier_mismatch');
      }
    }

    // Check excluded tiers
    if (targeting.excludedTiers && Array.isArray(targeting.excludedTiers)) {
      const excludedTiers = targeting.excludedTiers as string[];
      if (excludedTiers.includes(member.tierId)) {
        reasons.push('tier_excluded');
      }
    }

    // Check minimum points requirement (separate from points_cost)
    if (typeof targeting.minPointsBalance === 'number') {
      if (member.pointsBalance < (targeting.minPointsBalance as number)) {
        reasons.push('below_minimum_points_balance');
      }
    }

    // Check member status
    if (targeting.requiredStatus && typeof targeting.requiredStatus === 'string') {
      if (member.status !== targeting.requiredStatus) {
        reasons.push('member_status_mismatch');
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
