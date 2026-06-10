import type { TierRow } from './evaluator';
import type {
  MemberRecord,
  TierHistoryInsert,
  TierRepository,
} from './repository';

interface LedgerEntry {
  memberId: string;
  delta: number;
  createdAt: Date;
}

/**
 * In-memory repository used by tests and for local smoke-testing when the
 * worker boots without CONTROL_PLANE_SQL_CONNSTR.
 */
export class InMemoryTierRepository implements TierRepository {
  public tenants: string[] = [];
  public tiersByTenant = new Map<string, TierRow[]>();
  public membersByTenant = new Map<string, Map<string, MemberRecord>>();
  public ledgerByTenant = new Map<string, LedgerEntry[]>();
  public history: Array<{ tenantId: string } & TierHistoryInsert> = [];

  public seedTenant(
    tenantId: string,
    tiers: TierRow[],
    members: MemberRecord[] = [],
    ledger: LedgerEntry[] = [],
  ): void {
    if (!this.tenants.includes(tenantId)) this.tenants.push(tenantId);
    this.tiersByTenant.set(tenantId, tiers);
    const m = new Map<string, MemberRecord>();
    for (const mem of members) m.set(mem.memberId, { ...mem });
    this.membersByTenant.set(tenantId, m);
    this.ledgerByTenant.set(tenantId, [...ledger]);
  }

  public async ensureSchema(): Promise<void> {
    // no-op
  }

  public async getRollingPoints(tenantId: string, memberId: string): Promise<number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const entries = this.ledgerByTenant.get(tenantId) ?? [];
    return entries
      .filter((e) => e.memberId === memberId && e.createdAt >= cutoff)
      .reduce((sum, e) => sum + e.delta, 0);
  }

  public async getTiers(tenantId: string): Promise<TierRow[]> {
    const tiers = this.tiersByTenant.get(tenantId) ?? [];
    return [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  }

  public async getMember(tenantId: string, memberId: string): Promise<MemberRecord | null> {
    return this.membersByTenant.get(tenantId)?.get(memberId) ?? null;
  }

  public async applyTierChange(
    tenantId: string,
    memberId: string,
    newTierId: string | null,
    history: TierHistoryInsert,
  ): Promise<void> {
    const members = this.membersByTenant.get(tenantId);
    const member = members?.get(memberId);
    if (!member) throw new Error(`member_not_found:${memberId}`);
    member.tierId = newTierId;
    this.history.push({ tenantId, ...history });
  }

  public async listDemotionCandidates(
    tenantId: string,
    cutoffDate: Date,
  ): Promise<MemberRecord[]> {
    const members = this.membersByTenant.get(tenantId);
    if (!members) return [];
    const out: MemberRecord[] = [];
    for (const m of members.values()) {
      if (!m.lastTransactionAt) continue;
      if (new Date(m.lastTransactionAt) <= cutoffDate) out.push({ ...m });
    }
    return out;
  }

  public async listTenantIds(): Promise<string[]> {
    return [...this.tenants];
  }

  public addLedger(tenantId: string, entry: LedgerEntry): void {
    const arr = this.ledgerByTenant.get(tenantId) ?? [];
    arr.push(entry);
    this.ledgerByTenant.set(tenantId, arr);
  }
}
