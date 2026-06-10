import { calculate } from '../src/points-calculator';

describe('PointsCalculator', () => {
  const base = {
    baseEarnRate: 1,
    tierMultiplier: 1,
    promoMultipliers: [],
    currency: 'USD',
  };

  it('zero amount → zero points', () => {
    const out = calculate({ ...base, amount: 0, skuList: [] });
    expect(out).toEqual({ basePoints: 0, bonusPoints: 0, totalPoints: 0, appliedMultipliers: [] });
  });

  it('rejects negative amount', () => {
    expect(() => calculate({ ...base, amount: -1, skuList: [] })).toThrow(/non-negative/);
  });

  it('rejects non-positive multiplier cap', () => {
    expect(() => calculate({ ...base, amount: 100, skuList: [], multiplierCap: 0 })).toThrow();
  });

  it('empty sku list, base earn only — $10 * 1pt/$ = 10', () => {
    const out = calculate({ ...base, amount: 1000, skuList: [] });
    expect(out.basePoints).toBe(10);
    expect(out.bonusPoints).toBe(0);
    expect(out.totalPoints).toBe(10);
  });

  it('floor rounding on fractional points', () => {
    // $9.99 * 1.5 = 14.985 → floor = 14
    const out = calculate({ ...base, amount: 999, skuList: [], tierMultiplier: 1.5 });
    expect(out.basePoints).toBe(14);
    expect(out.totalPoints).toBe(14);
  });

  it('tier multiplier is applied to base', () => {
    const out = calculate({ ...base, amount: 1000, skuList: [], tierMultiplier: 2 });
    expect(out.basePoints).toBe(20);
  });

  it('single category bonus adds bonus points', () => {
    const out = calculate({
      ...base,
      amount: 1000,
      skuList: [{ sku: 'A', categoryId: 'coffee', amount: 1000 }],
      promoMultipliers: [{ type: 'category', match: 'coffee', multiplier: 2 }],
    });
    // base = 10; bonus = 10 * (2-1) = 10
    expect(out.basePoints).toBe(10);
    expect(out.bonusPoints).toBe(10);
    expect(out.totalPoints).toBe(20);
    expect(out.appliedMultipliers.length).toBeGreaterThan(0);
  });

  it('multiple stacking bonuses capped at cap=5', () => {
    const out = calculate({
      ...base,
      amount: 1000,
      multiplierCap: 5,
      skuList: [{ sku: 'X', categoryId: 'c1', amount: 1000 }],
      promoMultipliers: [
        { type: 'category', match: 'c1', multiplier: 3 },
        { type: 'sku', match: 'X', multiplier: 4 },
        { type: 'global', multiplier: 2 },
      ],
    });
    // effective would be 1 + 2 + 3 + 1 = 7 → capped to 5 → bonus part 4
    // bonus = floor(10 * 4) = 40
    expect(out.basePoints).toBe(10);
    expect(out.bonusPoints).toBe(40);
  });

  it('global multiplier with empty sku list applies to full amount', () => {
    const out = calculate({
      ...base,
      amount: 1000,
      skuList: [],
      promoMultipliers: [{ type: 'global', multiplier: 2 }],
    });
    expect(out.basePoints).toBe(10);
    expect(out.bonusPoints).toBe(10);
  });

  it('global multiplier of 1 adds no bonus', () => {
    const out = calculate({
      ...base,
      amount: 1000,
      skuList: [],
      promoMultipliers: [{ type: 'global', multiplier: 1 }],
    });
    expect(out.bonusPoints).toBe(0);
  });

  it('tier + category multiplier interaction', () => {
    const out = calculate({
      ...base,
      amount: 2000,
      tierMultiplier: 2,
      skuList: [{ sku: 'A', categoryId: 'c1', amount: 2000 }],
      promoMultipliers: [{ type: 'category', match: 'c1', multiplier: 2 }],
    });
    // base = floor(20 * 2) = 40
    // bonus = floor(20 * 2 * 1) = 40
    expect(out.basePoints).toBe(40);
    expect(out.bonusPoints).toBe(40);
    expect(out.totalPoints).toBe(80);
  });

  it('zero-decimal currency (JPY) uses amount as major units', () => {
    const out = calculate({ ...base, currency: 'JPY', amount: 1000, skuList: [] });
    expect(out.basePoints).toBe(1000);
  });

  it('decimal currency precision — $0.99 base 1pt/$ → 0 points', () => {
    const out = calculate({ ...base, amount: 99, skuList: [] });
    expect(out.basePoints).toBe(0);
  });

  it('sku bonus only on matching line, not other lines', () => {
    const out = calculate({
      ...base,
      amount: 3000,
      skuList: [
        { sku: 'A', amount: 1000 },
        { sku: 'B', amount: 2000 },
      ],
      promoMultipliers: [{ type: 'sku', match: 'A', multiplier: 3 }],
    });
    // base = 30; bonus only on A: 10 * (3-1) = 20
    expect(out.basePoints).toBe(30);
    expect(out.bonusPoints).toBe(20);
  });

  it('ignores non-matching promo and zero/negative line amounts', () => {
    const out = calculate({
      ...base,
      amount: 1000,
      skuList: [
        { sku: 'A', amount: 1000 },
        { sku: 'B', amount: 0 },
        { sku: 'C', amount: -5 },
      ],
      promoMultipliers: [{ type: 'category', match: 'nope', multiplier: 5 }],
    });
    expect(out.basePoints).toBe(10);
    expect(out.bonusPoints).toBe(0);
  });

  it('negative tier multiplier falls back to 1', () => {
    const out = calculate({ ...base, amount: 1000, skuList: [], tierMultiplier: -1 });
    expect(out.basePoints).toBe(10);
  });
});
