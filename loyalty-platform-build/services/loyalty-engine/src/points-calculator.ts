/**
 * Pure points calculation. No I/O.
 *
 * Contract (T-05):
 *   basePoints = floor(amountDollars * baseEarnRate * tierMultiplier)
 *   bonusPoints come from category/sku/global promo multipliers applied on top.
 *   Effective multiplier for any item is capped at `multiplierCap` (default 5).
 *
 *   amount is expressed in the smallest currency unit (cents for USD/GBP/EUR).
 *   For zero-decimal currencies (JPY) the caller should pass whole-unit amounts.
 *   We use `currencyDecimals` (derived from currency) to convert to major units.
 */

export interface CalculatorSkuLine {
  sku: string;
  categoryId?: string;
  amount: number; // minor units (cents)
}

export interface CalculatorPromoMultiplier {
  type: 'category' | 'sku' | 'global';
  match?: string; // categoryId for 'category', sku for 'sku', ignored for 'global'
  multiplier: number; // e.g. 2 for 2x
}

export interface CalculatorInput {
  amount: number; // total minor units; should equal sum(skuList.amount) when skuList provided
  currency: string;
  skuList: CalculatorSkuLine[];
  baseEarnRate: number; // points per major unit (e.g. 1 = 1pt/$)
  tierMultiplier: number; // e.g. 1.5 for Gold
  promoMultipliers: CalculatorPromoMultiplier[];
  multiplierCap?: number; // default 5
}

export interface AppliedMultiplier {
  source: string;
  multiplier: number;
  points: number;
}

export interface CalculatorOutput {
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  appliedMultipliers: AppliedMultiplier[];
}

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

function toMajorUnits(amountMinor: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  return decimals === 0 ? amountMinor : amountMinor / 10 ** decimals;
}

/**
 * Calculate loyalty points for a transaction.
 * Throws on negative amount.
 */
export function calculate(input: CalculatorInput): CalculatorOutput {
  if (input.amount < 0) {
    throw new Error('amount must be non-negative');
  }
  const cap = input.multiplierCap ?? 5;
  if (cap <= 0) {
    throw new Error('multiplierCap must be positive');
  }

  if (input.amount === 0) {
    return { basePoints: 0, bonusPoints: 0, totalPoints: 0, appliedMultipliers: [] };
  }

  const tierMultiplier = input.tierMultiplier > 0 ? input.tierMultiplier : 1;
  const majorTotal = toMajorUnits(input.amount, input.currency);

  // Base points use floor rounding as specified.
  const basePoints = Math.floor(majorTotal * input.baseEarnRate * tierMultiplier);

  const applied: AppliedMultiplier[] = [];
  let bonusPoints = 0;

  const globalPromos = input.promoMultipliers.filter((p) => p.type === 'global');
  const categoryPromos = input.promoMultipliers.filter((p) => p.type === 'category');
  const skuPromos = input.promoMultipliers.filter((p) => p.type === 'sku');

  // Per-line bonus (category/sku). Skipped when no line items present.
  if (input.skuList.length > 0) {
    for (const line of input.skuList) {
      if (line.amount <= 0) continue;
      const lineMajor = toMajorUnits(line.amount, input.currency);

      // Start with base per-line multiplier of 1 (base already counted).
      // Bonus multipliers stack additively on top: effective = 1 + sum(bonus).
      let stackedBonus = 0;
      const lineSources: Array<{ source: string; multiplier: number }> = [];

      for (const promo of categoryPromos) {
        if (promo.match && line.categoryId === promo.match && promo.multiplier > 1) {
          stackedBonus += promo.multiplier - 1;
          lineSources.push({ source: `category:${promo.match}`, multiplier: promo.multiplier });
        }
      }
      for (const promo of skuPromos) {
        if (promo.match && line.sku === promo.match && promo.multiplier > 1) {
          stackedBonus += promo.multiplier - 1;
          lineSources.push({ source: `sku:${promo.match}`, multiplier: promo.multiplier });
        }
      }
      for (const promo of globalPromos) {
        if (promo.multiplier > 1) {
          stackedBonus += promo.multiplier - 1;
          lineSources.push({ source: 'global', multiplier: promo.multiplier });
        }
      }

      // Apply cap: effective multiplier cannot exceed `cap`.
      // Effective = 1 + bonus, so bonus part is capped at (cap - 1).
      const effective = Math.min(1 + stackedBonus, cap);
      const bonusPart = effective - 1;
      if (bonusPart <= 0) continue;

      const lineBonus = Math.floor(lineMajor * input.baseEarnRate * tierMultiplier * bonusPart);
      if (lineBonus <= 0) continue;

      // Distribute reported bonus across sources proportionally for transparency.
      const totalWeight = lineSources.reduce((sum, s) => sum + (s.multiplier - 1), 0);
      for (const src of lineSources) {
        const weight = (src.multiplier - 1) / (totalWeight || 1);
        applied.push({
          source: src.source,
          multiplier: src.multiplier,
          points: Math.floor(lineBonus * weight),
        });
      }
      bonusPoints += lineBonus;
    }
  } else if (globalPromos.length > 0) {
    // No skuList — apply global promos to the full amount.
    let stackedBonus = 0;
    for (const promo of globalPromos) {
      if (promo.multiplier > 1) stackedBonus += promo.multiplier - 1;
    }
    const effective = Math.min(1 + stackedBonus, cap);
    const bonusPart = effective - 1;
    if (bonusPart > 0) {
      const lineBonus = Math.floor(majorTotal * input.baseEarnRate * tierMultiplier * bonusPart);
      if (lineBonus > 0) {
        applied.push({ source: 'global', multiplier: 1 + bonusPart, points: lineBonus });
        bonusPoints += lineBonus;
      }
    }
  }

  return {
    basePoints,
    bonusPoints,
    totalPoints: basePoints + bonusPoints,
    appliedMultipliers: applied,
  };
}
