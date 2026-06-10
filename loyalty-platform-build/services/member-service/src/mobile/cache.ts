import type { MobileDashboardDTO } from './schemas';

/**
 * Dashboard cache contract.
 * Key: `tenant:{tenantId}:mobile:dashboard:{memberId}`, TTL 60s.
 *
 * In production this uses Redis; tests use InMemoryDashboardCache.
 */
export interface DashboardCache {
  get(tenantId: string, memberId: string): Promise<MobileDashboardDTO | null>;
  set(tenantId: string, memberId: string, data: MobileDashboardDTO): Promise<void>;
  del(tenantId: string, memberId: string): Promise<void>;
}

export function dashboardCacheKey(tenantId: string, memberId: string): string {
  return `tenant:${tenantId}:mobile:dashboard:${memberId}`;
}

export const DASHBOARD_TTL_SECONDS = 60;

export class InMemoryDashboardCache implements DashboardCache {
  private store = new Map<string, { value: MobileDashboardDTO; expiresAt: number }>();

  public async get(tenantId: string, memberId: string): Promise<MobileDashboardDTO | null> {
    const key = dashboardCacheKey(tenantId, memberId);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(tenantId: string, memberId: string, data: MobileDashboardDTO): Promise<void> {
    const key = dashboardCacheKey(tenantId, memberId);
    this.store.set(key, {
      value: data,
      expiresAt: Date.now() + DASHBOARD_TTL_SECONDS * 1000,
    });
  }

  public async del(tenantId: string, memberId: string): Promise<void> {
    this.store.delete(dashboardCacheKey(tenantId, memberId));
  }
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

export class RedisDashboardCache implements DashboardCache {
  constructor(private readonly redis: RedisLike) {}

  public async get(tenantId: string, memberId: string): Promise<MobileDashboardDTO | null> {
    const raw = await this.redis.get(dashboardCacheKey(tenantId, memberId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MobileDashboardDTO;
    } catch {
      return null;
    }
  }

  public async set(tenantId: string, memberId: string, data: MobileDashboardDTO): Promise<void> {
    await this.redis.set(
      dashboardCacheKey(tenantId, memberId),
      JSON.stringify(data),
      'EX',
      DASHBOARD_TTL_SECONDS,
    );
  }

  public async del(tenantId: string, memberId: string): Promise<void> {
    await this.redis.del(dashboardCacheKey(tenantId, memberId));
  }
}
