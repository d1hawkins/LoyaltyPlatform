/**
 * SQL Server (mssql) implementation of LoyaltyDb.
 * Connects to the tenant's Azure SQL database via a pre-configured ConnectionPool.
 */
import * as sql from 'mssql';
import type {
  ExpiringCredit,
  ExpiryWarningCredit,
  IdempotencyRecord,
  LedgerEntryRow,
  LoyaltyDb,
  LoyaltyTx,
  ProgramConfig,
  TransactionRow,
} from '../deps';

export class SqlLoyaltyDb implements LoyaltyDb {
  private idempotencyTableReady = false;

  constructor(private readonly pool: sql.ConnectionPool) {}

  /* ------------------------------------------------------------------ */
  /*  Idempotency table (auto-created)                                  */
  /* ------------------------------------------------------------------ */
  async ensureIdempotencyTable(): Promise<void> {
    if (this.idempotencyTableReady) return;
    await this.pool.request().query(`
      IF OBJECT_ID('dbo.__idempotency_keys', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.__idempotency_keys (
          tenant_id        UNIQUEIDENTIFIER NOT NULL,
          idempotency_key  NVARCHAR(200)    NOT NULL,
          request_hash     NVARCHAR(MAX)    NOT NULL,
          status_code      INT              NOT NULL,
          response_body    NVARCHAR(MAX)    NOT NULL,
          created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT pk___idempotency_keys PRIMARY KEY (tenant_id, idempotency_key)
        );
      END
      ELSE
      BEGIN
        -- Widen request_hash if it was created with a smaller type.
        -- COL_LENGTH returns -1 for MAX types, positive for fixed-length.
        IF COL_LENGTH('dbo.__idempotency_keys', 'request_hash') > 0
          ALTER TABLE dbo.__idempotency_keys ALTER COLUMN request_hash NVARCHAR(MAX) NOT NULL;
      END
    `);
    this.idempotencyTableReady = true;
  }

  async getIdempotency(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    await this.ensureIdempotencyTable();
    const result = await this.pool
      .request()
      .input('tid', sql.UniqueIdentifier, tenantId)
      .input('key', sql.NVarChar(200), key)
      .query<{
        idempotency_key: string;
        request_hash: string;
        status_code: number;
        response_body: string;
        created_at: Date;
      }>(`SELECT idempotency_key, request_hash, status_code, response_body, created_at
          FROM __idempotency_keys
          WHERE tenant_id = @tid AND idempotency_key = @key`);
    const row = result.recordset[0];
    if (!row) return null;
    return {
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      statusCode: row.status_code,
      responseBody: JSON.parse(row.response_body),
      createdAt: row.created_at.toISOString(),
    };
  }

  async putIdempotency(tenantId: string, rec: IdempotencyRecord): Promise<void> {
    await this.ensureIdempotencyTable();
    await this.pool
      .request()
      .input('tid', sql.UniqueIdentifier, tenantId)
      .input('key', sql.NVarChar(200), rec.idempotencyKey)
      .input('hash', sql.NVarChar(sql.MAX), rec.requestHash)
      .input('code', sql.Int, rec.statusCode)
      .input('body', sql.NVarChar(sql.MAX), JSON.stringify(rec.responseBody))
      .query(`INSERT INTO __idempotency_keys (tenant_id, idempotency_key, request_hash, status_code, response_body)
              VALUES (@tid, @key, @hash, @code, @body)`);
  }

  /* ------------------------------------------------------------------ */
  /*  Program config                                                    */
  /* ------------------------------------------------------------------ */
  async getProgramConfig(_tenantId: string): Promise<ProgramConfig> {
    const result = await this.pool.request().query<{
      base_earn_rate: number;
      points_expiry_days: number | null;
      config_json: string | null;
      points_expiry_months: number | null;
      expiry_notification_days: string | null;
      earn_mode: string | null;
      points_per_visit: number | null;
      visit_min_spend_cents: number | null;
      max_visits_per_day: number | null;
    }>(`SELECT base_earn_rate, points_expiry_days, config_json,
               points_expiry_months, expiry_notification_days,
               earn_mode, points_per_visit, visit_min_spend_cents, max_visits_per_day
        FROM program_config WHERE id = 1`);
    const row = result.recordset[0];
    if (!row) {
      // Return sensible defaults if no row exists
      return {
        baseEarnRate: 1,
        voidWindowHours: 168,
        multiplierCap: 5,
        currency: 'USD',
        promoMultipliers: [],
        earnMode: 'per-dollar',
        pointsPerVisit: null,
        visitMinSpendCents: null,
        maxVisitsPerDay: null,
      };
    }
    // config_json may contain overrides for voidWindowHours, multiplierCap, currency, promoMultipliers
    let extra: Record<string, unknown> = {};
    if (row.config_json) {
      try {
        extra = JSON.parse(row.config_json);
      } catch {
        /* ignore bad json */
      }
    }
    return {
      baseEarnRate: Number(row.base_earn_rate) || 1,
      voidWindowHours: (extra.voidWindowHours as number) ?? 168,
      multiplierCap: (extra.multiplierCap as number) ?? 5,
      currency: (extra.currency as string) ?? 'USD',
      promoMultipliers: (extra.promoMultipliers as ProgramConfig['promoMultipliers']) ?? [],
      pointsExpiryMonths: row.points_expiry_months ?? null,
      expiryNotificationDays: row.expiry_notification_days ?? null,
      earnMode: (row.earn_mode === 'per-visit' ? 'per-visit' : 'per-dollar') as 'per-dollar' | 'per-visit',
      pointsPerVisit: row.points_per_visit ?? null,
      visitMinSpendCents: row.visit_min_spend_cents ?? null,
      maxVisitsPerDay: row.max_visits_per_day ?? null,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Per-visit: count today's qualifying transactions                  */
  /* ------------------------------------------------------------------ */
  async countTodayVisits(_tenantId: string, memberId: string): Promise<number> {
    const result = await this.pool
      .request()
      .input('mid', sql.UniqueIdentifier, memberId)
      .query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM transactions
         WHERE member_id = @mid AND status = 'posted'
           AND CAST(occurred_at AS DATE) = CAST(SYSUTCDATETIME() AS DATE)`,
      );
    return result.recordset[0]?.cnt ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Balance                                                           */
  /* ------------------------------------------------------------------ */
  async getBalance(_tenantId: string, memberId: string): Promise<number> {
    const result = await this.pool
      .request()
      .input('mid', sql.UniqueIdentifier, memberId)
      .query<{ total: number | null }>(
        `SELECT SUM(delta) AS total FROM points_ledger WHERE member_id = @mid`,
      );
    return result.recordset[0]?.total ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Transaction lookups                                               */
  /* ------------------------------------------------------------------ */
  async getTransaction(_tenantId: string, id: string): Promise<TransactionRow | null> {
    const result = await this.pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<{
        txn_id: string;
        member_id: string;
        channel: string;
        amount: number;
        currency: string;
        status: string;
        sku_list_json: string | null;
        location_id: string | null;
        occurred_at: Date;
        created_at: Date;
        idempotency_key: string | null;
        store_id: string | null;
        store_name: string | null;
        register_id: string | null;
        associate_id: string | null;
        associate_name: string | null;
        source_channel: string | null;
        source_system: string | null;
        order_ref: string | null;
        basket_size: number | null;
        metadata_json: string | null;
      }>(`SELECT txn_id, member_id, channel, amount, currency, status,
                 sku_list_json, location_id, occurred_at, created_at, idempotency_key,
                 store_id, store_name, register_id, associate_id, associate_name,
                 source_channel, source_system, order_ref, basket_size, metadata_json
          FROM transactions WHERE txn_id = @id`);
    const row = result.recordset[0];
    if (!row) return null;

    // We need to find the ledger_id for this transaction
    const ledgerResult = await this.pool
      .request()
      .input('tid', sql.UniqueIdentifier, id)
      .query<{ ledger_id: number }>(`SELECT TOP 1 ledger_id FROM points_ledger WHERE ref_txn_id = @tid AND reason_code = 'earn' ORDER BY created_at ASC`);

    return {
      id: row.txn_id,
      tenantId: _tenantId,
      memberId: row.member_id,
      channel: row.channel,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status as 'committed' | 'voided',
      pointsEarned: 0, // Will be set from ledger delta below
      ledgerId: ledgerResult.recordset[0]?.ledger_id?.toString() ?? '',
      locationId: row.location_id ?? undefined,
      skuList: row.sku_list_json ? JSON.parse(row.sku_list_json) : [],
      occurredAt: row.occurred_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      idempotencyKey: row.idempotency_key ?? undefined,
      storeId: row.store_id ?? undefined,
      storeName: row.store_name ?? undefined,
      registerId: row.register_id ?? undefined,
      associateId: row.associate_id ?? undefined,
      associateName: row.associate_name ?? undefined,
      sourceChannel: row.source_channel ?? undefined,
      sourceSystem: row.source_system ?? undefined,
      orderRef: row.order_ref ?? undefined,
      basketSize: row.basket_size ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  async getLedgerEntry(_tenantId: string, id: string): Promise<LedgerEntryRow | null> {
    const result = await this.pool
      .request()
      .input('id', sql.BigInt, id)
      .query<{
        ledger_id: number;
        member_id: string;
        delta: number;
        reason_code: string;
        ref_txn_id: string | null;
        ref_ledger_id: number | null;
        balance_after: number;
        created_at: Date;
        expires_at: Date | null;
      }>(`SELECT ledger_id, member_id, delta, reason_code, ref_txn_id,
                 ref_ledger_id, balance_after, created_at, expires_at
          FROM points_ledger WHERE ledger_id = @id`);
    const row = result.recordset[0];
    if (!row) return null;
    return this.mapLedgerRow(row, _tenantId);
  }

  /* ------------------------------------------------------------------ */
  /*  withTransaction — atomic BEGIN/COMMIT/ROLLBACK                    */
  /* ------------------------------------------------------------------ */
  async withTransaction<T>(tenantId: string, fn: (tx: LoyaltyTx) => Promise<T>): Promise<T> {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();

    const tx: LoyaltyTx = {
      insertTransaction: async (row) => {
        const req = new sql.Request(transaction);
        await req
          .input('id', sql.UniqueIdentifier, row.id)
          .input('memberId', sql.UniqueIdentifier, row.memberId)
          .input('channel', sql.NVarChar(20), row.channel)
          .input('amount', sql.Decimal(12, 2), row.amount)
          .input('currency', sql.Char(3), row.currency)
          .input('status', sql.NVarChar(20), row.status === 'committed' ? 'posted' : row.status)
          .input('skuList', sql.NVarChar(sql.MAX), JSON.stringify(row.skuList ?? []))
          .input('locationId', sql.NVarChar(100), row.locationId ?? null)
          .input('occurredAt', sql.DateTime2, new Date(row.occurredAt))
          .input('idempotencyKey', sql.NVarChar(200), row.idempotencyKey ?? null)
          .input('storeId', sql.NVarChar(50), row.storeId ?? null)
          .input('storeName', sql.NVarChar(200), row.storeName ?? null)
          .input('registerId', sql.NVarChar(50), row.registerId ?? null)
          .input('associateId', sql.NVarChar(100), row.associateId ?? null)
          .input('associateName', sql.NVarChar(200), row.associateName ?? null)
          .input('sourceChannel', sql.NVarChar(50), row.sourceChannel ?? null)
          .input('sourceSystem', sql.NVarChar(100), row.sourceSystem ?? null)
          .input('orderRef', sql.NVarChar(200), row.orderRef ?? null)
          .input('basketSize', sql.Int, row.basketSize ?? null)
          .input('metadataJson', sql.NVarChar(sql.MAX), row.metadata ? JSON.stringify(row.metadata) : null)
          .query(`INSERT INTO transactions (txn_id, member_id, channel, amount, currency, status, sku_list_json, location_id, occurred_at, idempotency_key,
                    store_id, store_name, register_id, associate_id, associate_name, source_channel, source_system, order_ref, basket_size, metadata_json)
                  VALUES (@id, @memberId, @channel, @amount, @currency, @status, @skuList, @locationId, @occurredAt, @idempotencyKey,
                    @storeId, @storeName, @registerId, @associateId, @associateName, @sourceChannel, @sourceSystem, @orderRef, @basketSize, @metadataJson)`);
      },

      updateTransactionStatus: async (id, status) => {
        const req = new sql.Request(transaction);
        await req
          .input('id', sql.UniqueIdentifier, id)
          .input('status', sql.NVarChar(20), status)
          .input('voidedAt', sql.DateTime2, new Date())
          .query(`UPDATE transactions SET status = @status, voided_at = @voidedAt, updated_at = SYSUTCDATETIME() WHERE txn_id = @id`);
      },

      insertLedgerEntry: async (row) => {
        const req = new sql.Request(transaction);
        await req
          .input('memberId', sql.UniqueIdentifier, row.memberId)
          .input('delta', sql.Int, row.delta)
          .input('reasonCode', sql.NVarChar(40), row.reasonCode)
          .input('refTxnId', sql.UniqueIdentifier, row.transactionId ?? null)
          .input('refLedgerId', sql.BigInt, row.refLedgerId ? Number(row.refLedgerId) : null)
          .input('balanceAfter', sql.Int, row.balanceAfter)
          .input('createdBy', sql.NVarChar(200), 'system')
          .input('expiresAt', sql.DateTime2, row.expiresAt ? new Date(row.expiresAt) : null)
          .query(`SET IDENTITY_INSERT points_ledger OFF;
                  INSERT INTO points_ledger (member_id, delta, reason_code, ref_txn_id, ref_ledger_id, balance_after, created_by, expires_at)
                  VALUES (@memberId, @delta, @reasonCode, @refTxnId, @refLedgerId, @balanceAfter, @createdBy, @expiresAt)`);
      },

      currentBalance: async (memberId) => {
        const req = new sql.Request(transaction);
        const result = await req
          .input('mid', sql.UniqueIdentifier, memberId)
          .query<{ total: number | null }>(
            `SELECT SUM(delta) AS total FROM points_ledger WITH (UPDLOCK) WHERE member_id = @mid`,
          );
        return result.recordset[0]?.total ?? 0;
      },
    };

    try {
      const result = await fn(tx);
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Expiry-related queries                                            */
  /* ------------------------------------------------------------------ */
  async getExpiringCredits(_tenantId: string, asOfDate?: Date): Promise<ExpiringCredit[]> {
    const now = asOfDate ?? new Date();
    const result = await this.pool
      .request()
      .input('asOf', sql.DateTime2, now)
      .query<{
        ledger_id: number;
        member_id: string;
        delta: number;
        expires_at: Date;
        already_used: number;
      }>(`SELECT pl.ledger_id, pl.member_id, pl.delta, pl.expires_at,
                 ISNULL((SELECT SUM(ABS(d.delta)) FROM points_ledger d
                         WHERE d.ref_ledger_id = pl.ledger_id AND d.reason_code <> 'expire' AND d.delta < 0), 0) AS already_used
          FROM points_ledger pl
          WHERE pl.delta > 0
            AND pl.expires_at IS NOT NULL
            AND pl.expires_at <= @asOf
            AND NOT EXISTS (SELECT 1 FROM points_ledger ex WHERE ex.ref_ledger_id = pl.ledger_id AND ex.reason_code = 'expire')`);
    return result.recordset.map((r) => ({
      ledgerId: r.ledger_id.toString(),
      memberId: r.member_id,
      delta: r.delta,
      expiresAt: r.expires_at.toISOString(),
      alreadyUsed: r.already_used,
    }));
  }

  async getCreditsExpiringInDays(
    _tenantId: string,
    days: number,
    asOfDate?: Date,
  ): Promise<ExpiryWarningCredit[]> {
    const now = asOfDate ?? new Date();
    const windowStart = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + (days + 1) * 24 * 60 * 60 * 1000);

    const result = await this.pool
      .request()
      .input('wStart', sql.DateTime2, windowStart)
      .input('wEnd', sql.DateTime2, windowEnd)
      .query<{
        member_id: string;
        total_expiring: number;
        earliest_expiry: Date;
      }>(`SELECT pl.member_id,
                 SUM(pl.delta - ISNULL((SELECT SUM(ABS(d.delta)) FROM points_ledger d
                     WHERE d.ref_ledger_id = pl.ledger_id AND d.reason_code <> 'expire' AND d.delta < 0), 0)) AS total_expiring,
                 MIN(pl.expires_at) AS earliest_expiry
          FROM points_ledger pl
          WHERE pl.delta > 0
            AND pl.expires_at >= @wStart AND pl.expires_at < @wEnd
            AND NOT EXISTS (SELECT 1 FROM points_ledger ex WHERE ex.ref_ledger_id = pl.ledger_id AND ex.reason_code = 'expire')
          GROUP BY pl.member_id
          HAVING SUM(pl.delta - ISNULL((SELECT SUM(ABS(d.delta)) FROM points_ledger d
                     WHERE d.ref_ledger_id = pl.ledger_id AND d.reason_code <> 'expire' AND d.delta < 0), 0)) > 0`);

    return result.recordset.map((r) => ({
      memberId: r.member_id,
      totalExpiringPoints: r.total_expiring,
      earliestExpiryDate: r.earliest_expiry.toISOString(),
    }));
  }

  async getLedgerEntriesWithoutExpiry(_tenantId: string): Promise<LedgerEntryRow[]> {
    const result = await this.pool
      .request()
      .query<{
        ledger_id: number;
        member_id: string;
        delta: number;
        reason_code: string;
        ref_txn_id: string | null;
        ref_ledger_id: number | null;
        balance_after: number;
        created_at: Date;
        expires_at: Date | null;
      }>(`SELECT ledger_id, member_id, delta, reason_code, ref_txn_id,
                 ref_ledger_id, balance_after, created_at, expires_at
          FROM points_ledger
          WHERE delta > 0 AND reason_code = 'earn' AND expires_at IS NULL`);
    return result.recordset.map((r) => this.mapLedgerRow(r, _tenantId));
  }

  async setExpiresAt(_tenantId: string, ledgerId: string, expiresAt: string): Promise<void> {
    // The points_ledger has an INSTEAD OF UPDATE trigger that blocks updates.
    // We need to work around this by using a direct update that avoids the trigger,
    // or we handle this differently. Since expires_at is a new column added in V13,
    // and the trigger was created in V3, we may need to alter the trigger.
    // For now, we'll attempt the update — if the trigger blocks it, this will throw.
    // In practice the backfill endpoint would need the trigger to be adjusted.
    // A pragmatic approach: try the update, catch the error, and log it.
    try {
      await this.pool
        .request()
        .input('lid', sql.BigInt, Number(ledgerId))
        .input('exp', sql.DateTime2, new Date(expiresAt))
        .query(`UPDATE points_ledger SET expires_at = @exp WHERE ledger_id = @lid`);
    } catch (err: unknown) {
      // If the append-only trigger blocks this, re-throw with context
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('append-only')) {
        throw new Error(`Cannot update expires_at on append-only ledger (ledger_id=${ledgerId}). Trigger must be modified to allow expires_at updates.`);
      }
      throw err;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  private mapLedgerRow(
    row: {
      ledger_id: number;
      member_id: string;
      delta: number;
      reason_code: string;
      ref_txn_id: string | null;
      ref_ledger_id: number | null;
      balance_after: number;
      created_at: Date;
      expires_at: Date | null;
    },
    tenantId: string,
  ): LedgerEntryRow {
    return {
      id: row.ledger_id.toString(),
      tenantId,
      memberId: row.member_id,
      transactionId: row.ref_txn_id ?? undefined,
      delta: row.delta,
      balanceAfter: row.balance_after,
      reasonCode: row.reason_code as LedgerEntryRow['reasonCode'],
      refLedgerId: row.ref_ledger_id?.toString() ?? undefined,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? undefined,
    };
  }
}
