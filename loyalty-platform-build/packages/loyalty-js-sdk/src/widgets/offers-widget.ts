import type { LoyaltyClient } from '../client';
import type { Offer } from '../types';

/**
 * Renders eligible offers into the provided DOM element.
 *
 * @param el - Target HTMLElement to render into
 * @param client - Initialized LoyaltyClient instance
 * @param memberId - The member whose eligible offers to display
 */
export async function renderOffersWidget(
  el: HTMLElement,
  client: LoyaltyClient,
  memberId: string,
): Promise<void> {
  el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
    <div style="color:#718096;font-size:14px;">Loading offers...</div>
  </div>`;

  try {
    const offers = await client.getEligibleOffers(memberId);

    if (offers.length === 0) {
      el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
        <div style="color:#718096;font-size:14px;text-align:center;" data-testid="no-offers">No offers available right now</div>
      </div>`;
      return;
    }

    const offerCards = offers.map((offer: Offer) => renderOfferCard(offer)).join('');

    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;">
      <div style="color:#2d3748;font-size:16px;font-weight:600;margin-bottom:12px;">Available Offers</div>
      <div style="display:flex;flex-direction:column;gap:8px;" data-testid="offers-list">${offerCards}</div>
    </div>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load offers';
    el.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border:1px solid #fed7d7;border-radius:8px;text-align:center;color:#c53030;">
      <div style="font-size:14px;">${message}</div>
    </div>`;
  }
}

function renderOfferCard(offer: Offer): string {
  const valueDisplay = offer.type === 'percent' ? `${offer.value}% off` : `${offer.value} pts`;
  const expiresAt = new Date(offer.endsAt).toLocaleDateString();

  return `<div style="padding:12px;border:1px solid #e2e8f0;border-radius:6px;display:flex;justify-content:space-between;align-items:center;" data-offer-id="${offer.id}">
    <div>
      <div style="font-weight:600;color:#2d3748;font-size:14px;">${offer.name}</div>
      <div style="color:#718096;font-size:12px;">${offer.description ?? ''}</div>
      <div style="color:#a0aec0;font-size:11px;margin-top:4px;">Expires ${expiresAt}</div>
    </div>
    <div style="background:#ebf8ff;color:#3182ce;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:600;white-space:nowrap;">
      ${valueDisplay}
    </div>
  </div>`;
}
