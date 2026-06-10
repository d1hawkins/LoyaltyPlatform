import type { MemberContact } from './types';

export interface MemberClient {
  getMemberContact(tenantId: string, memberId: string): Promise<MemberContact | null>;
}

/**
 * HTTP-backed member client. Calls `GET /v1/members/:id` on the member
 * service. Authentication in dev mode uses x-tenant-id / x-user-id headers,
 * matching the SKIP_AUTH bypass so local / test flows work without JWTs.
 */
export class HttpMemberClient implements MemberClient {
  constructor(
    private readonly baseUrl: string,
    private readonly userId: string = 'notification-service',
  ) {}

  public async getMemberContact(
    tenantId: string,
    memberId: string,
  ): Promise<MemberContact | null> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/members/${encodeURIComponent(memberId)}`;
    const res = await fetch(url, {
      headers: {
        'x-tenant-id': tenantId,
        'x-user-id': this.userId,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`member-client: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as Record<string, unknown>;
    return {
      memberId: String(body.memberId ?? memberId),
      email: typeof body.email === 'string' ? body.email : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      firstName: typeof body.firstName === 'string' ? body.firstName : undefined,
      lastName: typeof body.lastName === 'string' ? body.lastName : undefined,
      locale: typeof body.locale === 'string' ? body.locale : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
    };
  }
}

/** In-memory member client for tests and in-memory bootstraps. */
export class InMemoryMemberClient implements MemberClient {
  public readonly members = new Map<string, MemberContact>();

  constructor(seed: MemberContact[] = []) {
    for (const m of seed) this.members.set(m.memberId, m);
  }

  public async getMemberContact(
    _tenantId: string,
    memberId: string,
  ): Promise<MemberContact | null> {
    return this.members.get(memberId) ?? null;
  }
}
