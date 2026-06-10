import * as sql from 'mssql';
import type { MemberStatus } from '@loyalty/shared-types';
import type {
  CreateMemberInput,
  LedgerRow,
  MemberRepository,
  MemberRow,
  TierRow,
} from './repository';

/**
 * mssql-backed implementation of MemberRepository.
 *
 * Expects schema delivered by tenant-migrations V1..V7.
 *
 * Column mapping (interface -> SQL):
 *   MemberRow.id          -> members.member_id
 *   TierRow.id            -> tiers.tier_id
 *   LedgerRow.id          -> points_ledger.ledger_id (BIGINT IDENTITY, stored as string)
 *   LedgerRow.reason      -> points_ledger.reason_code
 *   LedgerRow.transactionId -> points_ledger.ref_txn_id
 *   LedgerRow.note        -> (not in schema, always undefined)
 *
 * The tenant DB IS the isolation boundary, so there is no tenant_id column
 * in the SQL tables — the pool itself connects to the right tenant database.
 *
 * Two constructor modes:
 *   1. Single pool (dev): pass a ConnectionPool directly via static factory.
 *   2. Multi-tenant (prod): pass a PoolFactory that resolves per-tenant.
 */
export type PoolFactory = (tenantId: string) => Promise<sql.ConnectionPool>;

export class SqlMemberRepository implements MemberRepository {
  private readonly getPool: PoolFactory;

  constructor(poolOrFactory: sql.ConnectionPool | PoolFactory) {
    if (typeof poolOrFactory === 'function') {
      this.getPool = poolOrFactory;
    } else {
      // Single pool mode — ignore tenantId, always return the same pool
      const pool = poolOrFactory;
      this.getPool = async () => pool;
    }
  }

  private async req(tenantId: string): Promise<sql.Request> {
    const pool = await this.getPool(tenantId);
    return pool.request();
  }

  // ── Tiers ──────────────────────────────────────────────────────────

  public async getDefaultTier(tenantId: string): Promise<TierRow | null> {
    const r = await this.req(tenantId);
    const result = await r.query<{ id: string; name: string; sortOrder: number }>(
      `SELECT TOP 1 tier_id AS id, name, sort_order AS sortOrder
       FROM tiers WHERE is_active = 1 ORDER BY sort_order ASC`,
    );
    return result.recordset[0] ?? null;
  }

  public async getTier(tenantId: string, tierId: string): Promise<TierRow | null> {
    const r = await this.req(tenantId);
    const result = await r
      .input('tierId', sql.UniqueIdentifier, tierId)
      .query<{ id: string; name: string; sortOrder: number }>(
        `SELECT tier_id AS id, name, sort_order AS sortOrder
         FROM tiers WHERE tier_id = @tierId`,
      );
    return result.recordset[0] ?? null;
  }

  // ── Lookups ────────────────────────────────────────────────────────

  public async findByEmailHash(tenantId: string, emailHash: string): Promise<MemberRow | null> {
    return this.findByHash(tenantId, 'email_hash', emailHash);
  }

  public async findByPhoneHash(tenantId: string, phoneHash: string): Promise<MemberRow | null> {
    return this.findByHash(tenantId, 'phone_hash', phoneHash);
  }

  private async findByHash(
    tenantId: string,
    column: 'email_hash' | 'phone_hash',
    value: string,
  ): Promise<MemberRow | null> {
    const r = await this.req(tenantId);
    const result = await r
      .input('v', sql.NVarChar(128), value)
      .query<RawMemberRow>(
        `SELECT ${SELECT_COLS} FROM members WHERE ${column} = @v AND is_deleted = 0`,
      );
    return result.recordset[0] ? toMemberRow(result.recordset[0], tenantId) : null;
  }

  public async getById(tenantId: string, id: string): Promise<MemberRow | null> {
    const r = await this.req(tenantId);
    const result = await r
      .input('id', sql.UniqueIdentifier, id)
      .query<RawMemberRow>(
        `SELECT ${SELECT_COLS} FROM members WHERE member_id = @id AND is_deleted = 0`,
      );
    return result.recordset[0] ? toMemberRow(result.recordset[0], tenantId) : null;
  }

  // ── Create ─────────────────────────────────────────────────────────

  public async create(input: CreateMemberInput): Promise<MemberRow> {
    const r = await this.req(input.tenantId);
    r.input('id', sql.UniqueIdentifier, input.id)
      .input('tierId', sql.UniqueIdentifier, input.tierId)
      .input('emailHash', sql.NVarChar(128), input.emailHash ?? null)
      .input('phoneHash', sql.NVarChar(128), input.phoneHash)
      .input('emailEncrypted', sql.NVarChar(1000), input.emailEncrypted ?? null)
      .input('phoneEncrypted', sql.NVarChar(1000), input.phoneEncrypted)
      .input('firstName', sql.NVarChar(200), input.firstName)
      .input('lastName', sql.NVarChar(200), input.lastName)
      .input('dateOfBirth', sql.Date, input.dateOfBirth ?? null)
      .input('enrolledChannel', sql.NVarChar(20), input.enrolledChannel);

    const result = await r.query<RawMemberRow>(
      `INSERT INTO members (member_id, status, tier_id, email_hash, phone_hash, email_encrypted,
         phone_encrypted, first_name, last_name, date_of_birth, enrolled_channel, enrolled_at,
         is_deleted, created_at, updated_at)
       OUTPUT ${OUTPUT_COLS}
       VALUES (@id, 'active', @tierId, @emailHash, @phoneHash, @emailEncrypted,
         @phoneEncrypted, @firstName, @lastName, @dateOfBirth, @enrolledChannel, SYSUTCDATETIME(),
         0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    );
    const row = result.recordset[0];
    if (!row) throw new Error('INSERT returned no row');
    return toMemberRow(row, input.tenantId);
  }

  // ── Update ─────────────────────────────────────────────────────────

  public async update(
    tenantId: string,
    id: string,
    patch: Partial<MemberRow>,
  ): Promise<MemberRow | null> {
    const fields: string[] = [];
    const r = await this.req(tenantId);
    r.input('id', sql.UniqueIdentifier, id);

    if (patch.firstName !== undefined) {
      fields.push('first_name = @firstName');
      r.input('firstName', sql.NVarChar(200), patch.firstName);
    }
    if (patch.lastName !== undefined) {
      fields.push('last_name = @lastName');
      r.input('lastName', sql.NVarChar(200), patch.lastName);
    }
    if (patch.emailHash !== undefined) {
      fields.push('email_hash = @emailHash');
      r.input('emailHash', sql.NVarChar(128), patch.emailHash);
    }
    if (patch.emailEncrypted !== undefined) {
      fields.push('email_encrypted = @emailEncrypted');
      r.input('emailEncrypted', sql.NVarChar(1000), patch.emailEncrypted);
    }
    if (patch.phoneHash !== undefined) {
      fields.push('phone_hash = @phoneHash');
      r.input('phoneHash', sql.NVarChar(128), patch.phoneHash);
    }
    if (patch.phoneEncrypted !== undefined) {
      fields.push('phone_encrypted = @phoneEncrypted');
      r.input('phoneEncrypted', sql.NVarChar(1000), patch.phoneEncrypted);
    }
    // communicationPrefs: no column in DB yet, silently ignore

    if (fields.length === 0) return this.getById(tenantId, id);
    fields.push('updated_at = SYSUTCDATETIME()');

    const result = await r.query<RawMemberRow>(
      `UPDATE members SET ${fields.join(', ')}
       OUTPUT ${OUTPUT_COLS}
       WHERE member_id = @id AND is_deleted = 0`,
    );
    return result.recordset[0] ? toMemberRow(result.recordset[0], tenantId) : null;
  }

  public async setStatus(
    tenantId: string,
    id: string,
    status: MemberStatus,
  ): Promise<MemberRow | null> {
    const r = await this.req(tenantId);
    const result = await r
      .input('id', sql.UniqueIdentifier, id)
      .input('status', sql.NVarChar(20), status)
      .query<RawMemberRow>(
        `UPDATE members SET status = @status, updated_at = SYSUTCDATETIME()
         OUTPUT ${OUTPUT_COLS}
         WHERE member_id = @id AND is_deleted = 0`,
      );
    return result.recordset[0] ? toMemberRow(result.recordset[0], tenantId) : null;
  }

  public async softDelete(tenantId: string, id: string): Promise<MemberRow | null> {
    const r = await this.req(tenantId);
    const result = await r.input('id', sql.UniqueIdentifier, id).query<RawMemberRow>(
      `UPDATE members SET is_deleted = 1, deleted_at = SYSUTCDATETIME(),
           updated_at = SYSUTCDATETIME()
         OUTPUT ${OUTPUT_COLS}
         WHERE member_id = @id`,
    );
    return result.recordset[0] ? toMemberRow(result.recordset[0], tenantId) : null;
  }

  // ── Balance & Ledger ───────────────────────────────────────────────

  public async getBalance(tenantId: string, memberId: string): Promise<number> {
    const r = await this.req(tenantId);
    const result = await r
      .input('mid', sql.UniqueIdentifier, memberId)
      .query<{ balance: number }>(
        `SELECT COALESCE(balance, 0) AS balance FROM v_member_balance WHERE member_id = @mid`,
      );
    return result.recordset[0]?.balance ?? 0;
  }

  public async listLedger(
    tenantId: string,
    memberId: string,
    after: string | undefined,
    limit: number,
  ): Promise<LedgerRow[]> {
    const r = await this.req(tenantId);
    r.input('mid', sql.UniqueIdentifier, memberId).input('limit', sql.Int, limit);

    let where = 'member_id = @mid';
    if (after) {
      // after is the base64-decoded ledger_id (BIGINT as string)
      const afterId = parseInt(after, 10);
      if (!Number.isFinite(afterId)) {
        return [];
      }
      r.input('after', sql.BigInt, afterId);
      where += ' AND ledger_id > @after';
    }

    const result = await r.query<RawLedgerRow>(
      `SELECT TOP (@limit)
         ledger_id, member_id, ref_txn_id, delta, balance_after, reason_code, created_at
       FROM points_ledger WHERE ${where} ORDER BY ledger_id ASC`,
    );

    return result.recordset.map(toLedgerRow);
  }
}

// ── Raw SQL row shapes & mapping ─────────────────────────────────────

/** Shape returned by SQL SELECT with snake_case column names */
interface RawMemberRow {
  member_id: string;
  status: MemberStatus;
  tier_id: string;
  email_hash: string | null;
  phone_hash: string;
  email_encrypted: string | null;
  phone_encrypted: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  enrolled_channel: string;
  enrolled_at: Date;
  is_deleted: boolean | number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawLedgerRow {
  ledger_id: number;
  member_id: string;
  ref_txn_id: string | null;
  delta: number;
  balance_after: number;
  reason_code: string;
  created_at: Date;
}

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.toISOString();
}

function toMemberRow(raw: RawMemberRow, tenantId: string): MemberRow {
  return {
    id: raw.member_id,
    tenantId,
    status: raw.status,
    tierId: raw.tier_id ?? '',
    emailHash: raw.email_hash ?? undefined,
    phoneHash: raw.phone_hash,
    emailEncrypted: raw.email_encrypted ?? undefined,
    phoneEncrypted: raw.phone_encrypted,
    firstName: raw.first_name,
    lastName: raw.last_name,
    dateOfBirth: raw.date_of_birth ?? undefined,
    enrolledChannel: raw.enrolled_channel,
    enrolledAt: toISOString(raw.enrolled_at),
    isDeleted: raw.is_deleted === true || raw.is_deleted === 1,
    deletedAt: raw.deleted_at ? toISOString(raw.deleted_at) : undefined,
    createdAt: toISOString(raw.created_at),
    updatedAt: toISOString(raw.updated_at),
  };
}

function toLedgerRow(raw: RawLedgerRow): LedgerRow {
  return {
    id: String(raw.ledger_id),
    memberId: raw.member_id,
    transactionId: raw.ref_txn_id ?? undefined,
    delta: raw.delta,
    balanceAfter: raw.balance_after,
    reason: raw.reason_code,
    note: undefined,
    createdAt: toISOString(raw.created_at),
  };
}

/** SELECT columns — snake_case, no aliases (mapped by toMemberRow) */
const SELECT_COLS = `
  member_id, status, tier_id,
  email_hash, phone_hash,
  email_encrypted, phone_encrypted,
  first_name, last_name,
  date_of_birth, enrolled_channel,
  enrolled_at, is_deleted, deleted_at,
  created_at, updated_at
`;

/** OUTPUT clause columns for INSERT/UPDATE (prefixed with INSERTED.) */
const OUTPUT_COLS = `
  INSERTED.member_id, INSERTED.status, INSERTED.tier_id,
  INSERTED.email_hash, INSERTED.phone_hash,
  INSERTED.email_encrypted, INSERTED.phone_encrypted,
  INSERTED.first_name, INSERTED.last_name,
  INSERTED.date_of_birth, INSERTED.enrolled_channel,
  INSERTED.enrolled_at, INSERTED.is_deleted, INSERTED.deleted_at,
  INSERTED.created_at, INSERTED.updated_at
`;
