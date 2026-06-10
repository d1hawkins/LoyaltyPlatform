/**
 * HTTP cross-service clients for admin-api.
 *
 * Forwards x-tenant-id, x-user-id, x-correlation-id headers to downstream services.
 */

import type {
  MemberClient,
  MemberSummary,
  LoyaltyEngineClient,
  WebhookWorkerClient,
} from './repositories';

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

function forwardHeaders(tenantId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'x-tenant-id': tenantId,
    'x-user-id': 'system',
    ...(extra ?? {}),
  };
}

// ── Member Service Client ────────────────────────────────────────────────

export class HttpMemberClient implements MemberClient {
  constructor(private readonly baseUrl: string) {}

  async search(
    tenantId: string,
    filter: { q?: string; tierId?: string; status?: string; limit?: number; cursor?: string },
  ): Promise<{ items: MemberSummary[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (filter.q) params.set('q', filter.q);
    if (filter.tierId) params.set('tierId', filter.tierId);
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    if (filter.cursor) params.set('cursor', filter.cursor);

    return fetchJson<{ items: MemberSummary[]; nextCursor?: string }>(
      `${this.baseUrl}/v1/members?${params.toString()}`,
      { headers: forwardHeaders(tenantId) },
    );
  }

  async getById(tenantId: string, memberId: string): Promise<MemberSummary | null> {
    try {
      return await fetchJson<MemberSummary>(
        `${this.baseUrl}/v1/members/${memberId}`,
        { headers: forwardHeaders(tenantId) },
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }

  async setStatus(
    tenantId: string,
    memberId: string,
    status: 'active' | 'suspended' | 'closed',
  ): Promise<MemberSummary | null> {
    try {
      return await fetchJson<MemberSummary>(
        `${this.baseUrl}/v1/members/${memberId}/status`,
        {
          method: 'POST',
          headers: forwardHeaders(tenantId),
          body: JSON.stringify({ status }),
        },
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }

  async gdprDelete(tenantId: string, memberId: string, confirm: boolean): Promise<boolean> {
    const result = await fetchJson<{ deleted?: boolean }>(
      `${this.baseUrl}/v1/members/${memberId}/gdpr-delete`,
      {
        method: 'POST',
        headers: forwardHeaders(tenantId),
        body: JSON.stringify({ confirm }),
      },
    );
    return result.deleted ?? false;
  }
}

// ── Loyalty Engine Client ────────────────────────────────────────────────

export class HttpLoyaltyEngineClient implements LoyaltyEngineClient {
  constructor(private readonly baseUrl: string) {}

  async adjustPoints(
    tenantId: string,
    memberId: string,
    delta: number,
    reasonCode: string,
    notes?: string,
  ): Promise<{ balanceAfter: number; ledgerEntryId: string }> {
    return fetchJson<{ balanceAfter: number; ledgerEntryId: string }>(
      `${this.baseUrl}/v1/members/${memberId}/adjustments`,
      {
        method: 'POST',
        headers: forwardHeaders(tenantId, {
          'x-user-role': 'admin',
          'idempotency-key': `adj-${memberId}-${Date.now()}`,
        }),
        body: JSON.stringify({ delta, reasonCode, notes }),
      },
    );
  }

  async overrideTier(
    tenantId: string,
    memberId: string,
    toTierId: string,
    reason: string,
  ): Promise<{ fromTierId: string; toTierId: string }> {
    return fetchJson<{ fromTierId: string; toTierId: string }>(
      `${this.baseUrl}/v1/tiers/override`,
      {
        method: 'POST',
        headers: forwardHeaders(tenantId),
        body: JSON.stringify({ memberId, toTierId, reason }),
      },
    );
  }
}

// ── Webhook Worker Client ────────────────────────────────────────────────

export class HttpWebhookWorkerClient implements WebhookWorkerClient {
  constructor(private readonly baseUrl: string) {}

  async test(
    tenantId: string,
    webhookId: string,
  ): Promise<{ ok: boolean; responseStatus?: number }> {
    return fetchJson<{ ok: boolean; responseStatus?: number }>(
      `${this.baseUrl}/v1/webhooks/${webhookId}/test`,
      {
        method: 'POST',
        headers: forwardHeaders(tenantId),
      },
    );
  }

  async listDeliveries(
    tenantId: string,
    webhookId: string,
    status?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const result = await fetchJson<{ items: Array<Record<string, unknown>> }>(
      `${this.baseUrl}/v1/webhooks/${webhookId}/deliveries?${params.toString()}`,
      { headers: forwardHeaders(tenantId) },
    );
    return result.items;
  }
}
