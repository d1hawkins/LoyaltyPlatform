import { evaluateEligibility } from '../src/eligibility';
import type { OfferRow, MemberInfo } from '../src/deps';

function baseMember(overrides?: Partial<MemberInfo>): MemberInfo {
  return {
    memberId: 'member-1',
    tenantId: 'tenant-1',
    status: 'active',
    tierId: 'gold',
    pointsBalance: 1000,
    ...overrides,
  };
}

function baseOffer(overrides?: Partial<OfferRow>): OfferRow {
  return {
    offerId: 'offer-1',
    name: 'Test Offer',
    description: null,
    type: 'percent',
    value: 10,
    minPurchase: null,
    pointsCost: null,
    conditionsJson: null,
    targetingJson: null,
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2026-12-31T23:59:59Z',
    maxRedemptions: null,
    currentRedemptions: 0,
    perMemberLimit: 1,
    isStackable: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NOW = '2026-06-15T12:00:00Z';

describe('evaluateEligibility', () => {
  it('returns eligible for a valid active offer within dates', () => {
    const result = evaluateEligibility(baseMember(), baseOffer(), 0, NOW);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects inactive offer', () => {
    const result = evaluateEligibility(baseMember(), baseOffer({ isActive: false }), 0, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('offer_inactive');
  });

  it('rejects offer that has not started yet', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ validFrom: '2027-01-01T00:00:00Z' }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('offer_not_started');
  });

  it('rejects expired offer', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ validTo: '2025-01-01T00:00:00Z' }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('offer_expired');
  });

  it('rejects when global max redemptions reached', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ maxRedemptions: 100, currentRedemptions: 100 }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('max_global_redemptions_reached');
  });

  it('allows when global redemptions below max', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ maxRedemptions: 100, currentRedemptions: 99 }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects when per-member limit reached', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ perMemberLimit: 2 }),
      2,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('per_member_limit_reached');
  });

  it('allows when per-member count below limit', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer({ perMemberLimit: 3 }),
      2,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects when insufficient points for points_cost', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 50 }),
      baseOffer({ pointsCost: 100 }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('insufficient_points');
  });

  it('allows when member has enough points for points_cost', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 100 }),
      baseOffer({ pointsCost: 100 }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('does not check points when pointsCost is null', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 0 }),
      baseOffer({ pointsCost: null }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('does not check points when pointsCost is 0', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 0 }),
      baseOffer({ pointsCost: 0 }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  // ── Targeting: tier checks ──

  it('rejects when member tier not in requiredTiers', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'bronze' }),
      baseOffer({ targetingJson: { requiredTiers: ['gold', 'platinum'] } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('tier_mismatch');
  });

  it('allows when member tier in requiredTiers', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'gold' }),
      baseOffer({ targetingJson: { requiredTiers: ['gold', 'platinum'] } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('allows when requiredTiers is empty array', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'bronze' }),
      baseOffer({ targetingJson: { requiredTiers: [] } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects when member tier in excludedTiers', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'bronze' }),
      baseOffer({ targetingJson: { excludedTiers: ['bronze'] } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('tier_excluded');
  });

  it('allows when member tier not in excludedTiers', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'gold' }),
      baseOffer({ targetingJson: { excludedTiers: ['bronze'] } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  // ── Targeting: minimum points balance ──

  it('rejects when below minPointsBalance targeting', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 50 }),
      baseOffer({ targetingJson: { minPointsBalance: 100 } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('below_minimum_points_balance');
  });

  it('allows when at or above minPointsBalance targeting', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 100 }),
      baseOffer({ targetingJson: { minPointsBalance: 100 } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  // ── Targeting: member status ──

  it('rejects when member status does not match requiredStatus', () => {
    const result = evaluateEligibility(
      baseMember({ status: 'suspended' }),
      baseOffer({ targetingJson: { requiredStatus: 'active' } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('member_status_mismatch');
  });

  it('allows when member status matches requiredStatus', () => {
    const result = evaluateEligibility(
      baseMember({ status: 'active' }),
      baseOffer({ targetingJson: { requiredStatus: 'active' } }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });

  // ── Multiple reasons accumulated ──

  it('accumulates multiple ineligibility reasons', () => {
    const result = evaluateEligibility(
      baseMember({ pointsBalance: 10 }),
      baseOffer({
        isActive: false,
        validTo: '2020-01-01T00:00:00Z',
        pointsCost: 100,
        maxRedemptions: 5,
        currentRedemptions: 5,
        perMemberLimit: 1,
      }),
      1,
      NOW,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('offer_inactive');
    expect(result.reasons).toContain('offer_expired');
    expect(result.reasons).toContain('max_global_redemptions_reached');
    expect(result.reasons).toContain('per_member_limit_reached');
    expect(result.reasons).toContain('insufficient_points');
  });

  // ── Date as Date object ──

  it('accepts Date object as currentTimestamp', () => {
    const result = evaluateEligibility(
      baseMember(),
      baseOffer(),
      0,
      new Date('2026-06-15T12:00:00Z'),
    );
    expect(result.eligible).toBe(true);
  });

  // ── No targetingJson ──

  it('skips targeting checks when targetingJson is null', () => {
    const result = evaluateEligibility(
      baseMember({ tierId: 'bronze' }),
      baseOffer({ targetingJson: null }),
      0,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });
});
