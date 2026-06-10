import { classifyTransition, selectTier, type TierRow } from '../src/evaluator';

const bronze: TierRow = { id: 'bronze', name: 'Bronze', minPoints: 0, sortOrder: 1 };
const silver: TierRow = { id: 'silver', name: 'Silver', minPoints: 500, sortOrder: 2 };
const gold: TierRow = { id: 'gold', name: 'Gold', minPoints: 2000, sortOrder: 3 };
const platinum: TierRow = { id: 'platinum', name: 'Platinum', minPoints: 10000, sortOrder: 4 };
const tiers = [bronze, silver, gold, platinum];

describe('selectTier', () => {
  it('returns null when no tiers are configured', () => {
    expect(selectTier(1234, [])).toBeNull();
  });

  it('returns the only tier when a single tier is configured and member qualifies', () => {
    expect(selectTier(0, [bronze])).toEqual({ tierId: 'bronze', name: 'Bronze' });
  });

  it('returns null when the single configured tier has a minimum above the member', () => {
    expect(selectTier(0, [silver])).toBeNull();
  });

  it('places a member exactly on the boundary into the higher tier', () => {
    expect(selectTier(500, tiers)).toEqual({ tierId: 'silver', name: 'Silver' });
    expect(selectTier(2000, tiers)).toEqual({ tierId: 'gold', name: 'Gold' });
    expect(selectTier(10000, tiers)).toEqual({ tierId: 'platinum', name: 'Platinum' });
  });

  it('returns the top tier when the member is above every threshold', () => {
    expect(selectTier(999_999, tiers)).toEqual({ tierId: 'platinum', name: 'Platinum' });
  });

  it('returns the lowest tier at zero points', () => {
    expect(selectTier(0, tiers)).toEqual({ tierId: 'bronze', name: 'Bronze' });
  });

  it('clamps negative points gracefully rather than throwing', () => {
    expect(selectTier(-100, tiers)).toEqual({ tierId: 'bronze', name: 'Bronze' });
  });

  it('respects sortOrder when two tiers share a min_points', () => {
    const a: TierRow = { id: 'a', name: 'A', minPoints: 100, sortOrder: 5 };
    const b: TierRow = { id: 'b', name: 'B', minPoints: 100, sortOrder: 10 };
    expect(selectTier(150, [a, b])).toEqual({ tierId: 'b', name: 'B' });
  });

  it('breaks ties deterministically by id when sortOrder and minPoints tie', () => {
    const a: TierRow = { id: 'aaa', name: 'A', minPoints: 100, sortOrder: 5 };
    const b: TierRow = { id: 'bbb', name: 'B', minPoints: 100, sortOrder: 5 };
    expect(selectTier(150, [a, b])?.tierId).toBe('bbb');
  });

  it('handles unordered tier input', () => {
    const shuffled = [platinum, bronze, gold, silver];
    expect(selectTier(3000, shuffled)).toEqual({ tierId: 'gold', name: 'Gold' });
  });

  it('treats non-finite rolling points as zero', () => {
    expect(selectTier(Number.NaN, tiers)).toEqual({ tierId: 'bronze', name: 'Bronze' });
    expect(selectTier(Number.POSITIVE_INFINITY, tiers)).toEqual({
      tierId: 'platinum',
      name: 'Platinum',
    });
  });
});

describe('classifyTransition', () => {
  it('none when both sides are null', () => {
    expect(classifyTransition(null, null)).toBe('none');
  });
  it('upgrade when coming from no tier into a tier', () => {
    expect(classifyTransition(null, bronze)).toBe('upgrade');
  });
  it('downgrade when falling out of every tier', () => {
    expect(classifyTransition(bronze, null)).toBe('downgrade');
  });
  it('none on same tier', () => {
    expect(classifyTransition(silver, silver)).toBe('none');
  });
  it('upgrade on greater sortOrder', () => {
    expect(classifyTransition(silver, gold)).toBe('upgrade');
  });
  it('downgrade on lesser sortOrder', () => {
    expect(classifyTransition(gold, silver)).toBe('downgrade');
  });
  it('lateral (same sortOrder, different id) treated as none', () => {
    const a: TierRow = { id: 'a', name: 'A', minPoints: 100, sortOrder: 5 };
    const b: TierRow = { id: 'b', name: 'B', minPoints: 100, sortOrder: 5 };
    expect(classifyTransition(a, b)).toBe('none');
  });
});
