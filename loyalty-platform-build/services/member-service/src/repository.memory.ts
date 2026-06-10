import type { MemberStatus } from '@loyalty/shared-types';
import type {
  CreateMemberInput,
  LedgerRow,
  MemberRepository,
  MemberRow,
  TierRow,
} from './repository';

interface InMemoryOptions {
  tiers?: TierRow[];
}

/**
 * An in-memory MemberRepository used for unit / integration tests in
 * environments where testcontainers (mssql) cannot be provisioned.
 */
export class InMemoryMemberRepository implements MemberRepository {
  private readonly members = new Map<string, MemberRow>(); // key: tenantId:id
  private readonly ledger = new Map<string, LedgerRow[]>(); // key: tenantId:memberId
  private readonly tiersByTenant = new Map<string, TierRow[]>();
  private readonly defaultTiers: TierRow[];

  constructor(opts: InMemoryOptions = {}) {
    this.defaultTiers = opts.tiers ?? [
      { id: 'tier-bronze', name: 'Bronze', sortOrder: 1 },
      { id: 'tier-silver', name: 'Silver', sortOrder: 2 },
      { id: 'tier-gold', name: 'Gold', sortOrder: 3 },
    ];
  }

  private tiersFor(tenantId: string): TierRow[] {
    let t = this.tiersByTenant.get(tenantId);
    if (!t) {
      t = [...this.defaultTiers];
      this.tiersByTenant.set(tenantId, t);
    }
    return t;
  }

  public async getDefaultTier(tenantId: string): Promise<TierRow | null> {
    const tiers = this.tiersFor(tenantId);
    return tiers.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  }

  public async getTier(tenantId: string, tierId: string): Promise<TierRow | null> {
    return this.tiersFor(tenantId).find((t) => t.id === tierId) ?? null;
  }

  public async findByEmailHash(tenantId: string, emailHash: string): Promise<MemberRow | null> {
    for (const m of this.members.values()) {
      if (m.tenantId === tenantId && !m.isDeleted && m.emailHash === emailHash) return m;
    }
    return null;
  }

  public async findByPhoneHash(tenantId: string, phoneHash: string): Promise<MemberRow | null> {
    for (const m of this.members.values()) {
      if (m.tenantId === tenantId && !m.isDeleted && m.phoneHash === phoneHash) return m;
    }
    return null;
  }

  public async getById(tenantId: string, id: string): Promise<MemberRow | null> {
    const m = this.members.get(`${tenantId}:${id}`);
    if (!m || m.isDeleted) return null;
    return m;
  }

  public async create(input: CreateMemberInput): Promise<MemberRow> {
    const now = new Date().toISOString();
    const row: MemberRow = {
      id: input.id,
      tenantId: input.tenantId,
      status: 'active',
      tierId: input.tierId,
      emailHash: input.emailHash,
      phoneHash: input.phoneHash,
      emailEncrypted: input.emailEncrypted,
      phoneEncrypted: input.phoneEncrypted,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      enrolledChannel: input.enrolledChannel,
      enrolledAt: now,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.members.set(`${input.tenantId}:${input.id}`, row);
    return row;
  }

  public async update(
    tenantId: string,
    id: string,
    patch: Partial<MemberRow>,
  ): Promise<MemberRow | null> {
    const key = `${tenantId}:${id}`;
    const cur = this.members.get(key);
    if (!cur || cur.isDeleted) return null;
    const next: MemberRow = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    this.members.set(key, next);
    return next;
  }

  public async setStatus(
    tenantId: string,
    id: string,
    status: MemberStatus,
  ): Promise<MemberRow | null> {
    return this.update(tenantId, id, { status });
  }

  public async softDelete(tenantId: string, id: string): Promise<MemberRow | null> {
    const key = `${tenantId}:${id}`;
    const cur = this.members.get(key);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next: MemberRow = { ...cur, isDeleted: true, deletedAt: now, updatedAt: now };
    this.members.set(key, next);
    return next;
  }

  public async getBalance(tenantId: string, memberId: string): Promise<number> {
    const entries = this.ledger.get(`${tenantId}:${memberId}`) ?? [];
    return entries.reduce((s, e) => s + e.delta, 0);
  }

  public async listLedger(
    tenantId: string,
    memberId: string,
    after: string | undefined,
    limit: number,
  ): Promise<LedgerRow[]> {
    const entries = this.ledger.get(`${tenantId}:${memberId}`) ?? [];
    const sorted = entries.slice().sort((a, b) => a.id.localeCompare(b.id));
    const startIdx = after ? sorted.findIndex((e) => e.id === after) + 1 : 0;
    return sorted.slice(startIdx, startIdx + limit);
  }

  // Test helper
  public seedLedger(tenantId: string, memberId: string, entry: LedgerRow): void {
    const key = `${tenantId}:${memberId}`;
    const arr = this.ledger.get(key) ?? [];
    arr.push(entry);
    this.ledger.set(key, arr);
  }
}
