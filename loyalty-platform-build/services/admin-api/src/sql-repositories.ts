/**
 * SQL-backed repository implementations for admin-api.
 *
 * Uses mssql with parameterized queries against tenant DB tables:
 *   - audit_log (V10)
 *   - tiers (V4)
 *   - program_config (V6)
 *   - webhook_configs (V5)
 *
 * API keys and feature flags use the control-plane DB.
 */

import * as sql from 'mssql';
import type { AuditRecord, AuditRepository } from './audit';
import type {
  MemberSummary,
  MemberClient,
  TransactionRecord,
  TransactionRepository,
  ProgramConfigRepository,
  ProgramConfig,
  TierRepository,
  TierRecord,
  WebhookRepository,
  WebhookRecord,
  ApiKeyRepository,
  ApiKeyRecord,
  FeatureFlagRepository,
  FeatureFlagRecord,
} from './repositories';

import * as crypto from 'crypto';

function decryptField(encrypted: string | null): string | undefined {
  if (!encrypted) return undefined;
  const keyHex = process.env.MEMBER_PII_KEY_HEX;
  if (!keyHex) return '(encrypted)';
  try {
    // Format: base64(version(1) | iv(12) | authTag(16) | ciphertext(...))
    const buf = Buffer.from(encrypted, 'base64');
    if (buf.length < 29) return '(encrypted)'; // 1 + 12 + 16 min
    const iv = buf.subarray(1, 13);
    const authTag = buf.subarray(13, 29);
    const ciphertext = buf.subarray(29);
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch (err) {
    console.error('decryptField error:', (err as Error).message, 'bufLen:', Buffer.from(encrypted, 'base64').length, 'keyLen:', keyHex.length);
    return '(encrypted)';
  }
}

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') return d;
  return d.toISOString();
}

function parseSkuList(json: string | null): Array<{sku: string; name?: string; quantity?: number; unitPrice?: number; amount?: number}> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// ── Audit Repository ─────────────────────────────────────────────────────

export class SqlAuditRepository implements AuditRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async insert(record: AuditRecord): Promise<AuditRecord & { auditId: number }> {
    const r = this.pool.request();
    r.input('actorUserId', sql.NVarChar(200), record.actorUserId)
      .input('actorRole', sql.NVarChar(50), record.actorRole)
      .input('action', sql.NVarChar(100), record.action)
      .input('entity', sql.NVarChar(100), record.entity)
      .input('entityId', sql.NVarChar(200), record.entityId ?? null)
      .input('beforeJson', sql.NVarChar(sql.MAX), record.beforeJson ? JSON.stringify(record.beforeJson) : null)
      .input('afterJson', sql.NVarChar(sql.MAX), record.afterJson ? JSON.stringify(record.afterJson) : null)
      .input('reason', sql.NVarChar(1000), record.reason ?? null)
      .input('ipAddress', sql.NVarChar(50), record.ipAddress ?? null)
      .input('userAgent', sql.NVarChar(500), record.userAgent ?? null)
      .input('correlationId', sql.NVarChar(100), record.correlationId ?? null);

    const result = await r.query<{ audit_id: number }>(
      `INSERT INTO audit_log
         (actor_user_id, actor_role, action, entity, entity_id,
          before_json, after_json, reason, ip_address, user_agent, correlation_id, created_at)
       OUTPUT INSERTED.audit_id
       VALUES
         (@actorUserId, @actorRole, @action, @entity, @entityId,
          @beforeJson, @afterJson, @reason, @ipAddress, @userAgent, @correlationId, SYSUTCDATETIME())`,
    );

    const auditId = result.recordset[0]?.audit_id ?? 0;
    return { ...record, auditId };
  }

  async list(
    tenantId: string,
    filter: {
      entity?: string;
      entityId?: string;
      actor?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: Array<AuditRecord & { auditId: number }>; nextCursor?: string }> {
    const r = this.pool.request();

    const conditions: string[] = [];

    if (filter.entity) {
      r.input('entity', sql.NVarChar(100), filter.entity);
      conditions.push('entity = @entity');
    }
    if (filter.entityId) {
      r.input('entityId', sql.NVarChar(200), filter.entityId);
      conditions.push('entity_id = @entityId');
    }
    if (filter.actor) {
      r.input('actor', sql.NVarChar(200), filter.actor);
      conditions.push('actor_user_id = @actor');
    }
    if (filter.action) {
      r.input('action', sql.NVarChar(100), filter.action);
      conditions.push('action = @action');
    }
    if (filter.from) {
      r.input('fromDate', sql.DateTime2, new Date(filter.from));
      conditions.push('created_at >= @fromDate');
    }
    if (filter.to) {
      r.input('toDate', sql.DateTime2, new Date(filter.to));
      conditions.push('created_at <= @toDate');
    }

    const limit = Math.min(filter.limit ?? 50, 500);
    r.input('limit', sql.Int, limit + 1); // fetch one extra for cursor

    if (filter.cursor) {
      const cursorId = parseInt(filter.cursor, 10);
      if (Number.isFinite(cursorId)) {
        r.input('cursorId', sql.BigInt, cursorId);
        conditions.push('audit_id < @cursorId');
      }
    }

    const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const result = await r.query<{
      audit_id: number;
      actor_user_id: string;
      actor_role: string;
      action: string;
      entity: string;
      entity_id: string | null;
      before_json: string | null;
      after_json: string | null;
      reason: string | null;
      ip_address: string | null;
      user_agent: string | null;
      correlation_id: string | null;
      created_at: Date;
    }>(
      `SELECT TOP (@limit) audit_id, actor_user_id, actor_role, action, entity, entity_id,
              before_json, after_json, reason, ip_address, user_agent, correlation_id, created_at
       FROM audit_log WHERE ${where} ORDER BY audit_id DESC`,
    );

    const rows = result.recordset.map((raw) => ({
      auditId: raw.audit_id,
      tenantId: tenantId,
      actorUserId: raw.actor_user_id,
      actorRole: raw.actor_role,
      action: raw.action,
      entity: raw.entity,
      entityId: raw.entity_id ?? null,
      beforeJson: raw.before_json ? JSON.parse(raw.before_json) : null,
      afterJson: raw.after_json ? JSON.parse(raw.after_json) : null,
      reason: raw.reason ?? null,
      ipAddress: raw.ip_address ?? null,
      userAgent: raw.user_agent ?? null,
      correlationId: raw.correlation_id ?? null,
      createdAt: toISOString(raw.created_at),
    }));

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? String(items[items.length - 1]!.auditId)
      : undefined;

    return { items, nextCursor };
  }
}

// ── Program Config Repository ────────────────────────────────────────────

export class SqlProgramConfigRepo implements ProgramConfigRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async get(tenantId: string): Promise<ProgramConfig | null> {
    const r = this.pool.request();
    const result = await r
      .query<{
        config_json: string | null;
        updated_at: Date;
        earn_mode: string | null;
        points_per_visit: number | null;
        visit_min_spend_cents: number | null;
        max_visits_per_day: number | null;
      }>(
        `SELECT config_json, updated_at, earn_mode, points_per_visit, visit_min_spend_cents, max_visits_per_day
         FROM program_config WHERE id = 1`,
      );
    const row = result.recordset[0];
    if (!row) return null;
    const parsed = row.config_json ? JSON.parse(row.config_json) : {};
    // Merge earn mode columns into configJson so the admin portal can read them
    const configJson: Record<string, unknown> = {
      ...parsed,
      earnMode: row.earn_mode ?? parsed.earnMode ?? 'per-dollar',
      pointsPerVisit: row.points_per_visit ?? parsed.pointsPerVisit ?? 10,
      visitMinSpendCents: row.visit_min_spend_cents ?? parsed.visitMinSpendCents ?? 500,
      maxVisitsPerDay: row.max_visits_per_day ?? parsed.maxVisitsPerDay ?? null,
    };
    return {
      tenantId,
      configJson,
      updatedAt: toISOString(row.updated_at),
    };
  }

  async update(tenantId: string, configJson: Record<string, unknown>): Promise<ProgramConfig> {
    const r = this.pool.request();
    r.input('configJson', sql.NVarChar(sql.MAX), JSON.stringify(configJson));

    // Also sync the earn mode columns from configJson
    const earnMode = configJson.earnMode as string | undefined;
    const pointsPerVisit = configJson.pointsPerVisit as number | undefined;
    const visitMinSpendCents = configJson.visitMinSpendCents as number | undefined;
    const maxVisitsPerDay = configJson.maxVisitsPerDay as number | null | undefined;

    r.input('earnMode', sql.NVarChar(20), earnMode ?? 'per-dollar');
    r.input('pointsPerVisit', sql.Int, pointsPerVisit ?? null);
    r.input('visitMinSpendCents', sql.Int, visitMinSpendCents ?? null);
    r.input('maxVisitsPerDay', sql.Int, maxVisitsPerDay ?? null);

    // Also sync base_earn_rate from configJson if present
    const baseEarnRate = configJson.baseEarnRate as number | undefined;
    r.input('baseEarnRate', sql.Decimal(10, 4), baseEarnRate ?? null);

    await r.query(
      `MERGE program_config AS target
       USING (SELECT 1 AS id) AS source ON target.id = source.id
       WHEN MATCHED THEN UPDATE SET config_json = @configJson, updated_at = SYSUTCDATETIME(),
         earn_mode = @earnMode, points_per_visit = @pointsPerVisit,
         visit_min_spend_cents = @visitMinSpendCents, max_visits_per_day = @maxVisitsPerDay,
         base_earn_rate = COALESCE(@baseEarnRate, base_earn_rate)
       WHEN NOT MATCHED THEN INSERT (id, program_name, config_json, updated_at, earn_mode, points_per_visit, visit_min_spend_cents, max_visits_per_day)
         VALUES (1, 'default', @configJson, SYSUTCDATETIME(), @earnMode, @pointsPerVisit, @visitMinSpendCents, @maxVisitsPerDay);`,
    );

    return { tenantId, configJson, updatedAt: new Date().toISOString() };
  }
}

// ── Tier Repository ──────────────────────────────────────────────────────

export class SqlTierRepo implements TierRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async list(tenantId: string): Promise<TierRecord[]> {
    const r = this.pool.request();
    const result = await r
      .query<RawTierRow>(
        `SELECT tier_id, name, sort_order, min_points AS threshold_points, benefits_json, is_active, updated_at
         FROM tiers ORDER BY sort_order ASC`,
      );
    return result.recordset.map((raw) => toTierRecord(raw, tenantId));
  }

  async get(tenantId: string, id: string): Promise<TierRecord | null> {
    const r = this.pool.request();
    const result = await r
      .input('id', sql.UniqueIdentifier, id)
      .query<RawTierRow>(
        `SELECT tier_id, name, sort_order, min_points AS threshold_points, benefits_json, is_active, updated_at
         FROM tiers WHERE tier_id = @id`,
      );
    return result.recordset[0] ? toTierRecord(result.recordset[0], tenantId) : null;
  }

  async create(row: Omit<TierRecord, 'updatedAt'>): Promise<TierRecord> {
    const r = this.pool.request();
    r.input('id', sql.UniqueIdentifier, row.id)
      .input('name', sql.NVarChar(200), row.name)
      .input('sortOrder', sql.Int, row.rank)
      .input('minPoints', sql.Int, row.thresholdPoints)
      .input('benefitsJson', sql.NVarChar(sql.MAX), JSON.stringify(row.benefits))
      .input('isActive', sql.Bit, row.isActive ? 1 : 0);

    await r.query(
      `INSERT INTO tiers (tier_id, name, sort_order, min_points, benefits_json, is_active, created_at, updated_at)
       VALUES (@id, @name, @sortOrder, @minPoints, @benefitsJson, @isActive, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    );

    return { ...row, updatedAt: new Date().toISOString() };
  }

  async update(tenantId: string, id: string, patch: Partial<TierRecord>): Promise<TierRecord | null> {
    const fields: string[] = [];
    const r = this.pool.request();
    r.input('id', sql.UniqueIdentifier, id);

    if (patch.name !== undefined) { fields.push('name = @name'); r.input('name', sql.NVarChar(200), patch.name); }
    if (patch.rank !== undefined) { fields.push('sort_order = @sortOrder'); r.input('sortOrder', sql.Int, patch.rank); }
    if (patch.thresholdPoints !== undefined) { fields.push('min_points = @tp'); r.input('tp', sql.Int, patch.thresholdPoints); }
    if (patch.benefits !== undefined) { fields.push('benefits_json = @bj'); r.input('bj', sql.NVarChar(sql.MAX), JSON.stringify(patch.benefits)); }
    if (patch.isActive !== undefined) { fields.push('is_active = @ia'); r.input('ia', sql.Bit, patch.isActive ? 1 : 0); }

    if (fields.length === 0) return this.get(tenantId, id);
    fields.push('updated_at = SYSUTCDATETIME()');

    await r.query(`UPDATE tiers SET ${fields.join(', ')} WHERE tier_id = @id`);
    return this.get(tenantId, id);
  }

  async deactivate(tenantId: string, id: string): Promise<TierRecord | null> {
    return this.update(tenantId, id, { isActive: false });
  }
}

interface RawTierRow {
  tier_id: string;
  name: string;
  sort_order: number;
  threshold_points: number;
  benefits_json: string | null;
  is_active: boolean | number;
  updated_at: Date;
}

function toTierRecord(raw: RawTierRow, tenantId: string = ''): TierRecord {
  return {
    id: raw.tier_id,
    tenantId,
    name: raw.name,
    rank: raw.sort_order,
    thresholdPoints: raw.threshold_points,
    benefits: raw.benefits_json ? JSON.parse(raw.benefits_json) : {},
    isActive: raw.is_active === true || raw.is_active === 1,
    updatedAt: toISOString(raw.updated_at),
  };
}

// ── Webhook Repository ───────────────────────────────────────────────────

export class SqlWebhookRepo implements WebhookRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async list(tenantId: string): Promise<WebhookRecord[]> {
    const r = this.pool.request();
    const result = await r
      .query<RawWebhookRow>(
        `SELECT hook_id AS id, event_type, target_url, is_active, 0 AS retry_count, created_at
         FROM webhook_configs`,
      );
    return result.recordset.map((raw) => toWebhookRecord(raw, tenantId));
  }

  async get(tenantId: string, id: string): Promise<WebhookRecord | null> {
    const r = this.pool.request();
    const result = await r
      .input('id', sql.UniqueIdentifier, id)
      .query<RawWebhookRow>(
        `SELECT hook_id AS id, event_type, target_url, is_active, 0 AS retry_count, created_at
         FROM webhook_configs WHERE hook_id = @id`,
      );
    return result.recordset[0] ? toWebhookRecord(result.recordset[0], tenantId) : null;
  }

  async create(row: WebhookRecord): Promise<WebhookRecord> {
    const r = this.pool.request();
    r.input('id', sql.UniqueIdentifier, row.id)
      .input('eventType', sql.NVarChar(100), row.eventType)
      .input('targetUrl', sql.NVarChar(1000), row.targetUrl)
      .input('isActive', sql.Bit, row.isActive ? 1 : 0);

    await r.query(
      `INSERT INTO webhook_configs (hook_id, event_type, target_url, secret_encrypted, is_active, created_at)
       VALUES (@id, @eventType, @targetUrl, '', @isActive, SYSUTCDATETIME())`,
    );

    return row;
  }

  async update(tenantId: string, id: string, patch: Partial<WebhookRecord>): Promise<WebhookRecord | null> {
    const fields: string[] = [];
    const r = this.pool.request();
    r.input('id', sql.UniqueIdentifier, id);

    if (patch.eventType !== undefined) { fields.push('event_type = @et'); r.input('et', sql.NVarChar(100), patch.eventType); }
    if (patch.targetUrl !== undefined) { fields.push('target_url = @tu'); r.input('tu', sql.NVarChar(1000), patch.targetUrl); }
    if (patch.isActive !== undefined) { fields.push('is_active = @ia'); r.input('ia', sql.Bit, patch.isActive ? 1 : 0); }

    if (fields.length === 0) return this.get(tenantId, id);

    await r.query(`UPDATE webhook_configs SET ${fields.join(', ')} WHERE hook_id = @id`);
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const r = this.pool.request();
    const result = await r
      .input('id', sql.UniqueIdentifier, id)
      .query(`DELETE FROM webhook_configs WHERE hook_id = @id`);
    return (result.rowsAffected[0] ?? 0) > 0;
  }
}

interface RawWebhookRow {
  id: string;
  event_type: string;
  target_url: string;
  is_active: boolean | number;
  retry_count: number;
  created_at: Date;
}

function toWebhookRecord(raw: RawWebhookRow, tenantId: string = ''): WebhookRecord {
  return {
    id: raw.id,
    tenantId,
    eventType: raw.event_type,
    targetUrl: raw.target_url,
    isActive: raw.is_active === true || raw.is_active === 1,
    retryCount: raw.retry_count,
    createdAt: toISOString(raw.created_at),
  };
}

// ── API Key Repository (control-plane DB) ────────────────────────────────

export class SqlApiKeyRepo implements ApiKeyRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async list(tenantId: string): Promise<ApiKeyRecord[]> {
    const r = this.pool.request();
    const result = await r
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query<RawApiKeyRow>(
        `SELECT key_id, tenant_id, label, scope, created_at, revoked_at
         FROM tenant_api_keys WHERE tenant_id = @tenantId ORDER BY created_at DESC`,
      );
    return result.recordset.map(toApiKeyRecord);
  }

  async create(row: {
    tenantId: string;
    label: string;
    scope: 'read' | 'read-write';
    keyHash: string;
  }): Promise<ApiKeyRecord> {
    const r = this.pool.request();
    r.input('tenantId', sql.UniqueIdentifier, row.tenantId)
      .input('label', sql.NVarChar(200), row.label)
      .input('scope', sql.NVarChar(20), row.scope)
      .input('keyHash', sql.NVarChar(500), row.keyHash);

    const result = await r.query<{ key_id: string; created_at: Date }>(
      `INSERT INTO tenant_api_keys (tenant_id, label, scope, key_hash, created_at)
       OUTPUT INSERTED.key_id, INSERTED.created_at
       VALUES (@tenantId, @label, @scope, @keyHash, SYSUTCDATETIME())`,
    );

    const inserted = result.recordset[0];
    return {
      keyId: inserted?.key_id ?? '',
      tenantId: row.tenantId,
      label: row.label,
      scope: row.scope,
      createdAt: toISOString(inserted?.created_at),
      revokedAt: null,
    };
  }

  async revoke(tenantId: string, keyId: string): Promise<ApiKeyRecord | null> {
    const r = this.pool.request();
    const result = await r
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('keyId', sql.UniqueIdentifier, keyId)
      .query<RawApiKeyRow>(
        `UPDATE tenant_api_keys SET revoked_at = SYSUTCDATETIME()
         OUTPUT INSERTED.key_id, INSERTED.tenant_id, INSERTED.label, INSERTED.scope, INSERTED.created_at, INSERTED.revoked_at
         WHERE tenant_id = @tenantId AND key_id = @keyId`,
      );
    return result.recordset[0] ? toApiKeyRecord(result.recordset[0]) : null;
  }
}

interface RawApiKeyRow {
  key_id: string;
  tenant_id: string;
  label: string;
  scope: 'read' | 'read-write';
  created_at: Date;
  revoked_at: Date | null;
}

function toApiKeyRecord(raw: RawApiKeyRow): ApiKeyRecord {
  return {
    keyId: raw.key_id,
    tenantId: raw.tenant_id,
    label: raw.label,
    scope: raw.scope,
    createdAt: toISOString(raw.created_at),
    revokedAt: raw.revoked_at ? toISOString(raw.revoked_at) : null,
  };
}

// ── Feature Flag Repository ──────────────────────────────────────────────

export class SqlFeatureFlagRepo implements FeatureFlagRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async list(tenantId: string): Promise<FeatureFlagRecord[]> {
    const r = this.pool.request();
    const result = await r
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query<RawFeatureFlagRow>(
        `SELECT flag_key, tenant_id, enabled, value_json, updated_at
         FROM feature_flags WHERE tenant_id = @tenantId`,
      );
    return result.recordset.map(toFeatureFlagRecord);
  }

  async get(tenantId: string, flagKey: string): Promise<FeatureFlagRecord | null> {
    const r = this.pool.request();
    const result = await r
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('flagKey', sql.NVarChar(200), flagKey)
      .query<RawFeatureFlagRow>(
        `SELECT flag_key, tenant_id, enabled, value_json, updated_at
         FROM feature_flags WHERE tenant_id = @tenantId AND flag_key = @flagKey`,
      );
    return result.recordset[0] ? toFeatureFlagRecord(result.recordset[0]) : null;
  }

  async upsert(row: FeatureFlagRecord): Promise<FeatureFlagRecord> {
    const r = this.pool.request();
    r.input('tenantId', sql.UniqueIdentifier, row.tenantId)
      .input('flagKey', sql.NVarChar(200), row.flagKey)
      .input('enabled', sql.Bit, row.enabled ? 1 : 0)
      .input('valueJson', sql.NVarChar(sql.MAX), row.valueJson ? JSON.stringify(row.valueJson) : null);

    await r.query(
      `MERGE feature_flags AS target
       USING (SELECT @tenantId AS tenant_id, @flagKey AS flag_key) AS source
         ON target.tenant_id = source.tenant_id AND target.flag_key = source.flag_key
       WHEN MATCHED THEN UPDATE SET enabled = @enabled, value_json = @valueJson, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (tenant_id, flag_key, enabled, value_json, updated_at)
         VALUES (@tenantId, @flagKey, @enabled, @valueJson, SYSUTCDATETIME());`,
    );

    return { ...row, updatedAt: new Date().toISOString() };
  }
}

interface RawFeatureFlagRow {
  flag_key: string;
  tenant_id: string;
  enabled: boolean | number;
  value_json: string | null;
  updated_at: Date;
}

function toFeatureFlagRecord(raw: RawFeatureFlagRow): FeatureFlagRecord {
  return {
    flagKey: raw.flag_key,
    tenantId: raw.tenant_id,
    enabled: raw.enabled === true || raw.enabled === 1,
    valueJson: raw.value_json ? JSON.parse(raw.value_json) : null,
    updatedAt: toISOString(raw.updated_at),
  };
}

// ── Transactions ──────────────────────────────────────────────────────────

export class SqlTransactionRepository implements TransactionRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async list(
    _tenantId: string,
    filter: { memberId?: string; limit?: number; cursor?: string },
  ): Promise<{ items: TransactionRecord[]; nextCursor?: string }> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const req = this.pool.request();
    let where = 'WHERE 1=1';
    if (filter.memberId) {
      req.input('mid', sql.UniqueIdentifier, filter.memberId);
      where += ' AND t.member_id = @mid';
    }
    if (filter.cursor) {
      req.input('cursor', sql.UniqueIdentifier, filter.cursor);
      where += ' AND t.txn_id < @cursor';
    }
    req.input('lim', sql.Int, limit + 1);
    const result = await req.query<{
      txn_id: string; member_id: string; channel: string;
      amount: number; currency: string; status: string;
      occurred_at: Date; recorded_at: Date;
      points_earned: number | null;
      store_id: string | null; store_name: string | null;
      register_id: string | null;
      associate_id: string | null; associate_name: string | null;
      source_channel: string | null; source_system: string | null;
      order_ref: string | null; sku_list_json: string | null;
    }>(`SELECT TOP(@lim) t.txn_id, t.member_id, t.channel, t.amount, t.currency,
               t.status, t.occurred_at, t.recorded_at,
               t.store_id, t.store_name, t.register_id,
               t.associate_id, t.associate_name,
               t.source_channel, t.source_system, t.order_ref,
               t.sku_list_json,
               (SELECT SUM(l.delta) FROM points_ledger l WHERE l.ref_txn_id = t.txn_id AND l.reason_code = 'earn') AS points_earned
        FROM transactions t ${where}
        ORDER BY t.recorded_at DESC, t.txn_id DESC`);

    const rows = result.recordset;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r): TransactionRecord => ({
      transactionId: r.txn_id,
      memberId: r.member_id,
      channel: r.channel,
      amount: Number(r.amount),
      currency: r.currency || 'USD',
      pointsEarned: r.points_earned ?? 0,
      status: r.status,
      occurredAt: toISOString(r.occurred_at),
      createdAt: toISOString(r.recorded_at),
      storeId: r.store_id ?? null,
      storeName: r.store_name ?? null,
      registerId: r.register_id ?? null,
      associateId: r.associate_id ?? null,
      associateName: r.associate_name ?? null,
      sourceChannel: r.source_channel ?? null,
      sourceSystem: r.source_system ?? null,
      orderRef: r.order_ref ?? null,
      items: parseSkuList(r.sku_list_json),
    }));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.transactionId : undefined,
    };
  }
}

// ── Member Search (SQL-backed, replaces HTTP proxy) ──────────────────────

export class SqlMemberClient implements MemberClient {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async search(
    _tenantId: string,
    filter: { q?: string; tierId?: string; status?: string; limit?: number; cursor?: string },
  ): Promise<{ items: MemberSummary[]; nextCursor?: string }> {
    const limit = Math.min(filter.limit ?? 25, 200);
    const req = this.pool.request();
    let where = 'WHERE m.is_deleted = 0';
    if (filter.q) {
      req.input('q', sql.NVarChar, `%${filter.q}%`);
      where += ' AND (m.first_name LIKE @q OR m.last_name LIKE @q OR CAST(m.member_id AS NVARCHAR(50)) LIKE @q)';
    }
    if (filter.tierId) {
      req.input('tid', sql.UniqueIdentifier, filter.tierId);
      where += ' AND m.tier_id = @tid';
    }
    if (filter.status) {
      req.input('st', sql.NVarChar, filter.status);
      where += ' AND m.status = @st';
    }
    if (filter.cursor) {
      req.input('cursor', sql.UniqueIdentifier, filter.cursor);
      where += ' AND m.member_id < @cursor';
    }
    req.input('lim', sql.Int, limit + 1);
    const result = await req.query<{
      member_id: string; first_name: string; last_name: string;
      status: string; tier_id: string | null; tier_name: string | null;
      email_encrypted: string | null; phone_encrypted: string | null;
      enrolled_at: Date; updated_at: Date; points_balance: number | null;
    }>(`SELECT TOP(@lim) m.member_id, m.first_name, m.last_name, m.status,
               m.tier_id, t.name AS tier_name, m.email_encrypted, m.phone_encrypted,
               m.enrolled_at, m.updated_at,
               (SELECT COALESCE(SUM(pl.delta), 0) FROM points_ledger pl WHERE pl.member_id = m.member_id) AS points_balance
        FROM members m
        LEFT JOIN tiers t ON m.tier_id = t.tier_id
        ${where}
        ORDER BY m.enrolled_at DESC, m.member_id DESC`);

    const rows = result.recordset;
    const hasMore = rows.length > limit;
    const items: MemberSummary[] = rows.slice(0, limit).map((r) => ({
      id: r.member_id,
      tenantId: _tenantId,
      firstName: r.first_name,
      lastName: r.last_name,
      email: decryptField(r.email_encrypted),
      phone: decryptField(r.phone_encrypted),
      phoneHash: '',
      tierId: r.tier_id || '',
      tierName: r.tier_name || undefined,
      status: r.status as 'active' | 'suspended' | 'closed',
      pointsBalance: r.points_balance ?? 0,
      enrolledAt: toISOString(r.enrolled_at),
    }));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }

  async getById(_tenantId: string, memberId: string): Promise<MemberSummary | null> {
    const result = await this.pool.request()
      .input('mid', sql.UniqueIdentifier, memberId)
      .query<{
        member_id: string; first_name: string; last_name: string;
        status: string; tier_id: string | null; tier_name: string | null;
        email_encrypted: string | null; phone_encrypted: string | null;
        enrolled_at: Date; updated_at: Date; points_balance: number | null;
      }>(`SELECT m.member_id, m.first_name, m.last_name, m.status,
                 m.tier_id, t.name AS tier_name, m.email_encrypted, m.phone_encrypted,
                 m.enrolled_at, m.updated_at,
                 (SELECT COALESCE(SUM(pl.delta), 0) FROM points_ledger pl WHERE pl.member_id = m.member_id) AS points_balance
          FROM members m
          LEFT JOIN tiers t ON m.tier_id = t.tier_id
          WHERE m.member_id = @mid AND m.is_deleted = 0`);
    const r = result.recordset[0];
    if (!r) return null;
    return {
      id: r.member_id,
      tenantId: _tenantId,
      firstName: r.first_name,
      lastName: r.last_name,
      email: decryptField(r.email_encrypted),
      phone: decryptField(r.phone_encrypted),
      phoneHash: '',
      tierId: r.tier_id || '',
      tierName: r.tier_name || undefined,
      status: r.status as 'active' | 'suspended' | 'closed',
      pointsBalance: r.points_balance ?? 0,
      enrolledAt: toISOString(r.enrolled_at),
    };
  }

  async setStatus(_tenantId: string, memberId: string, status: 'active' | 'suspended' | 'closed'): Promise<MemberSummary | null> {
    await this.pool.request()
      .input('mid', sql.UniqueIdentifier, memberId)
      .input('st', sql.NVarChar, status)
      .query(`UPDATE members SET status = @st, updated_at = SYSUTCDATETIME() WHERE member_id = @mid`);
    return this.getById(_tenantId, memberId);
  }

  async gdprDelete(_tenantId: string, memberId: string, _confirm: boolean): Promise<boolean> {
    const result = await this.pool.request()
      .input('mid', sql.UniqueIdentifier, memberId)
      .query(`UPDATE members SET is_deleted = 1, deleted_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE member_id = @mid`);
    return (result.rowsAffected[0] ?? 0) > 0;
  }
}
