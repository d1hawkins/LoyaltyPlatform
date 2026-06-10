import type { LoyaltyClient } from '../client';

/**
 * Renders a points balance display into the provided DOM element.
 *
 * @param el - Target HTMLElement to render into
 * @param client - Initialized LoyaltyClient instance
 * @param memberId - The member whose balance to display
 */
export async function renderBalanceWidget(
  el: HTMLElement,
  client: LoyaltyClient,
  memberId: string,
): Promise<void> {
  el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
    <div style="color:#718096;font-size:14px;">Loading balance...</div>
  </div>`;

  try {
    const { balance, lastUpdated } = await client.getBalance(memberId);
    const formattedDate = new Date(lastUpdated).toLocaleDateString();

    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
      <div style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Points Balance</div>
      <div style="font-size:36px;font-weight:700;color:#2d3748;margin:8px 0;" data-testid="balance-value">${balance.toLocaleString()}</div>
      <div style="color:#a0aec0;font-size:12px;">Updated ${formattedDate}</div>
    </div>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load balance';
    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #fed7d7;border-radius:8px;text-align:center;color:#c53030;">
      <div style="font-size:14px;">${message}</div>
    </div>`;
  }
}
