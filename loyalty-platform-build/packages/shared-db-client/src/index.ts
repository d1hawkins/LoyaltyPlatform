import * as sql from 'mssql';
import { LRUCache } from 'lru-cache';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import type Redis from 'ioredis';
import type { Logger } from '@loyalty/shared-logger';
import { TenantNotFoundError, TenantError } from '@loyalty/shared-errors';

export interface TenantDbClientOptions {
  keyVaultUri: string;
  redisClient: Redis;
  controlPlaneConnectionString: string;
  logger: Logger;
  maxPools?: number;
}

export interface TenantRecord {
  tenantId: string;
  slug: string;
  status: string;
  dbSecretName: string;
}

export class TenantDbClient {
  private controlPool: sql.ConnectionPool | null = null;
  private tenantPools: LRUCache<string, sql.ConnectionPool>;
  private secretClient: SecretClient;
  private logger: Logger;
  private opts: TenantDbClientOptions;

  constructor(opts: TenantDbClientOptions) {
    this.opts = opts;
    this.logger = opts.logger;
    this.secretClient = new SecretClient(opts.keyVaultUri, new DefaultAzureCredential());
    this.tenantPools = new LRUCache<string, sql.ConnectionPool>({
      max: opts.maxPools ?? 10,
      dispose: async (pool) => {
        try {
          await pool.close();
        } catch (err) {
          this.logger.warn({ err }, 'tenant-pool.dispose.failed');
        }
      },
    });
  }

  public async getControlPlanePool(): Promise<sql.ConnectionPool> {
    if (this.controlPool && this.controlPool.connected) {
      return this.controlPool;
    }
    this.controlPool = await new sql.ConnectionPool(
      this.opts.controlPlaneConnectionString,
    ).connect();
    this.logger.info('control-plane.pool.connected');
    return this.controlPool;
  }

  public async getTenantPool(tenantId: string): Promise<sql.ConnectionPool> {
    const cached = this.tenantPools.get(tenantId);
    if (cached && cached.connected) {
      return cached;
    }

    const tenant = await this.lookupTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    const secretName = `tenant-${tenantId}-sql-connstr`;
    let connStr: string;
    try {
      const secret = await this.secretClient.getSecret(secretName);
      if (!secret.value) {
        throw new TenantError(`Empty secret: ${secretName}`);
      }
      connStr = secret.value;
    } catch (err) {
      this.logger.error({ err, tenantId, secretName }, 'tenant.secret.fetch.failed');
      throw new TenantError(`Failed to fetch tenant secret for ${tenantId}`, {
        cause: (err as Error).message,
      });
    }

    const pool = await new sql.ConnectionPool(connStr).connect();
    this.tenantPools.set(tenantId, pool);
    this.logger.info({ tenantId }, 'tenant.pool.connected');
    return pool;
  }

  private async lookupTenant(tenantId: string): Promise<TenantRecord | null> {
    const pool = await this.getControlPlanePool();
    const result = await pool
      .request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query<TenantRecord>(
        `SELECT tenant_id AS tenantId, slug, status, db_secret_name AS dbSecretName
         FROM tenants WHERE tenant_id = @tenantId`,
      );
    return result.recordset[0] ?? null;
  }

  public async close(): Promise<void> {
    for (const [id, pool] of this.tenantPools.entries()) {
      try {
        await pool.close();
      } catch (err) {
        this.logger.warn({ err, tenantId: id }, 'tenant.pool.close.failed');
      }
    }
    this.tenantPools.clear();
    if (this.controlPool) {
      await this.controlPool.close();
      this.controlPool = null;
    }
  }
}
