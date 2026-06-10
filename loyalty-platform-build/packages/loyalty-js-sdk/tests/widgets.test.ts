/**
 * @jest-environment jsdom
 */

import { LoyaltyClient } from '../src/client';
import { renderBalanceWidget } from '../src/widgets/balance-widget';
import { renderOffersWidget } from '../src/widgets/offers-widget';
import { renderTierProgressWidget } from '../src/widgets/tier-widget';

// Mock fetch globally
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('Widgets', () => {
  let client: LoyaltyClient;
  let container: HTMLElement;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new LoyaltyClient({
      apiUrl: 'https://api.example.com',
      apiKey: 'test-key',
      tenantId: 'tenant-1',
      timeout: 5000,
      maxRetries: 0,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('renderBalanceWidget', () => {
    it('renders balance into the element', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { balance: 1250, lastUpdated: '2026-04-01T00:00:00Z' }),
      );

      await renderBalanceWidget(container, client, 'mem-1');

      const balanceEl = container.querySelector('[data-testid="balance-value"]');
      expect(balanceEl).not.toBeNull();
      expect(balanceEl!.textContent).toContain('1,250');
    });

    it('renders error state on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(500, { title: 'Server error' }),
      );

      await renderBalanceWidget(container, client, 'mem-1');

      expect(container.innerHTML).toContain('Server error');
    });
  });

  describe('renderOffersWidget', () => {
    it('renders offers list', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, {
          items: [
            {
              id: 'offer-1',
              tenantId: 'tenant-1',
              code: 'SAVE10',
              name: '10% Off Everything',
              description: 'Limited time offer',
              type: 'percent',
              value: 10,
              startsAt: '2026-01-01',
              endsAt: '2026-12-31',
              isActive: true,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
            {
              id: 'offer-2',
              tenantId: 'tenant-1',
              code: 'BONUS500',
              name: '500 Bonus Points',
              type: 'fixed',
              value: 500,
              startsAt: '2026-01-01',
              endsAt: '2026-06-30',
              isActive: true,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        }),
      );

      await renderOffersWidget(container, client, 'mem-1');

      const list = container.querySelector('[data-testid="offers-list"]');
      expect(list).not.toBeNull();
      expect(list!.children.length).toBe(2);
      expect(container.innerHTML).toContain('10% Off Everything');
      expect(container.innerHTML).toContain('500 Bonus Points');
    });

    it('renders "no offers" when empty', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

      await renderOffersWidget(container, client, 'mem-1');

      const noOffers = container.querySelector('[data-testid="no-offers"]');
      expect(noOffers).not.toBeNull();
      expect(noOffers!.textContent).toContain('No offers available');
    });

    it('renders error on failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500, { title: 'Internal error' }));

      await renderOffersWidget(container, client, 'mem-1');

      expect(container.innerHTML).toContain('Internal error');
    });
  });

  describe('renderTierProgressWidget', () => {
    it('renders tier name and progress', async () => {
      // getMember call
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'mem-1',
          tenantId: 'tenant-1',
          status: 'active',
          tierId: 'tier-silver',
          tierName: 'Silver',
          pointsBalance: 750,
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+15555551234',
          enrolledChannel: 'ecommerce',
          enrolledAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      );
      // getBalance call
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { balance: 750, lastUpdated: '2026-04-01T00:00:00Z' }),
      );

      await renderTierProgressWidget(container, client, 'mem-1');

      const tierName = container.querySelector('[data-testid="tier-name"]');
      expect(tierName).not.toBeNull();
      expect(tierName!.textContent).toBe('Silver');

      const tierPoints = container.querySelector('[data-testid="tier-points"]');
      expect(tierPoints).not.toBeNull();
      expect(tierPoints!.textContent).toContain('750');

      const progress = container.querySelector('[data-testid="tier-progress"]');
      expect(progress).not.toBeNull();
    });

    it('renders error on failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { title: 'Unauthorized' }));

      await renderTierProgressWidget(container, client, 'mem-1');

      expect(container.innerHTML).toContain('Unauthorized');
    });
  });
});
