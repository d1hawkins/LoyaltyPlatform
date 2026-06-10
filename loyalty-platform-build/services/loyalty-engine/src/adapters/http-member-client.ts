/**
 * HTTP client that calls member-service to look up member records.
 * Used by the loyalty engine to verify members exist and are active
 * before recording transactions.
 */
import type { MemberClient, MemberRecord } from '../deps';

export class HttpMemberClient implements MemberClient {
  constructor(private readonly baseUrl: string) {}

  async getMember(tenantId: string, memberId: string): Promise<MemberRecord | null> {
    const url = `${this.baseUrl}/v1/members/${memberId}`;
    const res = await fetch(url, {
      headers: {
        'x-tenant-id': tenantId,
        'x-user-id': 'system',
        'x-user-role': 'admin',
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Member lookup failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    return {
      memberId: (data.memberId ?? data.member_id ?? memberId) as string,
      tenantId,
      status: (data.status as MemberRecord['status']) ?? 'active',
      tierId: (data.tierId ?? data.tier_id ?? 'default') as string,
      tierMultiplier: Number(data.tierMultiplier ?? data.tier_multiplier ?? 1),
    };
  }
}
