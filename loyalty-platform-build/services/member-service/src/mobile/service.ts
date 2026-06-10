import type { MemberRepository, MemberRow, TierRow, LedgerRow } from '../repository';
import type { BalanceCache } from '../cache';
import type { PiiKeyProvider } from '../pii';
import { decryptPII } from '../pii';
import type { DashboardCache } from './cache';
import type {
  MobileDashboardDTO,
  MobileTransactionDTO,
  MobileOfferDTO,
  MobileNotificationDTO,
  TierProgressDTO,
  TierBenefitsDTO,
  PushRegistration,
  PushRegisterInput,
  NotificationPreferencesInput,
} from './schemas';
import { NotFoundError } from '@loyalty/shared-errors';

// --- Extended repository interface for mobile-specific queries ---

export interface MobileTierRow {
  id: string;
  name: string;
  rank: number;
  thresholdPoints: number;
  benefits: TierBenefitsDTO;
  sortOrder: number;
}

export interface MobileTransactionRow {
  id: string;
  memberId: string;
  channel: string;
  amountCents: number;
  currency: string;
  pointsEarned: number;
  createdAt: string;
}

export interface MobileOfferRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: string;
  value: number;
  startsAt: string;
  endsAt: string;
  conditionsJson?: Record<string, unknown>;
}

export interface MobileNotificationRow {
  id: string;
  templateKey: string;
  channel: string;
  status: string;
  createdAt: string;
}

/**
 * Extended data provider for mobile endpoints. In production this would query
 * SQL; in tests it uses InMemoryMobileDataProvider.
 */
export interface MobileDataProvider {
  getMember(tenantId: string, memberId: string): Promise<MemberRow | null>;
  getBalance(tenantId: string, memberId: string): Promise<number>;
  getAllTiers(tenantId: string): Promise<MobileTierRow[]>;
  getTier(tenantId: string, tierId: string): Promise<MobileTierRow | null>;
  getRecentTransactions(
    tenantId: string,
    memberId: string,
    limit: number,
    after?: string,
  ): Promise<MobileTransactionRow[]>;
  getEligibleOffers(tenantId: string, memberId: string, limit: number): Promise<MobileOfferRow[]>;
  getUnreadNotificationCount(tenantId: string, memberId: string): Promise<number>;
  getNotifications(
    tenantId: string,
    memberId: string,
    limit: number,
  ): Promise<MobileNotificationRow[]>;
  getNotificationPreferences(
    tenantId: string,
    memberId: string,
  ): Promise<Record<string, boolean>>;
  setNotificationPreference(
    tenantId: string,
    memberId: string,
    templateKey: string,
    optedIn: boolean,
  ): Promise<void>;
}

export interface MobileServiceDeps {
  data: MobileDataProvider;
  balanceCache: BalanceCache;
  dashboardCache: DashboardCache;
  pii: PiiKeyProvider;
}

// --- Push registration in-memory store ---

const pushRegistrations = new Map<string, PushRegistration[]>();

export function getPushRegistrations(): Map<string, PushRegistration[]> {
  return pushRegistrations;
}

export function clearPushRegistrations(): void {
  pushRegistrations.clear();
}

// --- Mobile Service ---

export class MobileService {
  constructor(private readonly deps: MobileServiceDeps) {}

  /**
   * Aggregated mobile dashboard endpoint.
   * 1. Check Redis cache (TTL 60s)
   * 2. On miss: parallel-fetch member + balance + tier + transactions + offers + notification count
   * 3. Serialize, cache, return
   */
  public async getDashboard(tenantId: string, memberId: string): Promise<MobileDashboardDTO> {
    // 1. Cache check
    const cached = await this.deps.dashboardCache.get(tenantId, memberId);
    if (cached) return cached;

    // 2. Parallel fetch
    const [member, balance, allTiers, transactions, offers, unreadCount] = await Promise.all([
      this.deps.data.getMember(tenantId, memberId),
      this.resolveBalance(tenantId, memberId),
      this.deps.data.getAllTiers(tenantId),
      this.deps.data.getRecentTransactions(tenantId, memberId, 5),
      this.deps.data.getEligibleOffers(tenantId, memberId, 5),
      this.deps.data.getUnreadNotificationCount(tenantId, memberId),
    ]);

    if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

    const currentTier = allTiers.find((t) => t.id === member.tierId);
    if (!currentTier) throw new NotFoundError(`Tier not found: ${member.tierId}`);

    const tierProgress = calculateTierProgress(currentTier, allTiers, balance);

    const dashboard: MobileDashboardDTO = {
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        status: member.status,
      },
      tier: {
        id: currentTier.id,
        name: currentTier.name,
      },
      balance,
      tierProgress,
      recentTransactions: transactions.map(toMobileTransaction),
      eligibleOffers: offers.map(toMobileOffer),
      unreadNotifications: unreadCount,
    };

    // 3. Cache and return
    await this.deps.dashboardCache.set(tenantId, memberId, dashboard);
    return dashboard;
  }

  public async getTransactions(
    tenantId: string,
    memberId: string,
    limit: number,
    after?: string,
  ): Promise<{ items: MobileTransactionDTO[]; nextCursor?: string }> {
    const member = await this.deps.data.getMember(tenantId, memberId);
    if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

    const rows = await this.deps.data.getRecentTransactions(tenantId, memberId, limit, after);
    const items = rows.map(toMobileTransaction);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: items.length === limit && last ? last.id : undefined,
    };
  }

  public async getOffers(tenantId: string, memberId: string): Promise<MobileOfferDTO[]> {
    const member = await this.deps.data.getMember(tenantId, memberId);
    if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

    const rows = await this.deps.data.getEligibleOffers(tenantId, memberId, 50);
    return rows.map(toMobileOffer);
  }

  public async getTierProgress(tenantId: string, memberId: string): Promise<TierProgressDTO> {
    const [member, balance, allTiers] = await Promise.all([
      this.deps.data.getMember(tenantId, memberId),
      this.resolveBalance(tenantId, memberId),
      this.deps.data.getAllTiers(tenantId),
    ]);

    if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

    const currentTier = allTiers.find((t) => t.id === member.tierId);
    if (!currentTier) throw new NotFoundError(`Tier not found: ${member.tierId}`);

    return calculateTierProgress(currentTier, allTiers, balance);
  }

  public async registerPushDevice(input: PushRegisterInput): Promise<PushRegistration> {
    const registration: PushRegistration = {
      memberId: input.memberId,
      deviceToken: input.deviceToken,
      platform: input.platform,
      registeredAt: new Date().toISOString(),
    };

    const key = input.memberId;
    const existing = pushRegistrations.get(key) ?? [];
    // Replace if same token already registered, otherwise add
    const filtered = existing.filter((r) => r.deviceToken !== input.deviceToken);
    filtered.push(registration);
    pushRegistrations.set(key, filtered);

    return registration;
  }

  public async updateNotificationPreferences(
    tenantId: string,
    input: NotificationPreferencesInput,
  ): Promise<void> {
    const member = await this.deps.data.getMember(tenantId, input.memberId);
    if (!member) throw new NotFoundError(`Member not found: ${input.memberId}`);

    await this.deps.data.setNotificationPreference(
      tenantId,
      input.memberId,
      input.templateKey,
      input.optedIn,
    );
  }

  public async getNotifications(
    tenantId: string,
    memberId: string,
    limit: number,
  ): Promise<MobileNotificationDTO[]> {
    const member = await this.deps.data.getMember(tenantId, memberId);
    if (!member) throw new NotFoundError(`Member not found: ${memberId}`);

    const rows = await this.deps.data.getNotifications(tenantId, memberId, limit);
    return rows.map((r) => ({
      id: r.id,
      templateKey: r.templateKey,
      channel: r.channel,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  private async resolveBalance(tenantId: string, memberId: string): Promise<number> {
    const cached = await this.deps.balanceCache.get(tenantId, memberId);
    if (cached !== null) return cached;
    const balance = await this.deps.data.getBalance(tenantId, memberId);
    await this.deps.balanceCache.set(tenantId, memberId, balance);
    return balance;
  }
}

// --- Pure functions ---

export function calculateTierProgress(
  currentTier: MobileTierRow,
  allTiers: MobileTierRow[],
  currentBalance: number,
): TierProgressDTO {
  const sorted = allTiers.slice().sort((a, b) => a.rank - b.rank);
  const nextTier = sorted.find((t) => t.rank > currentTier.rank) ?? null;

  let pointsToNext = 0;
  let percentComplete = 100;

  if (nextTier) {
    pointsToNext = Math.max(0, nextTier.thresholdPoints - currentBalance);
    const range = nextTier.thresholdPoints - currentTier.thresholdPoints;
    if (range > 0) {
      const progress = currentBalance - currentTier.thresholdPoints;
      percentComplete = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    } else {
      percentComplete = 100;
    }
  }

  return {
    current: {
      tierId: currentTier.id,
      tierName: currentTier.name,
      rank: currentTier.rank,
      thresholdPoints: currentTier.thresholdPoints,
      benefits: currentTier.benefits,
    },
    next: nextTier
      ? {
          tierId: nextTier.id,
          tierName: nextTier.name,
          rank: nextTier.rank,
          thresholdPoints: nextTier.thresholdPoints,
          benefits: nextTier.benefits,
        }
      : null,
    pointsToNext,
    percentComplete,
  };
}

function toMobileTransaction(row: MobileTransactionRow): MobileTransactionDTO {
  return {
    id: row.id,
    memberId: row.memberId,
    channel: row.channel,
    amountCents: row.amountCents,
    currency: row.currency,
    pointsEarned: row.pointsEarned,
    createdAt: row.createdAt,
  };
}

function toMobileOffer(row: MobileOfferRow): MobileOfferDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type,
    value: row.value,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    imageUrl: row.conditionsJson?.imageUrl as string | undefined,
  };
}
