import { LoyaltyClient } from '../src/client';
import type {
  Member,
  MemberSummary,
  TransactionResult,
  BalanceResult,
  RedemptionResult,
  PaginatedResult,
  LedgerEntry,
} from '../src/types';

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

describe('LoyaltyClient', () => {
  let client: LoyaltyClient;

  const fakeMember: Member = {
    id: 'mem-1',
    tenantId: 'tenant-1',
    status: 'active',
    tierId: 'tier-bronze',
    tierName: 'Bronze',
    pointsBalance: 500,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+15555551234',
    enrolledChannel: 'ecommerce',
    enrolledAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    client = new LoyaltyClient({
      apiUrl: 'https://api.example.com',
      apiKey: 'test-key',
      tenantId: 'tenant-1',
      timeout: 5000,
      maxRetries: 0, // no retries in tests for speed
    });
  });

  describe('enrollMember', () => {
    it('posts to /member/v1/members and returns member', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(201, fakeMember));

      const result = await client.enrollMember({
        phone: '+15555551234',
        firstName: 'Jane',
        lastName: 'Doe',
        enrolledChannel: 'ecommerce',
      });

      expect(result.id).toBe('mem-1');
      expect(result.firstName).toBe('Jane');
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/member/v1/members');
      expect(init.method).toBe('POST');
    });
  });

  describe('getMember', () => {
    it('gets member by ID', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, fakeMember));

      const result = await client.getMember('mem-1');

      expect(result.id).toBe('mem-1');
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/member/v1/members/mem-1');
    });
  });

  describe('lookupByPhone', () => {
    it('returns member summary when found', async () => {
      const summary: MemberSummary = {
        id: 'mem-1',
        firstName: 'Jane',
        lastName: 'Doe',
        tierId: 'tier-bronze',
        tierName: 'Bronze',
        pointsBalance: 500,
        eligibleOffers: [],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(200, summary));

      const result = await client.lookupByPhone('+15555551234');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('mem-1');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(404, { title: 'Not found', code: 'MEMBER_NOT_FOUND', status: 404 }),
      );

      const result = await client.lookupByPhone('+10000000000');

      expect(result).toBeNull();
    });
  });

  describe('lookupByEmail', () => {
    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(404, { title: 'Not found', code: 'MEMBER_NOT_FOUND', status: 404 }),
      );

      const result = await client.lookupByEmail('nobody@example.com');

      expect(result).toBeNull();
    });
  });

  describe('recordTransaction', () => {
    it('posts a transaction and returns result', async () => {
      const txnResult: TransactionResult = {
        transactionId: 'txn-1',
        pointsEarned: 25,
        newBalance: 525,
        tierId: 'tier-bronze',
        appliedMultipliers: [{ source: 'base', multiplier: 1, points: 25 }],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(201, txnResult));

      const result = await client.recordTransaction({
        memberId: 'mem-1',
        channel: 'ecommerce',
        amount: 2500,
        currency: 'USD',
      });

      expect(result.pointsEarned).toBe(25);
      expect(result.transactionId).toBe('txn-1');
    });
  });

  describe('voidTransaction', () => {
    it('posts void and returns undefined', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(204, null));

      await expect(client.voidTransaction('txn-1', 'customer return')).resolves.toBeUndefined();
    });
  });

  describe('getBalance', () => {
    it('returns balance result', async () => {
      const balance: BalanceResult = { balance: 500, lastUpdated: '2026-04-01T00:00:00Z' };
      mockFetch.mockResolvedValueOnce(jsonResponse(200, balance));

      const result = await client.getBalance('mem-1');

      expect(result.balance).toBe(500);
    });
  });

  describe('getEligibleOffers', () => {
    it('returns array of offers', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, {
          items: [
            {
              id: 'offer-1',
              tenantId: 'tenant-1',
              code: 'SAVE10',
              name: '10% off',
              type: 'percent',
              value: 10,
              startsAt: '2026-01-01',
              endsAt: '2026-12-31',
              isActive: true,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        }),
      );

      const offers = await client.getEligibleOffers('mem-1');

      expect(offers).toHaveLength(1);
      expect(offers[0]!.code).toBe('SAVE10');
    });

    it('returns empty array when no items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

      const offers = await client.getEligibleOffers('mem-1');

      expect(offers).toEqual([]);
    });
  });

  describe('redeemOffer', () => {
    it('redeems an offer and returns result', async () => {
      const redemption: RedemptionResult = {
        redemptionId: 'red-1',
        pointsUsed: 200,
        newBalance: 300,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(201, redemption));

      const result = await client.redeemOffer({
        memberId: 'mem-1',
        offerId: 'offer-1',
        pointsToBurn: 200,
      });

      expect(result.pointsUsed).toBe(200);
    });
  });

  describe('getLedger', () => {
    it('returns paginated ledger entries', async () => {
      const ledger: PaginatedResult<LedgerEntry> = {
        items: [
          {
            id: 'led-1',
            memberId: 'mem-1',
            delta: 25,
            balanceAfter: 525,
            reason: 'earn',
            createdAt: '2026-04-01T00:00:00Z',
          },
        ],
        nextCursor: 'abc123',
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(200, ledger));

      const result = await client.getLedger('mem-1', { limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe('abc123');
    });

    it('passes after and limit as query params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

      await client.getLedger('mem-1', { after: 'cursor-xyz', limit: 20 });

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('after=cursor-xyz');
      expect(url).toContain('limit=20');
    });
  });
});
