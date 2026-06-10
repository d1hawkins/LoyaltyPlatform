/**
 * HTTP cross-service clients for offer-service.
 *
 * Forwards x-tenant-id header to downstream services.
 */

import type { LoyaltyEngineClient, MemberClient, MemberInfo } from './deps';

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Loyalty Engine Client ────────────────────────────────────────────────

export class HttpLoyaltyEngineClient implements LoyaltyEngineClient {
  constructor(private readonly baseUrl: string) {}

  async redeemPoints(
    tenantId: string,
    body: { memberId: string; offerId: string; pointsToBurn: number },
  ): Promise<{ redemptionId: string; pointsUsed: number; newBalance: number }> {
    return fetchJson<{ redemptionId: string; pointsUsed: number; newBalance: number }>(
      `${this.baseUrl}/v1/points/redeem`,
      {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId, 'x-user-id': 'system' },
        body: JSON.stringify(body),
      },
    );
  }

  async reverseRedemption(
    tenantId: string,
    body: { memberId: string; pointsToRestore: number },
  ): Promise<{ newBalance: number }> {
    return fetchJson<{ newBalance: number }>(
      `${this.baseUrl}/v1/points/reverse`,
      {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId, 'x-user-id': 'system' },
        body: JSON.stringify(body),
      },
    );
  }
}

// ── Member Service Client ────────────────────────────────────────────────

export class HttpMemberClient implements MemberClient {
  constructor(
    private readonly memberBaseUrl: string,
    private readonly engineBaseUrl?: string,
  ) {}

  async getMember(tenantId: string, memberId: string): Promise<MemberInfo | null> {
    try {
      const data = await fetchJson<Record<string, unknown>>(
        `${this.memberBaseUrl}/v1/members/${memberId}`,
        { headers: { 'x-tenant-id': tenantId, 'x-user-id': 'system' } },
      );

      // The member record's pointsBalance may be stale (0) because balance is
      // computed from the ledger, not stored on the member row. Fetch the real
      // balance from the loyalty-engine if available.
      let pointsBalance = (data.pointsBalance ?? 0) as number;
      if (this.engineBaseUrl) {
        try {
          const bal = await fetchJson<{ balance: number }>(
            `${this.engineBaseUrl}/v1/members/${memberId}/balance`,
            { headers: { 'x-tenant-id': tenantId, 'x-user-id': 'system' } },
          );
          pointsBalance = bal.balance;
        } catch {
          // Fall back to member record balance if engine unreachable
        }
      }

      return {
        memberId: (data.id ?? data.memberId) as string,
        tenantId,
        status: data.status as 'active' | 'suspended' | 'closed',
        tierId: data.tierId as string,
        pointsBalance,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }
}
