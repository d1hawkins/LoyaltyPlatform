/**
 * SQL-backed MobileDataProvider.
 *
 * Queries the tenant SQL database (same pool used by SqlMemberRepository)
 * for all mobile-dashboard data.
 */

import * as sql from 'mssql';
import type { MemberRow } from '../repository';
import type {
  MobileDataProvider,
  MobileTierRow,
  MobileTransactionRow,
  MobileOfferRow,
  MobileNotificationRow,
} from './service';

function toISO(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.toISOString();
}

export class SqlMobileDataProvider implements MobileDataProvider {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async getMember(_tenantId: string, memberId: string): Promise<MemberRow | null> {
    const r = this.pool.request();
    const result = await r
      .input('id', sql.UniqueIdentifier, memberId)
      .query<{
        member_id: string;
        status: string;
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
      }>(
        `SELECT member_id, status, tier_id, email_hash, phone_hash,
                email_encrypted, phone_encrypted, first_name, last_name,
                date_of_birth, enrolled_channel, enrolled_at, is_deleted,
                deleted_at, created_at, updated_at
         FROM members WHERE member_id = @id AND is_deleted = 0`,
      );

    const raw = result.recordset[0];
    if (!raw) return null;

    return {
      id: raw.member_id,
      tenantId: _tenantId,
      status: raw.status as MemberRow['status'],
      tierId: raw.tier_id ?? '',
      emailHash: raw.email_hash ?? undefined,
      phoneHash: raw.phone_hash,
      emailEncrypted: raw.email_encrypted ?? undefined,
      phoneEncrypted: raw.phone_encrypted,
      firstName: raw.first_name,
      lastName: raw.last_name,
      dateOfBirth: raw.date_of_birth ?? undefined,
      enrolledChannel: raw.enrolled_channel,
      enrolledAt: toISO(raw.enrolled_at),
      isDeleted: raw.is_deleted === true || raw.is_deleted === 1,
      deletedAt: raw.deleted_at ? toISO(raw.deleted_at) : undefined,
      createdAt: toISO(raw.created_at),
      updatedAt: toISO(raw.updated_at),
    };
  }

  async getBalance(_tenantId: string, memberId: string): Promise<number> {
    const r = this.pool.request();
    const result = await r
      .input('mid', sql.UniqueIdentifier, memberId)
      .query<{ balance: number }>(
        `SELECT COALESCE(balance, 0) AS balance FROM v_member_balance WHERE member_id = @mid`,
      );
    return result.recordset[0]?.balance ?? 0;
  }

  async getAllTiers(_tenantId: string): Promise<MobileTierRow[]> {
    const r = this.pool.request();
    const result = await r.query<{
      tier_id: string;
      name: string;
      sort_order: number;
      min_points: number;
      benefits_json: string | null;
    }>(
      `SELECT tier_id, name, sort_order, COALESCE(min_points, 0) AS min_points,
              benefits_json
       FROM tiers WHERE is_active = 1 ORDER BY sort_order ASC`,
    );

    return result.recordset.map((raw) => ({
      id: raw.tier_id,
      name: raw.name,
      rank: raw.sort_order,
      thresholdPoints: raw.min_points,
      benefits: raw.benefits_json ? JSON.parse(raw.benefits_json) : { earnMultiplier: 1 },
      sortOrder: raw.sort_order,
    }));
  }

  async getTier(_tenantId: string, tierId: string): Promise<MobileTierRow | null> {
    const all = await this.getAllTiers(_tenantId);
    return all.find((t) => t.id === tierId) ?? null;
  }

  async getRecentTransactions(
    _tenantId: string,
    memberId: string,
    limit: number,
    after?: string,
  ): Promise<MobileTransactionRow[]> {
    const r = this.pool.request();
    r.input('mid', sql.UniqueIdentifier, memberId).input('limit', sql.Int, limit);

    let where = 'member_id = @mid';
    if (after) {
      r.input('after', sql.UniqueIdentifier, after);
      where += ' AND txn_id < @after';
    }

    const result = await r.query<{
      txn_id: string;
      member_id: string;
      channel: string;
      amount: number;
      currency: string;
      created_at: Date;
    }>(
      `SELECT TOP (@limit) txn_id, member_id, COALESCE(channel, 'pos') AS channel,
              COALESCE(amount, 0) AS amount, COALESCE(currency, 'USD') AS currency,
              created_at
       FROM transactions WHERE ${where}
       ORDER BY created_at DESC`,
    );

    return result.recordset.map((raw) => ({
      id: raw.txn_id,
      memberId: raw.member_id,
      channel: raw.channel,
      amountCents: Math.round(raw.amount * 100),
      currency: raw.currency,
      pointsEarned: 0, // points_earned not stored in transactions table; would need ledger join
      createdAt: toISO(raw.created_at),
    }));
  }

  async getEligibleOffers(
    _tenantId: string,
    _memberId: string,
    limit: number,
  ): Promise<MobileOfferRow[]> {
    // Query active offers that are currently valid
    const r = this.pool.request();
    r.input('limit', sql.Int, limit)
      .input('now', sql.DateTime2, new Date());

    try {
      const result = await r.query<{
        offer_id: string;
        name: string;
        description: string | null;
        type: string;
        value: number;
        valid_from: Date;
        valid_to: Date;
        conditions_json: string | null;
      }>(
        `SELECT TOP (@limit) offer_id, name, description, type, value,
                valid_from, valid_to, conditions_json
         FROM offers
         WHERE is_active = 1 AND valid_from <= @now AND valid_to >= @now
         ORDER BY created_at DESC`,
      );

      return result.recordset.map((raw) => ({
        id: raw.offer_id,
        code: '',
        name: raw.name,
        description: raw.description ?? undefined,
        type: raw.type,
        value: raw.value,
        startsAt: toISO(raw.valid_from),
        endsAt: toISO(raw.valid_to),
        conditionsJson: raw.conditions_json ? JSON.parse(raw.conditions_json) : undefined,
      }));
    } catch {
      // If offers table doesn't exist or query fails, return empty
      return [];
    }
  }

  async getUnreadNotificationCount(
    _tenantId: string,
    memberId: string,
  ): Promise<number> {
    try {
      const r = this.pool.request();
      const result = await r
        .input('mid', sql.UniqueIdentifier, memberId)
        .query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM notification_log
           WHERE member_id = @mid AND status = 'sent'`,
        );
      return result.recordset[0]?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  async getNotifications(
    _tenantId: string,
    memberId: string,
    limit: number,
  ): Promise<MobileNotificationRow[]> {
    try {
      const r = this.pool.request();
      r.input('mid', sql.UniqueIdentifier, memberId).input('limit', sql.Int, limit);

      const result = await r.query<{
        notification_id: string;
        template_key: string;
        channel: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT TOP (@limit) notification_id, template_key, channel, status, created_at
         FROM notification_log WHERE member_id = @mid
         ORDER BY created_at DESC`,
      );

      return result.recordset.map((raw) => ({
        id: raw.notification_id,
        templateKey: raw.template_key,
        channel: raw.channel,
        status: raw.status,
        createdAt: toISO(raw.created_at),
      }));
    } catch {
      return [];
    }
  }

  async getNotificationPreferences(
    _tenantId: string,
    memberId: string,
  ): Promise<Record<string, boolean>> {
    try {
      const r = this.pool.request();
      const result = await r
        .input('mid', sql.UniqueIdentifier, memberId)
        .query<{ template_key: string; opted_in: boolean }>(
          `SELECT template_key, opted_in FROM notification_preferences WHERE member_id = @mid`,
        );
      const prefs: Record<string, boolean> = {};
      for (const row of result.recordset) {
        prefs[row.template_key] = row.opted_in;
      }
      return prefs;
    } catch {
      return {};
    }
  }

  async setNotificationPreference(
    _tenantId: string,
    memberId: string,
    templateKey: string,
    optedIn: boolean,
  ): Promise<void> {
    const r = this.pool.request();
    r.input('mid', sql.UniqueIdentifier, memberId)
      .input('key', sql.NVarChar(100), templateKey)
      .input('opted', sql.Bit, optedIn);

    await r.query(
      `MERGE notification_preferences AS target
       USING (SELECT @mid AS member_id, @key AS template_key) AS source
         ON target.member_id = source.member_id AND target.template_key = source.template_key
       WHEN MATCHED THEN UPDATE SET opted_in = @opted, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (member_id, template_key, opted_in, created_at, updated_at)
         VALUES (@mid, @key, @opted, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    );
  }
}
