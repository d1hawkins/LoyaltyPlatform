import {
  MobileService,
  calculateTierProgress,
  clearPushRegistrations,
  getPushRegistrations,
  InMemoryDashboardCache,
  InMemoryMobileDataProvider,
} from '../src/mobile';
import type { MobileTierRow } from '../src/mobile';
import { InMemoryBalanceCache } from '../src/cache';
import { StaticPiiKeyProvider } from '../src/pii';
import type { MemberRow } from '../src/repository';

const TENANT = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  const now = new Date().toISOString();
  return {
    id: MEMBER_ID,
    tenantId: TENANT,
    status: 'active',
    tierId: 'tier-silver',
    emailHash: 'hash-email',
    phoneHash: 'hash-phone',
    emailEncrypted: undefined,
    phoneEncrypted: 'encrypted-phone',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    enrolledChannel: 'mobile',
    enrolledAt: now,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function defaultTiers(): MobileTierRow[] {
  return [
    { id: 'tier-bronze', name: 'Bronze', rank: 1, thresholdPoints: 0, benefits: { earnMultiplier: 1 }, sortOrder: 1 },
    { id: 'tier-silver', name: 'Silver', rank: 2, thresholdPoints: 500, benefits: { earnMultiplier: 1.5, freeShipping: true }, sortOrder: 2 },
    { id: 'tier-gold', name: 'Gold', rank: 3, thresholdPoints: 2000, benefits: { earnMultiplier: 2, freeShipping: true, birthdayBonus: 100 }, sortOrder: 3 },
  ];
}

function createService() {
  const data = new InMemoryMobileDataProvider();
  const balanceCache = new InMemoryBalanceCache();
  const dashboardCache = new InMemoryDashboardCache();
  const pii = new StaticPiiKeyProvider(
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  );
  const service = new MobileService({ data, balanceCache, dashboardCache, pii });
  return { service, data, balanceCache, dashboardCache };
}

describe('calculateTierProgress', () => {
  const tiers = defaultTiers();
  const bronze = tiers[0]!;
  const silver = tiers[1]!;
  const gold = tiers[2]!;

  it('calculates progress for bronze with 250 points', () => {
    const result = calculateTierProgress(bronze, tiers, 250);
    expect(result.current.tierName).toBe('Bronze');
    expect(result.next?.tierName).toBe('Silver');
    expect(result.pointsToNext).toBe(250);
    expect(result.percentComplete).toBe(50);
  });

  it('calculates 100% when at top tier', () => {
    const result = calculateTierProgress(gold, tiers, 5000);
    expect(result.current.tierName).toBe('Gold');
    expect(result.next).toBeNull();
    expect(result.pointsToNext).toBe(0);
    expect(result.percentComplete).toBe(100);
  });

  it('clamps progress to 0% when balance is at tier threshold', () => {
    const result = calculateTierProgress(silver, tiers, 500);
    expect(result.percentComplete).toBe(0);
    expect(result.pointsToNext).toBe(1500);
  });

  it('clamps progress to 100% when balance exceeds next tier', () => {
    const result = calculateTierProgress(bronze, tiers, 600);
    expect(result.percentComplete).toBe(100);
  });

  it('handles zero balance at bronze', () => {
    const result = calculateTierProgress(bronze, tiers, 0);
    expect(result.pointsToNext).toBe(500);
    expect(result.percentComplete).toBe(0);
  });
});

describe('MobileService.getDashboard', () => {
  it('returns aggregated dashboard on cache miss', async () => {
    const { service, data } = createService();
    data.seedMember(TENANT, makeMember());
    data.seedBalance(TENANT, MEMBER_ID, 750);
    data.seedTiers(TENANT, defaultTiers());
    data.seedTransactions(TENANT, MEMBER_ID, [
      { id: 'tx-1', memberId: MEMBER_ID, channel: 'pos', amountCents: 5000, currency: 'USD', pointsEarned: 50, createdAt: '2026-04-01T00:00:00Z' },
    ]);
    data.seedOffers(TENANT, MEMBER_ID, [
      { id: 'off-1', code: 'SAVE10', name: '10% Off', type: 'percent', value: 10, startsAt: '2026-04-01T00:00:00Z', endsAt: '2026-05-01T00:00:00Z', conditionsJson: { imageUrl: 'https://cdn.example.com/save10.png' } },
    ]);
    data.seedNotifications(TENANT, MEMBER_ID, [
      { id: 'notif-1', templateKey: 'welcome', channel: 'email', status: 'sent', createdAt: '2026-04-01T00:00:00Z' },
      { id: 'notif-2', templateKey: 'tier_upgraded', channel: 'email', status: 'read', createdAt: '2026-04-02T00:00:00Z' },
    ]);

    const dashboard = await service.getDashboard(TENANT, MEMBER_ID);

    expect(dashboard.member.id).toBe(MEMBER_ID);
    expect(dashboard.member.firstName).toBe('Jane');
    expect(dashboard.balance).toBe(750);
    expect(dashboard.tier.name).toBe('Silver');
    expect(dashboard.tierProgress.current.tierName).toBe('Silver');
    expect(dashboard.tierProgress.next?.tierName).toBe('Gold');
    expect(dashboard.tierProgress.pointsToNext).toBe(1250);
    expect(dashboard.recentTransactions).toHaveLength(1);
    expect(dashboard.eligibleOffers).toHaveLength(1);
    expect(dashboard.eligibleOffers[0]!.imageUrl).toBe('https://cdn.example.com/save10.png');
    expect(dashboard.unreadNotifications).toBe(1); // only 'sent' status counts
  });

  it('returns cached dashboard on cache hit', async () => {
    const { service, data, dashboardCache } = createService();
    data.seedMember(TENANT, makeMember());
    data.seedBalance(TENANT, MEMBER_ID, 750);
    data.seedTiers(TENANT, defaultTiers());

    // Warm the cache
    const first = await service.getDashboard(TENANT, MEMBER_ID);
    expect(first.balance).toBe(750);

    // Change balance — should still get cached result
    data.seedBalance(TENANT, MEMBER_ID, 9999);
    const second = await service.getDashboard(TENANT, MEMBER_ID);
    expect(second.balance).toBe(750); // cached
  });

  it('throws NotFoundError for unknown member', async () => {
    const { service } = createService();
    await expect(service.getDashboard(TENANT, MEMBER_ID)).rejects.toThrow('Member not found');
  });
});

describe('MobileService.getTransactions', () => {
  it('returns paginated transactions', async () => {
    const { service, data } = createService();
    data.seedMember(TENANT, makeMember());
    const txns = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-${i}`,
      memberId: MEMBER_ID,
      channel: 'pos' as const,
      amountCents: 1000 * (i + 1),
      currency: 'USD',
      pointsEarned: 10 * (i + 1),
      createdAt: `2026-04-0${Math.min(i + 1, 9)}T00:00:00Z`,
    }));
    data.seedTransactions(TENANT, MEMBER_ID, txns);

    const page = await service.getTransactions(TENANT, MEMBER_ID, 5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeDefined();
  });
});

describe('MobileService.getTierProgress', () => {
  it('returns detailed tier progress', async () => {
    const { service, data } = createService();
    data.seedMember(TENANT, makeMember({ tierId: 'tier-bronze' }));
    data.seedBalance(TENANT, MEMBER_ID, 300);
    data.seedTiers(TENANT, defaultTiers());

    const progress = await service.getTierProgress(TENANT, MEMBER_ID);
    expect(progress.current.tierName).toBe('Bronze');
    expect(progress.next?.tierName).toBe('Silver');
    expect(progress.pointsToNext).toBe(200);
    expect(progress.percentComplete).toBe(60);
    expect(progress.current.benefits.earnMultiplier).toBe(1);
    expect(progress.next?.benefits.freeShipping).toBe(true);
  });
});

describe('MobileService.registerPushDevice', () => {
  beforeEach(() => clearPushRegistrations());

  it('registers a push device', async () => {
    const { service } = createService();
    const result = await service.registerPushDevice({
      memberId: MEMBER_ID,
      deviceToken: 'token-abc123',
      platform: 'ios',
    });
    expect(result.memberId).toBe(MEMBER_ID);
    expect(result.platform).toBe('ios');
    expect(result.registeredAt).toBeDefined();
    expect(getPushRegistrations().get(MEMBER_ID)).toHaveLength(1);
  });

  it('replaces duplicate token for same member', async () => {
    const { service } = createService();
    await service.registerPushDevice({
      memberId: MEMBER_ID,
      deviceToken: 'token-abc123',
      platform: 'ios',
    });
    await service.registerPushDevice({
      memberId: MEMBER_ID,
      deviceToken: 'token-abc123',
      platform: 'android',
    });
    expect(getPushRegistrations().get(MEMBER_ID)).toHaveLength(1);
    expect(getPushRegistrations().get(MEMBER_ID)![0]!.platform).toBe('android');
  });

  it('allows multiple devices per member', async () => {
    const { service } = createService();
    await service.registerPushDevice({
      memberId: MEMBER_ID,
      deviceToken: 'token-1',
      platform: 'ios',
    });
    await service.registerPushDevice({
      memberId: MEMBER_ID,
      deviceToken: 'token-2',
      platform: 'android',
    });
    expect(getPushRegistrations().get(MEMBER_ID)).toHaveLength(2);
  });
});

describe('MobileService.updateNotificationPreferences', () => {
  it('sets preference for a template key', async () => {
    const { service, data } = createService();
    data.seedMember(TENANT, makeMember());

    await service.updateNotificationPreferences(TENANT, {
      memberId: MEMBER_ID,
      templateKey: 'points_earned_digest',
      optedIn: false,
    });

    const prefs = await data.getNotificationPreferences(TENANT, MEMBER_ID);
    expect(prefs['points_earned_digest']).toBe(false);
  });

  it('throws for unknown member', async () => {
    const { service } = createService();
    await expect(
      service.updateNotificationPreferences(TENANT, {
        memberId: MEMBER_ID,
        templateKey: 'points_earned_digest',
        optedIn: true,
      }),
    ).rejects.toThrow('Member not found');
  });
});

describe('MobileService.getNotifications', () => {
  it('returns notification history', async () => {
    const { service, data } = createService();
    data.seedMember(TENANT, makeMember());
    data.seedNotifications(TENANT, MEMBER_ID, [
      { id: 'n-1', templateKey: 'welcome', channel: 'email', status: 'sent', createdAt: '2026-04-01T00:00:00Z' },
      { id: 'n-2', templateKey: 'tier_upgraded', channel: 'push', status: 'sent', createdAt: '2026-04-02T00:00:00Z' },
    ]);

    const result = await service.getNotifications(TENANT, MEMBER_ID, 10);
    expect(result).toHaveLength(2);
    expect(result[0]!.templateKey).toBe('welcome');
  });
});
