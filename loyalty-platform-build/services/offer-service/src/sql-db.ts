/**
 * SQL-backed implementation of OfferDb for offer-service.
 *
 * Queries: offers, redemptions, offer_codes tables (V11).
 */

import * as sql from 'mssql';
import type { OfferDb, OfferRow, RedemptionRow, OfferCodeRow } from './deps';

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.toISOString();
}

export class SqlOfferDb implements OfferDb {
  constructor(private readonly pool: sql.ConnectionPool) {}

  // ── Offers ──────────────────────────────────────────────────────────

  async createOffer(tenantId: string, offer: OfferRow): Promise<void> {
    const r = this.pool.request();
    r.input('offerId', sql.UniqueIdentifier, offer.offerId)
      .input('name', sql.NVarChar(200), offer.name)
      .input('description', sql.NVarChar(2000), offer.description)
      .input('type', sql.NVarChar(20), offer.type)
      .input('value', sql.Decimal(18, 4), offer.value)
      .input('minPurchase', sql.Decimal(18, 4), offer.minPurchase)
      .input('pointsCost', sql.Int, offer.pointsCost)
      .input('conditionsJson', sql.NVarChar(sql.MAX), offer.conditionsJson ? JSON.stringify(offer.conditionsJson) : null)
      .input('targetingJson', sql.NVarChar(sql.MAX), offer.targetingJson ? JSON.stringify(offer.targetingJson) : null)
      .input('validFrom', sql.DateTime2, new Date(offer.validFrom))
      .input('validTo', sql.DateTime2, new Date(offer.validTo))
      .input('maxRedemptions', sql.Int, offer.maxRedemptions)
      .input('currentRedemptions', sql.Int, offer.currentRedemptions)
      .input('perMemberLimit', sql.Int, offer.perMemberLimit)
      .input('isStackable', sql.Bit, offer.isStackable ? 1 : 0)
      .input('isActive', sql.Bit, offer.isActive ? 1 : 0)
      .input('minVisits', sql.Int, offer.minVisits ?? null)
      .input('visitWindowDays', sql.Int, offer.visitWindowDays ?? null)
      .input('visitResetOnRedeem', sql.Bit, offer.visitResetOnRedeem ? 1 : 0)
      .input('visitMinSpendCents', sql.Int, offer.visitMinSpendCents ?? null)
      .input('visitMinItems', sql.Int, offer.visitMinItems ?? null)
      .input('visitMinUniqueSku', sql.Int, offer.visitMinUniqueSku ?? null)
      .input('visitChannelsJson', sql.NVarChar(500), offer.visitChannels ? JSON.stringify(offer.visitChannels) : null)
      .input('visitStoreIdsJson', sql.NVarChar(500), offer.visitStoreIds ? JSON.stringify(offer.visitStoreIds) : null)
      .input('visitCountMode', sql.NVarChar(20), offer.visitCountMode || 'per-transaction');

    await r.query(
      `INSERT INTO offers
         (offer_id, name, description, type, value, min_purchase, points_cost,
          conditions_json, targeting_json, valid_from, valid_to, max_redemptions,
          current_redemptions, per_member_limit, is_stackable, is_active,
          min_visits, visit_window_days, visit_reset_on_redeem, visit_min_spend_cents,
          visit_min_items, visit_min_unique_sku, visit_channels_json, visit_store_ids_json, visit_count_mode,
          created_at, updated_at)
       VALUES
         (@offerId, @name, @description, @type, @value, @minPurchase, @pointsCost,
          @conditionsJson, @targetingJson, @validFrom, @validTo, @maxRedemptions,
          @currentRedemptions, @perMemberLimit, @isStackable, @isActive,
          @minVisits, @visitWindowDays, @visitResetOnRedeem, @visitMinSpendCents,
          @visitMinItems, @visitMinUniqueSku, @visitChannelsJson, @visitStoreIdsJson, @visitCountMode,
          SYSUTCDATETIME(), SYSUTCDATETIME())`,
    );
  }

  async updateOffer(tenantId: string, offerId: string, updates: Partial<OfferRow>): Promise<void> {
    const fields: string[] = [];
    const r = this.pool.request();
    r.input('offerId', sql.UniqueIdentifier, offerId);

    if (updates.name !== undefined) { fields.push('name = @name'); r.input('name', sql.NVarChar(200), updates.name); }
    if (updates.description !== undefined) { fields.push('description = @desc'); r.input('desc', sql.NVarChar(2000), updates.description); }
    if (updates.type !== undefined) { fields.push('type = @type'); r.input('type', sql.NVarChar(20), updates.type); }
    if (updates.value !== undefined) { fields.push('value = @value'); r.input('value', sql.Decimal(18, 4), updates.value); }
    if (updates.minPurchase !== undefined) { fields.push('min_purchase = @mp'); r.input('mp', sql.Decimal(18, 4), updates.minPurchase); }
    if (updates.pointsCost !== undefined) { fields.push('points_cost = @pc'); r.input('pc', sql.Int, updates.pointsCost); }
    if (updates.conditionsJson !== undefined) { fields.push('conditions_json = @cj'); r.input('cj', sql.NVarChar(sql.MAX), updates.conditionsJson ? JSON.stringify(updates.conditionsJson) : null); }
    if (updates.targetingJson !== undefined) { fields.push('targeting_json = @tj'); r.input('tj', sql.NVarChar(sql.MAX), updates.targetingJson ? JSON.stringify(updates.targetingJson) : null); }
    if (updates.validFrom !== undefined) { fields.push('valid_from = @vf'); r.input('vf', sql.DateTime2, new Date(updates.validFrom)); }
    if (updates.validTo !== undefined) { fields.push('valid_to = @vt'); r.input('vt', sql.DateTime2, new Date(updates.validTo)); }
    if (updates.maxRedemptions !== undefined) { fields.push('max_redemptions = @mr'); r.input('mr', sql.Int, updates.maxRedemptions); }
    if (updates.perMemberLimit !== undefined) { fields.push('per_member_limit = @pml'); r.input('pml', sql.Int, updates.perMemberLimit); }
    if (updates.isStackable !== undefined) { fields.push('is_stackable = @is'); r.input('is', sql.Bit, updates.isStackable ? 1 : 0); }
    if (updates.isActive !== undefined) { fields.push('is_active = @ia'); r.input('ia', sql.Bit, updates.isActive ? 1 : 0); }
    if (updates.minVisits !== undefined) { fields.push('min_visits = @mv'); r.input('mv', sql.Int, updates.minVisits ?? null); }
    if (updates.visitWindowDays !== undefined) { fields.push('visit_window_days = @vwd'); r.input('vwd', sql.Int, updates.visitWindowDays ?? null); }
    if (updates.visitResetOnRedeem !== undefined) { fields.push('visit_reset_on_redeem = @vror'); r.input('vror', sql.Bit, updates.visitResetOnRedeem ? 1 : 0); }
    if (updates.visitMinSpendCents !== undefined) { fields.push('visit_min_spend_cents = @vmsc'); r.input('vmsc', sql.Int, updates.visitMinSpendCents ?? null); }
    if (updates.visitMinItems !== undefined) { fields.push('visit_min_items = @vmi'); r.input('vmi', sql.Int, updates.visitMinItems ?? null); }
    if (updates.visitMinUniqueSku !== undefined) { fields.push('visit_min_unique_sku = @vmus'); r.input('vmus', sql.Int, updates.visitMinUniqueSku ?? null); }
    if (updates.visitChannels !== undefined) { fields.push('visit_channels_json = @vcj'); r.input('vcj', sql.NVarChar(500), updates.visitChannels ? JSON.stringify(updates.visitChannels) : null); }
    if (updates.visitStoreIds !== undefined) { fields.push('visit_store_ids_json = @vsij'); r.input('vsij', sql.NVarChar(500), updates.visitStoreIds ? JSON.stringify(updates.visitStoreIds) : null); }

    if (fields.length === 0) return;
    fields.push('updated_at = SYSUTCDATETIME()');

    await r.query(
      `UPDATE offers SET ${fields.join(', ')} WHERE offer_id = @offerId`,
    );
  }

  async getOffer(tenantId: string, offerId: string): Promise<OfferRow | null> {
    const r = this.pool.request();
    const result = await r
      .input('offerId', sql.UniqueIdentifier, offerId)
      .query<RawOfferRow>(
        `SELECT offer_id, name, description, type, value, min_purchase, points_cost,
                conditions_json, targeting_json, valid_from, valid_to, max_redemptions,
                current_redemptions, per_member_limit, is_stackable, is_active,
                min_visits, visit_window_days, visit_reset_on_redeem, visit_min_spend_cents,
                visit_min_items, visit_min_unique_sku, visit_channels_json, visit_store_ids_json, visit_count_mode,
                created_at, updated_at
         FROM offers WHERE offer_id = @offerId`,
      );
    return result.recordset[0] ? toOfferRow(result.recordset[0]) : null;
  }

  async listOffers(tenantId: string, filters?: { type?: string; active?: boolean }): Promise<OfferRow[]> {
    const r = this.pool.request();
    const conditions: string[] = [];

    if (filters?.type) {
      r.input('type', sql.NVarChar(20), filters.type);
      conditions.push('type = @type');
    }
    if (filters?.active !== undefined) {
      r.input('isActive', sql.Bit, filters.active ? 1 : 0);
      conditions.push('is_active = @isActive');
    }

    const result = await r.query<RawOfferRow>(
      `SELECT offer_id, name, description, type, value, min_purchase, points_cost,
              conditions_json, targeting_json, valid_from, valid_to, max_redemptions,
              current_redemptions, per_member_limit, is_stackable, is_active,
              min_visits, visit_window_days, visit_reset_on_redeem, visit_min_spend_cents,
              visit_min_items, visit_min_unique_sku, visit_channels_json, visit_store_ids_json, visit_count_mode,
              created_at, updated_at
       FROM offers ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC`,
    );
    return result.recordset.map(toOfferRow);
  }

  async deactivateOffer(tenantId: string, offerId: string): Promise<void> {
    await this.updateOffer(tenantId, offerId, { isActive: false });
  }

  // ── Redemptions ─────────────────────────────────────────────────────

  async createRedemption(tenantId: string, redemption: RedemptionRow): Promise<void> {
    const r = this.pool.request();
    r.input('redemptionId', sql.UniqueIdentifier, redemption.redemptionId)
      .input('memberId', sql.UniqueIdentifier, redemption.memberId)
      .input('offerId', sql.UniqueIdentifier, redemption.offerId)
      .input('channel', sql.NVarChar(50), redemption.channel)
      .input('pointsUsed', sql.Int, redemption.pointsUsed)
      .input('discountValue', sql.Decimal(18, 4), redemption.discountValue)
      .input('redemptionCode', sql.NVarChar(50), redemption.redemptionCode)
      .input('status', sql.NVarChar(20), redemption.status);

    await r.query(
      `INSERT INTO redemptions
         (redemption_id, member_id, offer_id, channel, points_used,
          discount_value, redemption_code, status, redeemed_at, created_at)
       VALUES
         (@redemptionId, @memberId, @offerId, @channel, @pointsUsed,
          @discountValue, @redemptionCode, @status, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    );
  }

  async getRedemption(tenantId: string, redemptionId: string): Promise<RedemptionRow | null> {
    const r = this.pool.request();
    const result = await r
      .input('redemptionId', sql.UniqueIdentifier, redemptionId)
      .query<RawRedemptionRow>(
        `SELECT redemption_id, member_id, offer_id, channel, points_used,
                discount_value, redemption_code, status, redeemed_at, reversed_at, created_at
         FROM redemptions WHERE redemption_id = @redemptionId`,
      );
    return result.recordset[0] ? toRedemptionRow(result.recordset[0]) : null;
  }

  async countMemberRedemptions(tenantId: string, memberId: string, offerId: string): Promise<number> {
    const r = this.pool.request();
    const result = await r
      .input('memberId', sql.UniqueIdentifier, memberId)
      .input('offerId', sql.UniqueIdentifier, offerId)
      .query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM redemptions
         WHERE member_id = @memberId AND offer_id = @offerId AND status = 'completed'`,
      );
    return result.recordset[0]?.cnt ?? 0;
  }

  async incrementOfferRedemptions(tenantId: string, offerId: string): Promise<void> {
    const r = this.pool.request();
    await r
      .input('offerId', sql.UniqueIdentifier, offerId)
      .query(
        `UPDATE offers SET current_redemptions = current_redemptions + 1, updated_at = SYSUTCDATETIME()
         WHERE offer_id = @offerId`,
      );
  }

  async decrementOfferRedemptions(tenantId: string, offerId: string): Promise<void> {
    const r = this.pool.request();
    await r
      .input('offerId', sql.UniqueIdentifier, offerId)
      .query(
        `UPDATE offers SET current_redemptions = CASE WHEN current_redemptions > 0 THEN current_redemptions - 1 ELSE 0 END, updated_at = SYSUTCDATETIME()
         WHERE offer_id = @offerId`,
      );
  }

  async reverseRedemption(tenantId: string, redemptionId: string): Promise<void> {
    const r = this.pool.request();
    await r
      .input('redemptionId', sql.UniqueIdentifier, redemptionId)
      .query(
        `UPDATE redemptions SET status = 'reversed', reversed_at = SYSUTCDATETIME()
         WHERE redemption_id = @redemptionId`,
      );
  }

  // ── Visit counting (V19) ───────────────────────────────────────────

  async getQualifiedVisitCount(tenantId: string, memberId: string, config: {
    windowDays?: number | null;
    minSpendCents?: number | null;
    minItems?: number | null;
    channels?: string[] | null;
    storeIds?: string[] | null;
    visitCountMode?: 'per-day' | 'per-transaction';
  }): Promise<number> {
    const req = this.pool.request().input('mid', sql.UniqueIdentifier, memberId);
    let where = "WHERE t.member_id = @mid AND t.status = 'posted'";

    if (config.windowDays) {
      req.input('windowStart', sql.DateTime2, new Date(Date.now() - config.windowDays * 86400000));
      where += ' AND t.occurred_at >= @windowStart';
    }
    if (config.minSpendCents) {
      req.input('minSpend', sql.Int, config.minSpendCents);
      where += ' AND t.amount >= @minSpend';
    }
    if (config.minItems) {
      req.input('minItems', sql.Int, config.minItems);
      where += ' AND t.basket_size >= @minItems';
    }
    if (config.channels?.length) {
      where += ` AND t.source_channel IN (${config.channels.map((_, i) => `@ch${i}`).join(',')})`;
      config.channels.forEach((ch, i) => req.input(`ch${i}`, sql.NVarChar, ch));
    }
    if (config.storeIds?.length) {
      where += ` AND t.store_id IN (${config.storeIds.map((_, i) => `@st${i}`).join(',')})`;
      config.storeIds.forEach((s, i) => req.input(`st${i}`, sql.NVarChar, s));
    }

    const countExpr = config.visitCountMode === 'per-transaction'
      ? 'COUNT(*)'
      : 'COUNT(DISTINCT CAST(t.occurred_at AS DATE))';
    const result = await req.query<{ cnt: number }>(
      `SELECT ${countExpr} AS cnt FROM transactions t ${where}`,
    );
    return result.recordset[0]?.cnt ?? 0;
  }

  // ── Offer codes ─────────────────────────────────────────────────────

  async createCodes(tenantId: string, codes: OfferCodeRow[]): Promise<void> {
    // Batch insert using table-valued parameter pattern, chunked to 1000 at a time
    for (let i = 0; i < codes.length; i += 1000) {
      const chunk = codes.slice(i, i + 1000);
      const values = chunk.map((_, idx) =>
        `(@code${idx}, @offerId${idx}, @memberId${idx}, @status${idx}, @assignedAt${idx}, @redeemedAt${idx})`
      ).join(', ');

      const r = this.pool.request();

      for (let j = 0; j < chunk.length; j++) {
        const c = chunk[j]!;
        r.input(`code${j}`, sql.NVarChar(50), c.code);
        r.input(`offerId${j}`, sql.UniqueIdentifier, c.offerId);
        r.input(`memberId${j}`, sql.UniqueIdentifier, c.memberId);
        r.input(`status${j}`, sql.NVarChar(20), c.status);
        r.input(`assignedAt${j}`, sql.DateTime2, c.assignedAt ? new Date(c.assignedAt) : null);
        r.input(`redeemedAt${j}`, sql.DateTime2, c.redeemedAt ? new Date(c.redeemedAt) : null);
      }

      await r.query(
        `INSERT INTO offer_codes (code, offer_id, member_id, status, assigned_at, redeemed_at)
         VALUES ${values}`,
      );
    }
  }

  async listCodes(tenantId: string, offerId: string, status?: string): Promise<OfferCodeRow[]> {
    const r = this.pool.request();
    r.input('offerId', sql.UniqueIdentifier, offerId);

    const conditions = ['offer_id = @offerId'];
    if (status) {
      r.input('status', sql.NVarChar(20), status);
      conditions.push('status = @status');
    }

    const result = await r.query<RawCodeRow>(
      `SELECT code, offer_id, member_id, status, assigned_at, redeemed_at
       FROM offer_codes WHERE ${conditions.join(' AND ')}`,
    );
    return result.recordset.map(toCodeRow);
  }

  async getCode(tenantId: string, code: string): Promise<OfferCodeRow | null> {
    const r = this.pool.request();
    const result = await r
      .input('code', sql.NVarChar(50), code)
      .query<RawCodeRow>(
        `SELECT code, offer_id, member_id, status, assigned_at, redeemed_at
         FROM offer_codes WHERE code = @code`,
      );
    return result.recordset[0] ? toCodeRow(result.recordset[0]) : null;
  }

  async getMemberCodeForOffer(tenantId: string, memberId: string, offerId: string): Promise<import('./deps').OfferCodeRow | null> {
    const r = this.pool.request();
    const result = await r
      .input('memberId', sql.UniqueIdentifier, memberId)
      .input('offerId', sql.UniqueIdentifier, offerId)
      .query<RawCodeRow>(
        `SELECT TOP 1 code, offer_id, member_id, status, assigned_at, redeemed_at
         FROM offer_codes
         WHERE offer_id = @offerId AND member_id = @memberId AND status = 'assigned'`,
      );
    return result.recordset[0] ? toCodeRow(result.recordset[0]) : null;
  }

  async redeemCode(tenantId: string, code: string, memberId: string): Promise<void> {
    const r = this.pool.request();
    await r
      .input('code', sql.NVarChar(50), code)
      .input('memberId', sql.UniqueIdentifier, memberId)
      .query(
        `UPDATE offer_codes SET status = 'redeemed', member_id = @memberId, redeemed_at = SYSUTCDATETIME()
         WHERE code = @code`,
      );
  }

  async unredeemCode(tenantId: string, code: string): Promise<void> {
    const r = this.pool.request();
    await r
      .input('code', sql.NVarChar(50), code)
      .query(
        `UPDATE offer_codes SET status = 'available', member_id = NULL, redeemed_at = NULL
         WHERE code = @code`,
      );
  }
}

// ── Raw row types ─────────────────────────────────────────────────────

interface RawOfferRow {
  offer_id: string;
  name: string;
  description: string | null;
  type: 'percent' | 'fixed' | 'bogo' | 'threshold';
  value: number;
  min_purchase: number | null;
  points_cost: number | null;
  conditions_json: string | null;
  targeting_json: string | null;
  valid_from: Date;
  valid_to: Date;
  max_redemptions: number | null;
  current_redemptions: number;
  per_member_limit: number;
  is_stackable: boolean | number;
  is_active: boolean | number;
  min_visits: number | null;
  visit_window_days: number | null;
  visit_reset_on_redeem: boolean | number | null;
  visit_min_spend_cents: number | null;
  visit_min_items: number | null;
  visit_min_unique_sku: number | null;
  visit_channels_json: string | null;
  visit_store_ids_json: string | null;
  visit_count_mode: string | null;
  created_at: Date;
  updated_at: Date;
}

function toOfferRow(raw: RawOfferRow): OfferRow {
  return {
    offerId: raw.offer_id,
    name: raw.name,
    description: raw.description,
    type: raw.type,
    value: raw.value,
    minPurchase: raw.min_purchase,
    pointsCost: raw.points_cost,
    conditionsJson: raw.conditions_json ? JSON.parse(raw.conditions_json) : null,
    targetingJson: raw.targeting_json ? JSON.parse(raw.targeting_json) : null,
    validFrom: toISOString(raw.valid_from),
    validTo: toISOString(raw.valid_to),
    maxRedemptions: raw.max_redemptions,
    currentRedemptions: raw.current_redemptions,
    perMemberLimit: raw.per_member_limit,
    isStackable: raw.is_stackable === true || raw.is_stackable === 1,
    isActive: raw.is_active === true || raw.is_active === 1,
    minVisits: raw.min_visits ?? null,
    visitWindowDays: raw.visit_window_days ?? null,
    visitResetOnRedeem: raw.visit_reset_on_redeem === true || raw.visit_reset_on_redeem === 1 ? true : false,
    visitMinSpendCents: raw.visit_min_spend_cents ?? null,
    visitMinItems: raw.visit_min_items ?? null,
    visitMinUniqueSku: raw.visit_min_unique_sku ?? null,
    visitChannels: raw.visit_channels_json ? JSON.parse(raw.visit_channels_json) : null,
    visitStoreIds: raw.visit_store_ids_json ? JSON.parse(raw.visit_store_ids_json) : null,
    visitCountMode: (raw.visit_count_mode as 'per-day' | 'per-transaction') || 'per-transaction',
    createdAt: toISOString(raw.created_at),
    updatedAt: toISOString(raw.updated_at),
  };
}

interface RawRedemptionRow {
  redemption_id: string;
  member_id: string;
  offer_id: string;
  channel: string;
  points_used: number;
  discount_value: number;
  redemption_code: string | null;
  status: 'completed' | 'reversed';
  redeemed_at: Date;
  reversed_at: Date | null;
  created_at: Date;
}

function toRedemptionRow(raw: RawRedemptionRow): RedemptionRow {
  return {
    redemptionId: raw.redemption_id,
    memberId: raw.member_id,
    offerId: raw.offer_id,
    channel: raw.channel,
    pointsUsed: raw.points_used,
    discountValue: raw.discount_value,
    redemptionCode: raw.redemption_code,
    status: raw.status,
    redeemedAt: toISOString(raw.redeemed_at),
    reversedAt: raw.reversed_at ? toISOString(raw.reversed_at) : null,
    createdAt: toISOString(raw.created_at),
  };
}

interface RawCodeRow {
  code: string;
  offer_id: string;
  member_id: string | null;
  status: 'available' | 'assigned' | 'redeemed' | 'expired';
  assigned_at: Date | null;
  redeemed_at: Date | null;
}

function toCodeRow(raw: RawCodeRow): OfferCodeRow {
  return {
    code: raw.code,
    offerId: raw.offer_id,
    memberId: raw.member_id,
    status: raw.status,
    assignedAt: raw.assigned_at ? toISOString(raw.assigned_at) : null,
    redeemedAt: raw.redeemed_at ? toISOString(raw.redeemed_at) : null,
  };
}
