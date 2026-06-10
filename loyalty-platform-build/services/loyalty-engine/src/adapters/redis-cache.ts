/**
 * Redis-backed CacheClient using ioredis.
 */
import type Redis from 'ioredis';
import type { CacheClient } from '../deps';

export class RedisCacheClient implements CacheClient {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
