/**
 * Balance cache contract. Production uses ioredis; tests use in-memory.
 * Key: `tenant:{tenantId}:member:{memberId}:balance`, TTL 300s.
 * Invalidation is the responsibility of T-05 loyalty-engine when it writes
 * ledger entries — it will DEL the same key.
 */
export interface BalanceCache {
  get(tenantId: string, memberId: string): Promise<number | null>;
  set(tenantId: string, memberId: string, balance: number): Promise<void>;
  del(tenantId: string, memberId: string): Promise<void>;
}

export function balanceKey(tenantId: string, memberId: string): string {
  return `tenant:${tenantId}:member:${memberId}:balance`;
}

export const BALANCE_TTL_SECONDS = 300;

export class InMemoryBalanceCache implements BalanceCache {
  private store = new Map<string, { value: number; expiresAt: number }>();
  public async get(tenantId: string, memberId: string): Promise<number | null> {
    const e = this.store.get(balanceKey(tenantId, memberId));
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.store.delete(balanceKey(tenantId, memberId));
      return null;
    }
    return e.value;
  }
  public async set(tenantId: string, memberId: string, balance: number): Promise<void> {
    this.store.set(balanceKey(tenantId, memberId), {
      value: balance,
      expiresAt: Date.now() + BALANCE_TTL_SECONDS * 1000,
    });
  }
  public async del(tenantId: string, memberId: string): Promise<void> {
    this.store.delete(balanceKey(tenantId, memberId));
  }
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

export class RedisBalanceCache implements BalanceCache {
  constructor(private readonly redis: RedisLike) {}
  public async get(tenantId: string, memberId: string): Promise<number | null> {
    const v = await this.redis.get(balanceKey(tenantId, memberId));
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  public async set(tenantId: string, memberId: string, balance: number): Promise<void> {
    await this.redis.set(
      balanceKey(tenantId, memberId),
      String(balance),
      'EX',
      BALANCE_TTL_SECONDS,
    );
  }
  public async del(tenantId: string, memberId: string): Promise<void> {
    await this.redis.del(balanceKey(tenantId, memberId));
  }
}
