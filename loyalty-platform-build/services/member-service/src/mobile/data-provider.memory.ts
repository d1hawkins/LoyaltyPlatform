import type { MemberRow } from '../repository';
import type {
  MobileDataProvider,
  MobileTierRow,
  MobileTransactionRow,
  MobileOfferRow,
  MobileNotificationRow,
} from './service';

/**
 * In-memory data provider for unit/integration tests.
 * Mirrors the contract of MobileDataProvider without requiring SQL.
 */
export class InMemoryMobileDataProvider implements MobileDataProvider {
  public members = new Map<string, MemberRow>(); // key: tenantId:memberId
  public tiers = new Map<string, MobileTierRow[]>(); // key: tenantId
  public transactions = new Map<string, MobileTransactionRow[]>(); // key: tenantId:memberId
  public offers = new Map<string, MobileOfferRow[]>(); // key: tenantId:memberId
  public notifications = new Map<string, MobileNotificationRow[]>(); // key: tenantId:memberId
  public notificationPrefs = new Map<string, Record<string, boolean>>(); // key: tenantId:memberId
  public balances = new Map<string, number>(); // key: tenantId:memberId

  private key(tenantId: string, memberId: string): string {
    return `${tenantId}:${memberId}`;
  }

  public async getMember(tenantId: string, memberId: string): Promise<MemberRow | null> {
    return this.members.get(this.key(tenantId, memberId)) ?? null;
  }

  public async getBalance(tenantId: string, memberId: string): Promise<number> {
    return this.balances.get(this.key(tenantId, memberId)) ?? 0;
  }

  public async getAllTiers(tenantId: string): Promise<MobileTierRow[]> {
    return this.tiers.get(tenantId) ?? defaultTiers();
  }

  public async getTier(tenantId: string, tierId: string): Promise<MobileTierRow | null> {
    const all = await this.getAllTiers(tenantId);
    return all.find((t) => t.id === tierId) ?? null;
  }

  public async getRecentTransactions(
    tenantId: string,
    memberId: string,
    limit: number,
    after?: string,
  ): Promise<MobileTransactionRow[]> {
    const all = this.transactions.get(this.key(tenantId, memberId)) ?? [];
    const sorted = all.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (after) {
      const idx = sorted.findIndex((t) => t.id === after);
      if (idx >= 0) return sorted.slice(idx + 1, idx + 1 + limit);
    }
    return sorted.slice(0, limit);
  }

  public async getEligibleOffers(
    tenantId: string,
    memberId: string,
    limit: number,
  ): Promise<MobileOfferRow[]> {
    const all = this.offers.get(this.key(tenantId, memberId)) ?? [];
    return all.slice(0, limit);
  }

  public async getUnreadNotificationCount(tenantId: string, memberId: string): Promise<number> {
    const all = this.notifications.get(this.key(tenantId, memberId)) ?? [];
    return all.filter((n) => n.status === 'sent').length;
  }

  public async getNotifications(
    tenantId: string,
    memberId: string,
    limit: number,
  ): Promise<MobileNotificationRow[]> {
    const all = this.notifications.get(this.key(tenantId, memberId)) ?? [];
    return all.slice(0, limit);
  }

  public async getNotificationPreferences(
    tenantId: string,
    memberId: string,
  ): Promise<Record<string, boolean>> {
    return this.notificationPrefs.get(this.key(tenantId, memberId)) ?? {};
  }

  public async setNotificationPreference(
    tenantId: string,
    memberId: string,
    templateKey: string,
    optedIn: boolean,
  ): Promise<void> {
    const key = this.key(tenantId, memberId);
    const prefs = this.notificationPrefs.get(key) ?? {};
    prefs[templateKey] = optedIn;
    this.notificationPrefs.set(key, prefs);
  }

  // --- Seed helpers for tests ---

  public seedMember(tenantId: string, member: MemberRow): void {
    this.members.set(this.key(tenantId, member.id), member);
  }

  public seedBalance(tenantId: string, memberId: string, balance: number): void {
    this.balances.set(this.key(tenantId, memberId), balance);
  }

  public seedTiers(tenantId: string, tiers: MobileTierRow[]): void {
    this.tiers.set(tenantId, tiers);
  }

  public seedTransactions(tenantId: string, memberId: string, txns: MobileTransactionRow[]): void {
    this.transactions.set(this.key(tenantId, memberId), txns);
  }

  public seedOffers(tenantId: string, memberId: string, offers: MobileOfferRow[]): void {
    this.offers.set(this.key(tenantId, memberId), offers);
  }

  public seedNotifications(
    tenantId: string,
    memberId: string,
    notifications: MobileNotificationRow[],
  ): void {
    this.notifications.set(this.key(tenantId, memberId), notifications);
  }
}

function defaultTiers(): MobileTierRow[] {
  return [
    {
      id: 'tier-bronze',
      name: 'Bronze',
      rank: 1,
      thresholdPoints: 0,
      benefits: { earnMultiplier: 1 },
      sortOrder: 1,
    },
    {
      id: 'tier-silver',
      name: 'Silver',
      rank: 2,
      thresholdPoints: 500,
      benefits: { earnMultiplier: 1.5, freeShipping: true },
      sortOrder: 2,
    },
    {
      id: 'tier-gold',
      name: 'Gold',
      rank: 3,
      thresholdPoints: 2000,
      benefits: { earnMultiplier: 2, freeShipping: true, birthdayBonus: 100 },
      sortOrder: 3,
    },
  ];
}
