/**
 * SQL-backed repository implementations for analytics-service.
 *
 * Tables:
 *   - analytics_daily_summary (V12)
 *   - analytics_member_cohort (V12)
 *   - members, transactions, points_ledger (for real-time KPIs and exports)
 *   - tiers (for tier distribution)
 */

import * as sql from 'mssql';
import type {
  SummaryRepository,
  CohortRepository,
  TierRepository,
  ExportRepository,
  RealtimeRepository,
} from './repositories';
import type {
  DailySummaryRow,
  CohortRow,
  MetricKey,
  TierDistributionEntry,
  ExportQuery,
} from './types';

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') return d;
  return d.toISOString();
}

// ── Summary Repository ───────────────────────────────────────────────────

export class SqlSummaryRepository implements SummaryRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async upsert(
    tenantId: string,
    row: Pick<DailySummaryRow, 'summaryDate' | 'metricKey' | 'metricValue' | 'dimensionsJson'>,
  ): Promise<void> {
    const r = this.pool.request();
    r.input('summaryDate', sql.Date, row.summaryDate)
      .input('metricKey', sql.NVarChar(100), row.metricKey)
      .input('metricValue', sql.Decimal(18, 4), row.metricValue)
      .input('dimensionsJson', sql.NVarChar(sql.MAX), row.dimensionsJson ? JSON.stringify(row.dimensionsJson) : null);

    await r.query(
      `MERGE analytics_daily_summary AS target
       USING (SELECT @summaryDate AS summary_date, @metricKey AS metric_key) AS source
         ON target.summary_date = source.summary_date AND target.metric_key = source.metric_key
       WHEN MATCHED THEN UPDATE SET metric_value = @metricValue, dimensions_json = @dimensionsJson, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (summary_date, metric_key, metric_value, dimensions_json, created_at, updated_at)
         VALUES (@summaryDate, @metricKey, @metricValue, @dimensionsJson, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    );
  }

  async increment(
    tenantId: string,
    date: string,
    metricKey: MetricKey,
    delta: number,
    dimensions?: Record<string, unknown>,
  ): Promise<void> {
    const r = this.pool.request();
    r.input('summaryDate', sql.Date, date)
      .input('metricKey', sql.NVarChar(100), metricKey)
      .input('delta', sql.Decimal(18, 4), delta)
      .input('dimensionsJson', sql.NVarChar(sql.MAX), dimensions ? JSON.stringify(dimensions) : null);

    await r.query(
      `MERGE analytics_daily_summary AS target
       USING (SELECT @summaryDate AS summary_date, @metricKey AS metric_key) AS source
         ON target.summary_date = source.summary_date AND target.metric_key = source.metric_key
       WHEN MATCHED THEN UPDATE SET metric_value = metric_value + @delta, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (summary_date, metric_key, metric_value, dimensions_json, created_at, updated_at)
         VALUES (@summaryDate, @metricKey, @delta, @dimensionsJson, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    );
  }

  async query(
    tenantId: string,
    from: string,
    to: string,
    metrics?: MetricKey[],
  ): Promise<DailySummaryRow[]> {
    const r = this.pool.request();
    r.input('from', sql.Date, from)
      .input('to', sql.Date, to);

    const conditions = ['summary_date >= @from', 'summary_date <= @to'];

    if (metrics && metrics.length > 0) {
      // Use a parameterized IN clause
      const metricParams = metrics.map((m, i) => {
        r.input(`m${i}`, sql.NVarChar(50), m);
        return `@m${i}`;
      });
      conditions.push(`metric_key IN (${metricParams.join(', ')})`);
    }

    const result = await r.query<{
      summary_date: Date | string;
      metric_key: string;
      metric_value: number;
      dimensions_json: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT summary_date, metric_key, metric_value, dimensions_json, created_at, updated_at
       FROM analytics_daily_summary WHERE ${conditions.join(' AND ')}
       ORDER BY summary_date ASC, metric_key ASC`,
    );

    const rows = result.recordset.map((raw) => ({
      summaryDate: typeof raw.summary_date === 'string' ? raw.summary_date : raw.summary_date.toISOString().slice(0, 10),
      metricKey: raw.metric_key,
      metricValue: raw.metric_value,
      dimensionsJson: raw.dimensions_json ? JSON.parse(raw.dimensions_json) : null,
      createdAt: toISOString(raw.created_at),
      updatedAt: toISOString(raw.updated_at),
    }));

    // If summary table is empty, compute on-the-fly from raw tables
    if (rows.length === 0) {
      return this.computeFromRawTables(from, to, metrics);
    }
    return rows;
  }

  private async computeFromRawTables(from: string, to: string, metrics?: MetricKey[]): Promise<DailySummaryRow[]> {
    const results: DailySummaryRow[] = [];
    const now = toISOString(new Date());
    const wantAll = !metrics || metrics.length === 0;

    if (wantAll || metrics?.includes('enrollments')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; cnt: number }>(
          `SELECT CAST(enrolled_at AS DATE) AS d, COUNT(*) AS cnt FROM members WHERE is_deleted = 0 AND enrolled_at >= @from AND enrolled_at <= @to GROUP BY CAST(enrolled_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'enrollments', metricValue: row.cnt, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }
    if (wantAll || metrics?.includes('transactions')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; cnt: number }>(
          `SELECT CAST(occurred_at AS DATE) AS d, COUNT(*) AS cnt FROM transactions WHERE status = 'posted' AND occurred_at >= @from AND occurred_at <= @to GROUP BY CAST(occurred_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'transactions', metricValue: row.cnt, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }
    if (wantAll || metrics?.includes('total_spend')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; total: number }>(
          `SELECT CAST(occurred_at AS DATE) AS d, SUM(amount) AS total FROM transactions WHERE status = 'posted' AND occurred_at >= @from AND occurred_at <= @to GROUP BY CAST(occurred_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'total_spend', metricValue: row.total, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }
    if (wantAll || metrics?.includes('points_issued')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; total: number }>(
          `SELECT CAST(created_at AS DATE) AS d, SUM(delta) AS total FROM points_ledger WHERE reason_code = 'earn' AND created_at >= @from AND created_at <= @to GROUP BY CAST(created_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'points_issued', metricValue: row.total, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }
    if (wantAll || metrics?.includes('points_redeemed')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; total: number }>(
          `SELECT CAST(created_at AS DATE) AS d, SUM(ABS(delta)) AS total FROM points_ledger WHERE reason_code = 'redeem' AND created_at >= @from AND created_at <= @to GROUP BY CAST(created_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'points_redeemed', metricValue: row.total, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }
    if (wantAll || metrics?.includes('points_expired')) {
      const r = await this.pool.request()
        .input('from', sql.Date, from).input('to', sql.Date, to)
        .query<{ d: Date; total: number }>(
          `SELECT CAST(created_at AS DATE) AS d, SUM(ABS(delta)) AS total FROM points_ledger WHERE reason_code = 'expire' AND created_at >= @from AND created_at <= @to GROUP BY CAST(created_at AS DATE)`
        );
      for (const row of r.recordset) {
        results.push({ summaryDate: toISOString(row.d).slice(0, 10), metricKey: 'points_expired', metricValue: row.total, dimensionsJson: null, createdAt: now, updatedAt: now });
      }
    }

    return results.sort((a, b) => a.summaryDate.localeCompare(b.summaryDate) || a.metricKey.localeCompare(b.metricKey));
  }
}

// ── Cohort Repository ────────────────────────────────────────────────────

export class SqlCohortRepository implements CohortRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async upsert(
    tenantId: string,
    row: Pick<CohortRow, 'cohortMonth' | 'daysSinceEnroll' | 'activeCount' | 'totalCount'>,
  ): Promise<void> {
    const r = this.pool.request();
    r.input('cohortMonth', sql.Date, row.cohortMonth)
      .input('daysSinceEnroll', sql.Int, row.daysSinceEnroll)
      .input('activeCount', sql.Int, row.activeCount)
      .input('totalCount', sql.Int, row.totalCount);

    await r.query(
      `MERGE analytics_member_cohort AS target
       USING (SELECT @cohortMonth AS cohort_month, @daysSinceEnroll AS days_since_enroll) AS source
         ON target.cohort_month = source.cohort_month AND target.days_since_enroll = source.days_since_enroll
       WHEN MATCHED THEN UPDATE SET active_count = @activeCount, total_count = @totalCount, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (cohort_month, days_since_enroll, active_count, total_count, updated_at)
         VALUES (@cohortMonth, @daysSinceEnroll, @activeCount, @totalCount, SYSUTCDATETIME());`,
    );
  }

  async query(tenantId: string, from?: string, to?: string): Promise<CohortRow[]> {
    const r = this.pool.request();
    const conditions: string[] = [];

    if (from) {
      r.input('from', sql.Date, from);
      conditions.push('cohort_month >= @from');
    }
    if (to) {
      r.input('to', sql.Date, to);
      conditions.push('cohort_month <= @to');
    }

    const result = await r.query<{
      cohort_month: Date | string;
      days_since_enroll: number;
      active_count: number;
      total_count: number;
      retention_rate: number | null;
      updated_at: Date;
    }>(
      `SELECT cohort_month, days_since_enroll, active_count, total_count, retention_rate, updated_at
       FROM analytics_member_cohort ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY cohort_month ASC, days_since_enroll ASC`,
    );

    return result.recordset.map((raw) => ({
      cohortMonth: typeof raw.cohort_month === 'string' ? raw.cohort_month : raw.cohort_month.toISOString().slice(0, 10),
      daysSinceEnroll: raw.days_since_enroll,
      activeCount: raw.active_count,
      totalCount: raw.total_count,
      retentionRate: raw.retention_rate,
      updatedAt: toISOString(raw.updated_at),
    }));
  }
}

// ── Tier Repository (real-time from members + tiers tables) ──────────────

export class SqlTierRepository implements TierRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async getDistribution(tenantId: string): Promise<TierDistributionEntry[]> {
    const r = this.pool.request();

    const result = await r.query<{
      tier_id: string;
      tier_name: string;
      member_count: number;
    }>(
      `SELECT t.tier_id, t.name AS tier_name, COUNT(m.member_id) AS member_count
       FROM tiers t
       LEFT JOIN members m ON m.tier_id = t.tier_id AND m.is_deleted = 0 AND m.status = 'active'
       WHERE t.is_active = 1
       GROUP BY t.tier_id, t.name, t.sort_order
       ORDER BY t.sort_order ASC`,
    );

    const totalMembers = result.recordset.reduce((sum, r) => sum + r.member_count, 0);
    return result.recordset.map((raw) => ({
      tierId: raw.tier_id,
      tierName: raw.tier_name,
      memberCount: raw.member_count,
      percentage: totalMembers > 0 ? Math.round((raw.member_count / totalMembers) * 10000) / 100 : 0,
    }));
  }
}

// ── Export Repository (streams from raw tables) ──────────────────────────

export class SqlExportRepository implements ExportRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async *stream(tenantId: string, query: ExportQuery): AsyncIterable<Record<string, unknown>> {
    const r = this.pool.request();
    r.input('tenantId', sql.UniqueIdentifier, tenantId);

    let sqlQuery: string;
    const conditions: string[] = [];

    switch (query.entity) {
      case 'members':
        conditions.push('is_deleted = 0');
        if (query.since) {
          r.input('since', sql.DateTime2, new Date(query.since));
          conditions.push('enrolled_at >= @since');
        }
        sqlQuery = `SELECT member_id AS id, first_name AS firstName, last_name AS lastName,
                           status, tier_id AS tierId, enrolled_at AS enrolledAt
                    FROM members WHERE ${conditions.join(' AND ')}
                    ORDER BY enrolled_at DESC`;
        break;

      case 'transactions':
        if (query.since) {
          r.input('since', sql.DateTime2, new Date(query.since));
          conditions.push('created_at >= @since');
        }
        sqlQuery = `SELECT transaction_id AS id, member_id AS memberId, amount_cents AS amountCents,
                           channel, created_at AS createdAt
                    FROM transactions ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
                    ORDER BY created_at DESC`;
        break;

      case 'ledger':
        if (query.since) {
          r.input('since', sql.DateTime2, new Date(query.since));
          conditions.push('created_at >= @since');
        }
        sqlQuery = `SELECT ledger_id AS id, member_id AS memberId, delta,
                           balance_after AS balanceAfter, reason_code AS reason, created_at AS createdAt
                    FROM points_ledger ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
                    ORDER BY created_at DESC`;
        break;

      case 'redemptions':
        if (query.since) {
          r.input('since', sql.DateTime2, new Date(query.since));
          conditions.push('redeemed_at >= @since');
        }
        sqlQuery = `SELECT redemption_id AS id, member_id AS memberId, offer_id AS offerId,
                           points_used AS pointsUsed, redeemed_at AS redeemedAt
                    FROM redemptions ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
                    ORDER BY redeemed_at DESC`;
        break;

      default:
        throw new Error(`Unknown export entity: ${query.entity}`);
    }

    if (query.limit) {
      r.input('limit', sql.Int, query.limit);
      sqlQuery = sqlQuery.replace(/^SELECT /, 'SELECT TOP (@limit) ');
    }

    const result = await r.query<Record<string, unknown>>(sqlQuery);
    for (const row of result.recordset) {
      // Convert Date objects to ISO strings for serialization
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        cleaned[k] = v instanceof Date ? v.toISOString() : v;
      }
      yield cleaned;
    }
  }
}

// ── Realtime Repository ──────────────────────────────────────────────────

export class SqlRealtimeRepository implements RealtimeRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async getKpis(tenantId: string, date: string): Promise<{
    activeMembersToday: number;
    transactionsToday: number;
    pointsIssuedToday: number;
    redemptionsToday: number;
  }> {
    const r = this.pool.request();
    r.input('date', sql.Date, date);

    // Pull from the daily summary if available, else compute from raw tables
    const summaryResult = await r.query<{ metric_key: string; metric_value: number }>(
      `SELECT metric_key, metric_value FROM analytics_daily_summary
       WHERE summary_date = @date
         AND metric_key IN ('active_members', 'transactions', 'points_issued', 'redemptions')`,
    );

    const kpis: Record<string, number> = {};
    for (const row of summaryResult.recordset) {
      kpis[row.metric_key] = row.metric_value;
    }

    // If summary table has data, use it
    if (summaryResult.recordset.length > 0) {
      return {
        activeMembersToday: kpis['active_members'] ?? 0,
        transactionsToday: kpis['transactions'] ?? 0,
        pointsIssuedToday: kpis['points_issued'] ?? 0,
        redemptionsToday: kpis['redemptions'] ?? 0,
      };
    }

    // Fallback: compute from raw tables
    const r2 = this.pool.request().input('date', sql.Date, date);
    const raw = await r2.query<{ txn: number; pts: number; members: number; redemptions: number }>(
      `SELECT
         (SELECT COUNT(*) FROM transactions WHERE status = 'posted' AND CAST(occurred_at AS DATE) = @date) AS txn,
         (SELECT COALESCE(SUM(delta), 0) FROM points_ledger WHERE reason_code = 'earn' AND CAST(created_at AS DATE) = @date) AS pts,
         (SELECT COUNT(DISTINCT member_id) FROM transactions WHERE status = 'posted' AND CAST(occurred_at AS DATE) = @date) AS members,
         (SELECT COUNT(*) FROM redemptions WHERE status = 'completed' AND CAST(redeemed_at AS DATE) = @date) AS redemptions`
    );
    const row = raw.recordset[0];
    return {
      activeMembersToday: row?.members ?? 0,
      transactionsToday: row?.txn ?? 0,
      pointsIssuedToday: row?.pts ?? 0,
      redemptionsToday: row?.redemptions ?? 0,
    };
  }

  async incrementCounter(tenantId: string, date: string, metric: string, delta: number): Promise<void> {
    // Delegate to the summary table via MERGE
    const r = this.pool.request();
    r.input('date', sql.Date, date)
      .input('metric', sql.NVarChar(100), metric)
      .input('delta', sql.Decimal(18, 4), delta);

    await r.query(
      `MERGE analytics_daily_summary AS target
       USING (SELECT @date AS summary_date, @metric AS metric_key) AS source
         ON target.summary_date = source.summary_date AND target.metric_key = source.metric_key
       WHEN MATCHED THEN UPDATE SET metric_value = metric_value + @delta, updated_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (summary_date, metric_key, metric_value, created_at, updated_at)
         VALUES (@date, @metric, @delta, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    );
  }
}
