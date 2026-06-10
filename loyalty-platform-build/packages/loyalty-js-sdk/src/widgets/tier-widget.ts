import type { LoyaltyClient } from '../client';

/**
 * Renders a tier progress bar into the provided DOM element.
 * Shows the member's current tier and progress toward the next tier.
 *
 * @param el - Target HTMLElement to render into
 * @param client - Initialized LoyaltyClient instance
 * @param memberId - The member whose tier progress to display
 */
export async function renderTierProgressWidget(
  el: HTMLElement,
  client: LoyaltyClient,
  memberId: string,
): Promise<void> {
  el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
    <div style="color:#718096;font-size:14px;">Loading tier info...</div>
  </div>`;

  try {
    const member = await client.getMember(memberId);
    const { balance } = await client.getBalance(memberId);

    // Tier colors by common tier names; fallback to gray
    const tierColors: Record<string, string> = {
      bronze: '#cd7f32',
      silver: '#c0c0c0',
      gold: '#ffd700',
      platinum: '#e5e4e2',
      diamond: '#b9f2ff',
    };
    const tierColor = tierColors[member.tierName.toLowerCase()] ?? '#4a5568';

    // Calculate a simple progress percentage (balance as proportion; capped at 100%)
    // In a real scenario the SDK would fetch tier thresholds from the API
    const progressPercent = Math.min(100, Math.max(0, (balance % 1000) / 10));

    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Current Tier</div>
          <div style="font-size:20px;font-weight:700;color:${tierColor};" data-testid="tier-name">${member.tierName}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#718096;font-size:12px;">Points</div>
          <div style="font-size:18px;font-weight:600;color:#2d3748;" data-testid="tier-points">${balance.toLocaleString()}</div>
        </div>
      </div>
      <div style="background:#edf2f7;border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:${tierColor};height:100%;width:${progressPercent}%;border-radius:4px;transition:width 0.3s ease;" data-testid="tier-progress"></div>
      </div>
      <div style="color:#a0aec0;font-size:11px;margin-top:6px;text-align:right;">Progress to next tier</div>
    </div>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tier info';
    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #fed7d7;border-radius:8px;text-align:center;color:#c53030;">
      <div style="font-size:14px;">${message}</div>
    </div>`;
  }
}
