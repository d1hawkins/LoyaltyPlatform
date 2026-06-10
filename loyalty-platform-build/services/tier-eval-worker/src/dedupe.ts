/**
 * Redis-backed dedupe set for Service Bus messageIds.
 *
 * Uses SET key NX EX ttl — atomic insert-if-absent with expiry. Returns true
 * if the message is new and should be processed, false if it's a duplicate
 * that should be skipped.
 */
export interface DedupeStore {
  /** Returns true if this is the first time we've seen the id, false otherwise. */
  claim(key: string): Promise<boolean>;
}

export interface RedisLike {
  set(
    key: string,
    value: string,
    mode: 'EX',
    seconds: number,
    nx: 'NX',
  ): Promise<string | null>;
}

export class RedisDedupeStore implements DedupeStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly ttlSeconds: number,
    private readonly prefix = 'tier-eval:dedupe:',
  ) {}

  public async claim(key: string): Promise<boolean> {
    const result = await this.redis.set(
      this.prefix + key,
      '1',
      'EX',
      this.ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}

/**
 * In-memory dedupe store for tests. Not safe across processes.
 */
export class InMemoryDedupeStore implements DedupeStore {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = 24 * 60 * 60 * 1000) {}

  public async claim(key: string): Promise<boolean> {
    const now = Date.now();
    const expiry = this.seen.get(key);
    if (expiry && expiry > now) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  public reset(): void {
    this.seen.clear();
  }
}
