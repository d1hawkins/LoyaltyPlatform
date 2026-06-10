/**
 * Pure tier-selection logic. No I/O. 100% unit-tested.
 *
 * Given a member's rolling 12-month points total and the set of configured
 * tiers for the tenant, returns the highest tier the member qualifies for.
 */
export interface TierRow {
  id: string;
  name: string;
  minPoints: number;
  sortOrder: number;
}

export interface SelectedTier {
  tierId: string;
  name: string;
}

/**
 * Select the highest-ranked tier a member qualifies for.
 *
 * Rules:
 *  - A member qualifies for a tier iff `rollingPoints >= tier.minPoints`.
 *  - Among qualifying tiers, the one with the greatest `sortOrder` wins. Ties
 *    on `sortOrder` are broken by the greater `minPoints`, then by `id` for
 *    full determinism.
 *  - Negative rolling points are clamped to 0 for evaluation (shouldn't happen
 *    in practice but we handle gracefully rather than throw).
 *  - Returns null if no tiers are configured or none qualify.
 */
export function selectTier(
  rollingPoints: number,
  tiers: ReadonlyArray<TierRow>,
): SelectedTier | null {
  if (!tiers || tiers.length === 0) {
    return null;
  }
  const effectivePoints =
    Number.isNaN(rollingPoints) || rollingPoints < 0 ? 0 : rollingPoints;

  let best: TierRow | null = null;
  for (const t of tiers) {
    if (t.minPoints > effectivePoints) continue;
    if (best === null) {
      best = t;
      continue;
    }
    if (
      t.sortOrder > best.sortOrder ||
      (t.sortOrder === best.sortOrder && t.minPoints > best.minPoints) ||
      (t.sortOrder === best.sortOrder && t.minPoints === best.minPoints && t.id > best.id)
    ) {
      best = t;
    }
  }

  return best ? { tierId: best.id, name: best.name } : null;
}

/**
 * Classify a tier transition given the previous and new tier rows (or null).
 * Returns 'upgrade', 'downgrade', or 'none'.
 */
export function classifyTransition(
  previous: TierRow | null,
  next: TierRow | null,
): 'upgrade' | 'downgrade' | 'none' {
  if (!next && !previous) return 'none';
  if (next && !previous) return 'upgrade';
  if (!next && previous) return 'downgrade';
  // Both non-null
  if (next!.id === previous!.id) return 'none';
  if (next!.sortOrder > previous!.sortOrder) return 'upgrade';
  if (next!.sortOrder < previous!.sortOrder) return 'downgrade';
  // Same sort order, different id → treat as lateral, report as none
  return 'none';
}
