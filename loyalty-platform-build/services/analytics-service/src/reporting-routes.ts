/**
 * Analytics Service — Reporting route handlers
 *
 * Finance reports: liability, points flow, redemption reserve, revenue attribution
 * Marketing reports: engagement funnel, at-risk members, tier distribution, offer performance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '@loyalty/shared-errors';
import * as sql from 'mssql';

// ── Types ─────────────────────────────────────────────────────────────────

export interface LiabilityReport {
  reportDate: string;
  activeMembers: number;
  totalOutstandingPoints: number;
  estimatedLiabilityUsd: number;
  estimatedBreakagePoints: number;
  netLiabilityUsd: number;
  breakageRate: number;
  costPerPoint: number;
}

export interface PointsFlowPeriod {
  date: string;
  pointsIssued: number;
  pointsRedeemed: number;
  pointsExpired: number;
  pointsVoided: number;
  netChange: number;
  cumulativeBalance: number;
}

export interface RedemptionReservePeriod {
  year: number;
  month: number;
  redemptionCount: number;
  totalPointsRedeemed: number;
  totalDiscountValue: number;
  avgDiscountPerRedemption: number;
  costPerPoint: number;
}

export interface RevenueAttributionPeriod {
  date: string;
  totalTransactions: number;
  totalSpend: number;
  avgBasket: number;
  uniqueMembers: number;
  spendPerMember: number;
}

export interface EngagementFunnel {
  totalEnrolled: number;
  madeFirstPurchase: number;
  repeatPurchasers: number;
  frequentPurchasers: number;
  tierUpgradedMembers: number;
  redeemedMembers: number;
  conversionRates: {
    enrollToFirst: number;
    firstToRepeat: number;
    repeatToFrequent: number;
    enrollToRedeem: number;
  };
}

export interface AtRiskMember {
  memberId: string;
  firstName: string;
  lastName: string;
  tier: string;
  pointsBalance: number;
  lastTransactionDate: string | null;
  daysInactive: number;
}

export interface TierDistItem {
  tierId: string;
  name: string;
  memberCount: number;
  percentage: number;
}

export interface OfferPerformanceItem {
  offerId: string;
  name: string;
  type: string;
  impressions: number;
  redemptions: number;
  redemptionRate: number;
  revenueGenerated: number;
  costPerRedemption: number;
}

export interface VisitAnalyticsReport {
  totalTransactions: number;
  qualifiedVisits: number;
  unqualifiedTransactions: number;
  visitConversionRate: number;
  uniqueVisitors: number;
  avgVisitsPerMember: number;
  avgSpendPerVisit: number;
  totalPointsAwarded: number;
  dailyBreakdown: Array<{
    date: string;
    transactions: number;
    qualifiedVisits: number;
    pointsAwarded: number;
  }>;
}

// ── Repository interface ──────────────────────────────────────────────────

export interface ReportingRepository {
  getLiability(): Promise<LiabilityReport>;
  getPointsFlow(from: string, to: string, groupBy: 'day' | 'week' | 'month'): Promise<PointsFlowPeriod[]>;
  getRedemptionReserve(from: string, to: string): Promise<RedemptionReservePeriod[]>;
  getRevenueAttribution(from: string, to: string): Promise<RevenueAttributionPeriod[]>;
  getEngagementFunnel(): Promise<EngagementFunnel>;
  getAtRiskMembers(daysInactive: number, minBalance: number, limit: number): Promise<{ items: AtRiskMember[]; total: number }>;
  getTierDistribution(): Promise<TierDistItem[]>;
  getOfferPerformance(from: string, to: string): Promise<OfferPerformanceItem[]>;
  getVisitAnalytics(from: string, to: string): Promise<VisitAnalyticsReport>;
}

// ── SQL Implementation ────────────────────────────────────────────────────

export class SqlReportingRepository implements ReportingRepository {
  constructor(private readonly pool: sql.ConnectionPool) {}

  async getLiability(): Promise<LiabilityReport> {
    const r = this.pool.request();
    const result = await r.query(
      `SELECT report_date, active_members, total_outstanding_points,
              estimated_liability_usd, estimated_breakage_points, net_liability_usd
       FROM v_points_liability`
    );
    const row = result.recordset[0];
    if (!row) {
      return {
        reportDate: new Date().toISOString().slice(0, 10),
        activeMembers: 0,
        totalOutstandingPoints: 0,
        estimatedLiabilityUsd: 0,
        estimatedBreakagePoints: 0,
        netLiabilityUsd: 0,
        breakageRate: 0.25,
        costPerPoint: 0.01,
      };
    }
    return {
      reportDate: row.report_date instanceof Date ? row.report_date.toISOString().slice(0, 10) : String(row.report_date),
      activeMembers: row.active_members ?? 0,
      totalOutstandingPoints: row.total_outstanding_points ?? 0,
      estimatedLiabilityUsd: parseFloat(Number(row.estimated_liability_usd ?? 0).toFixed(2)),
      estimatedBreakagePoints: row.estimated_breakage_points ?? 0,
      netLiabilityUsd: parseFloat(Number(row.net_liability_usd ?? 0).toFixed(2)),
      breakageRate: 0.25,
      costPerPoint: 0.01,
    };
  }

  async getPointsFlow(from: string, to: string, groupBy: 'day' | 'week' | 'month'): Promise<PointsFlowPeriod[]> {
    const r = this.pool.request();
    r.input('from', sql.Date, from).input('to', sql.Date, to);

    let dateExpr: string;
    switch (groupBy) {
      case 'week':
        dateExpr = 'DATEADD(DAY, -DATEPART(WEEKDAY, period_date) + 1, period_date)';
        break;
      case 'month':
        dateExpr = 'DATEFROMPARTS(YEAR(period_date), MONTH(period_date), 1)';
        break;
      default:
        dateExpr = 'period_date';
    }

    const result = await r.query(
      `SELECT ${dateExpr} AS grouped_date,
              SUM(points_issued) AS points_issued,
              SUM(points_redeemed) AS points_redeemed,
              SUM(points_expired) AS points_expired,
              SUM(points_voided) AS points_voided
       FROM v_points_flow_daily
       WHERE period_date >= @from AND period_date <= @to
       GROUP BY ${dateExpr}
       ORDER BY grouped_date ASC`
    );

    let cumulative = 0;
    return result.recordset.map((row: any) => {
      const issued = row.points_issued ?? 0;
      const redeemed = row.points_redeemed ?? 0;
      const expired = row.points_expired ?? 0;
      const voided = row.points_voided ?? 0;
      const net = issued - redeemed - expired - voided;
      cumulative += net;
      return {
        date: row.grouped_date instanceof Date ? row.grouped_date.toISOString().slice(0, 10) : String(row.grouped_date).slice(0, 10),
        pointsIssued: issued,
        pointsRedeemed: redeemed,
        pointsExpired: expired,
        pointsVoided: voided,
        netChange: net,
        cumulativeBalance: cumulative,
      };
    });
  }

  async getRedemptionReserve(from: string, to: string): Promise<RedemptionReservePeriod[]> {
    const r = this.pool.request();
    // Parse year/month from from/to
    const fromDate = new Date(from);
    const toDate = new Date(to);
    r.input('fromYear', sql.Int, fromDate.getFullYear())
      .input('fromMonth', sql.Int, fromDate.getMonth() + 1)
      .input('toYear', sql.Int, toDate.getFullYear())
      .input('toMonth', sql.Int, toDate.getMonth() + 1);

    const result = await r.query(
      `SELECT yr, mo, redemption_count, total_points_redeemed,
              total_discount_value_usd, avg_discount_per_redemption, cost_per_point_redeemed
       FROM v_redemption_reserve_monthly
       WHERE (yr * 100 + mo) >= (@fromYear * 100 + @fromMonth)
         AND (yr * 100 + mo) <= (@toYear * 100 + @toMonth)
       ORDER BY yr, mo`
    );

    return result.recordset.map((row: any) => ({
      year: row.yr,
      month: row.mo,
      redemptionCount: row.redemption_count ?? 0,
      totalPointsRedeemed: row.total_points_redeemed ?? 0,
      totalDiscountValue: parseFloat(Number(row.total_discount_value_usd ?? 0).toFixed(2)),
      avgDiscountPerRedemption: parseFloat(Number(row.avg_discount_per_redemption ?? 0).toFixed(2)),
      costPerPoint: parseFloat(Number(row.cost_per_point_redeemed ?? 0.01).toFixed(4)),
    }));
  }

  async getRevenueAttribution(from: string, to: string): Promise<RevenueAttributionPeriod[]> {
    const r = this.pool.request();
    r.input('from', sql.Date, from).input('to', sql.Date, to);

    const result = await r.query(
      `SELECT txn_date, total_transactions, total_spend_cents, avg_basket_cents,
              unique_members_transacted, spend_per_member_cents
       FROM v_revenue_attribution
       WHERE txn_date >= @from AND txn_date <= @to
       ORDER BY txn_date ASC`
    );

    return result.recordset.map((row: any) => ({
      date: row.txn_date instanceof Date ? row.txn_date.toISOString().slice(0, 10) : String(row.txn_date).slice(0, 10),
      totalTransactions: row.total_transactions ?? 0,
      totalSpend: row.total_spend_cents ?? 0,
      avgBasket: parseFloat(Number(row.avg_basket_cents ?? 0).toFixed(0)),
      uniqueMembers: row.unique_members_transacted ?? 0,
      spendPerMember: parseFloat(Number(row.spend_per_member_cents ?? 0).toFixed(0)),
    }));
  }

  async getEngagementFunnel(): Promise<EngagementFunnel> {
    const r = this.pool.request();
    const result = await r.query(
      `SELECT total_enrolled, made_first_purchase, repeat_purchasers,
              frequent_purchasers, tier_upgraded_members, redeemed_members
       FROM v_engagement_funnel`
    );
    const row = result.recordset[0];
    if (!row) {
      return {
        totalEnrolled: 0, madeFirstPurchase: 0, repeatPurchasers: 0,
        frequentPurchasers: 0, tierUpgradedMembers: 0, redeemedMembers: 0,
        conversionRates: { enrollToFirst: 0, firstToRepeat: 0, repeatToFrequent: 0, enrollToRedeem: 0 },
      };
    }
    const te = row.total_enrolled ?? 0;
    const fp = row.made_first_purchase ?? 0;
    const rp = row.repeat_purchasers ?? 0;
    const fq = row.frequent_purchasers ?? 0;
    const rm = row.redeemed_members ?? 0;
    return {
      totalEnrolled: te,
      madeFirstPurchase: fp,
      repeatPurchasers: rp,
      frequentPurchasers: fq,
      tierUpgradedMembers: row.tier_upgraded_members ?? 0,
      redeemedMembers: rm,
      conversionRates: {
        enrollToFirst: te > 0 ? parseFloat((fp / te * 100).toFixed(1)) : 0,
        firstToRepeat: fp > 0 ? parseFloat((rp / fp * 100).toFixed(1)) : 0,
        repeatToFrequent: rp > 0 ? parseFloat((fq / rp * 100).toFixed(1)) : 0,
        enrollToRedeem: te > 0 ? parseFloat((rm / te * 100).toFixed(1)) : 0,
      },
    };
  }

  async getAtRiskMembers(daysInactive: number, minBalance: number, limit: number): Promise<{ items: AtRiskMember[]; total: number }> {
    const r = this.pool.request();
    r.input('daysInactive', sql.Int, daysInactive)
      .input('minBalance', sql.Int, minBalance)
      .input('limit', sql.Int, limit);

    // Get total count
    const countResult = await this.pool.request()
      .input('daysInactive2', sql.Int, daysInactive)
      .input('minBalance2', sql.Int, minBalance)
      .query(
        `SELECT COUNT(*) AS total FROM v_at_risk_members
         WHERE (days_inactive >= @daysInactive2 OR days_inactive IS NULL)
           AND points_balance >= @minBalance2`
      );

    const result = await r.query(
      `SELECT TOP (@limit) member_id, first_name, last_name, tier_name,
              points_balance, last_transaction_date, days_inactive
       FROM v_at_risk_members
       WHERE (days_inactive >= @daysInactive OR days_inactive IS NULL)
         AND points_balance >= @minBalance
       ORDER BY days_inactive DESC`
    );

    return {
      items: result.recordset.map((row: any) => ({
        memberId: row.member_id,
        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',
        tier: row.tier_name ?? 'Base',
        pointsBalance: row.points_balance ?? 0,
        lastTransactionDate: row.last_transaction_date
          ? (row.last_transaction_date instanceof Date ? row.last_transaction_date.toISOString() : String(row.last_transaction_date))
          : null,
        daysInactive: row.days_inactive ?? 999,
      })),
      total: countResult.recordset[0]?.total ?? 0,
    };
  }

  async getTierDistribution(): Promise<TierDistItem[]> {
    const r = this.pool.request();
    const result = await r.query(
      `SELECT tier_id, tier_name, member_count, percentage
       FROM v_tier_distribution
       ORDER BY sort_order ASC`
    );
    return result.recordset.map((row: any) => ({
      tierId: row.tier_id,
      name: row.tier_name,
      memberCount: row.member_count ?? 0,
      percentage: parseFloat(Number(row.percentage ?? 0).toFixed(2)),
    }));
  }

  async getVisitAnalytics(from: string, to: string): Promise<VisitAnalyticsReport> {
    const r = this.pool.request();
    r.input('from', sql.Date, from).input('to', sql.Date, to);

    // Get min spend from program config
    const configResult = await this.pool.request().query(
      `SELECT TOP 1 visit_min_spend_cents FROM program_config WHERE id = 1`
    );
    const minSpend = configResult.recordset[0]?.visit_min_spend_cents ?? 0;

    // Get points per visit from program config
    const ptsResult = await this.pool.request().query(
      `SELECT TOP 1 points_per_visit FROM program_config WHERE id = 1`
    );
    const pointsPerVisit = ptsResult.recordset[0]?.points_per_visit ?? 10;

    r.input('minSpend', sql.Int, minSpend);

    const result = await r.query(
      `SELECT
        CAST(t.occurred_at AS DATE) AS visit_date,
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN t.amount >= @minSpend THEN 1 ELSE 0 END) AS qualified_visits,
        SUM(CASE WHEN t.amount >= @minSpend THEN t.amount ELSE 0 END) AS qualified_spend,
        COUNT(DISTINCT t.member_id) AS unique_visitors
       FROM transactions t
       WHERE t.status = 'posted' AND t.occurred_at >= @from AND t.occurred_at <= @to
       GROUP BY CAST(t.occurred_at AS DATE)
       ORDER BY visit_date ASC`
    );

    const dailyBreakdown = result.recordset.map((row: any) => ({
      date: row.visit_date instanceof Date ? row.visit_date.toISOString().slice(0, 10) : String(row.visit_date).slice(0, 10),
      transactions: row.total_transactions ?? 0,
      qualifiedVisits: row.qualified_visits ?? 0,
      pointsAwarded: (row.qualified_visits ?? 0) * pointsPerVisit,
    }));

    const totalTransactions = dailyBreakdown.reduce((s, d) => s + d.transactions, 0);
    const qualifiedVisits = dailyBreakdown.reduce((s, d) => s + d.qualifiedVisits, 0);
    const totalPointsAwarded = dailyBreakdown.reduce((s, d) => s + d.pointsAwarded, 0);
    const totalQualifiedSpend = result.recordset.reduce((s: number, row: any) => s + (row.qualified_spend ?? 0), 0);
    const uniqueVisitors = result.recordset.reduce((s: number, row: any) => s + (row.unique_visitors ?? 0), 0);
    // Deduplicate across days would need a separate query; use sum as approximation
    const uniqueVisitorsDistinct = Math.max(uniqueVisitors, 1);

    return {
      totalTransactions,
      qualifiedVisits,
      unqualifiedTransactions: totalTransactions - qualifiedVisits,
      visitConversionRate: totalTransactions > 0 ? parseFloat((qualifiedVisits / totalTransactions).toFixed(4)) : 0,
      uniqueVisitors: uniqueVisitorsDistinct,
      avgVisitsPerMember: uniqueVisitorsDistinct > 0 ? parseFloat((qualifiedVisits / uniqueVisitorsDistinct).toFixed(2)) : 0,
      avgSpendPerVisit: qualifiedVisits > 0 ? Math.round(totalQualifiedSpend / qualifiedVisits) : 0,
      totalPointsAwarded,
      dailyBreakdown,
    };
  }

  async getOfferPerformance(from: string, to: string): Promise<OfferPerformanceItem[]> {
    const r = this.pool.request();
    r.input('from', sql.Date, from).input('to', sql.Date, to);

    // Query from offers + redemptions tables directly (no dedicated view needed)
    const result = await r.query(
      `SELECT o.offer_id, o.name, o.type,
              0 AS impressions,
              COUNT(rd.redemption_id) AS redemptions,
              SUM(ISNULL(rd.points_used, 0)) AS total_points,
              SUM(ISNULL(rd.discount_value, 0)) AS total_discount
       FROM offers o
       LEFT JOIN redemptions rd ON rd.offer_id = o.offer_id
         AND rd.status = 'completed'
         AND rd.redeemed_at >= @from AND rd.redeemed_at <= @to
       WHERE o.is_active = 1
       GROUP BY o.offer_id, o.name, o.type
       ORDER BY COUNT(rd.redemption_id) DESC`
    );

    return result.recordset.map((row: any) => {
      const redemptions = row.redemptions ?? 0;
      const totalDiscount = row.total_discount ?? 0;
      return {
        offerId: row.offer_id,
        name: row.name ?? '',
        type: row.type ?? '',
        impressions: row.impressions ?? 0,
        redemptions,
        redemptionRate: 0, // impressions not tracked yet
        revenueGenerated: 0, // would need transaction linkage
        costPerRedemption: redemptions > 0 ? parseFloat((totalDiscount / redemptions).toFixed(2)) : 0,
      };
    });
  }
}

// ── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryReportingRepository implements ReportingRepository {
  async getLiability(): Promise<LiabilityReport> {
    return {
      reportDate: new Date().toISOString().slice(0, 10),
      activeMembers: 15,
      totalOutstandingPoints: 12450,
      estimatedLiabilityUsd: 124.50,
      estimatedBreakagePoints: 3112,
      netLiabilityUsd: 93.38,
      breakageRate: 0.25,
      costPerPoint: 0.01,
    };
  }

  async getPointsFlow(_from: string, _to: string, _groupBy: 'day' | 'week' | 'month'): Promise<PointsFlowPeriod[]> {
    return [
      { date: '2026-04-01', pointsIssued: 500, pointsRedeemed: 100, pointsExpired: 0, pointsVoided: 0, netChange: 400, cumulativeBalance: 400 },
      { date: '2026-04-08', pointsIssued: 300, pointsRedeemed: 50, pointsExpired: 10, pointsVoided: 0, netChange: 240, cumulativeBalance: 640 },
      { date: '2026-04-15', pointsIssued: 450, pointsRedeemed: 200, pointsExpired: 0, pointsVoided: 0, netChange: 250, cumulativeBalance: 890 },
    ];
  }

  async getRedemptionReserve(_from: string, _to: string): Promise<RedemptionReservePeriod[]> {
    return [
      { year: 2026, month: 1, redemptionCount: 5, totalPointsRedeemed: 500, totalDiscountValue: 5.00, avgDiscountPerRedemption: 1.00, costPerPoint: 0.01 },
      { year: 2026, month: 2, redemptionCount: 8, totalPointsRedeemed: 950, totalDiscountValue: 9.50, avgDiscountPerRedemption: 1.19, costPerPoint: 0.01 },
      { year: 2026, month: 3, redemptionCount: 12, totalPointsRedeemed: 1200, totalDiscountValue: 12.00, avgDiscountPerRedemption: 1.00, costPerPoint: 0.01 },
    ];
  }

  async getRevenueAttribution(_from: string, _to: string): Promise<RevenueAttributionPeriod[]> {
    return [
      { date: '2026-04-01', totalTransactions: 25, totalSpend: 125000, avgBasket: 5000, uniqueMembers: 10, spendPerMember: 12500 },
      { date: '2026-04-08', totalTransactions: 30, totalSpend: 150000, avgBasket: 5000, uniqueMembers: 12, spendPerMember: 12500 },
    ];
  }

  async getEngagementFunnel(): Promise<EngagementFunnel> {
    return {
      totalEnrolled: 100,
      madeFirstPurchase: 65,
      repeatPurchasers: 30,
      frequentPurchasers: 10,
      tierUpgradedMembers: 8,
      redeemedMembers: 20,
      conversionRates: {
        enrollToFirst: 65.0,
        firstToRepeat: 46.2,
        repeatToFrequent: 33.3,
        enrollToRedeem: 20.0,
      },
    };
  }

  async getAtRiskMembers(_daysInactive: number, _minBalance: number, _limit: number): Promise<{ items: AtRiskMember[]; total: number }> {
    return {
      items: [
        { memberId: 'm-1', firstName: 'Alice', lastName: 'Smith', tier: 'Silver', pointsBalance: 500, lastTransactionDate: '2026-01-15T00:00:00Z', daysInactive: 91 },
        { memberId: 'm-2', firstName: 'Bob', lastName: 'Jones', tier: 'Bronze', pointsBalance: 120, lastTransactionDate: '2026-02-20T00:00:00Z', daysInactive: 55 },
      ],
      total: 2,
    };
  }

  async getTierDistribution(): Promise<TierDistItem[]> {
    return [
      { tierId: 'bronze', name: 'Bronze', memberCount: 500, percentage: 50.0 },
      { tierId: 'silver', name: 'Silver', memberCount: 300, percentage: 30.0 },
      { tierId: 'gold', name: 'Gold', memberCount: 150, percentage: 15.0 },
      { tierId: 'platinum', name: 'Platinum', memberCount: 50, percentage: 5.0 },
    ];
  }

  async getVisitAnalytics(_from: string, _to: string): Promise<VisitAnalyticsReport> {
    const dailyBreakdown = [
      { date: '2026-04-18', transactions: 30, qualifiedVisits: 25, pointsAwarded: 250 },
      { date: '2026-04-19', transactions: 45, qualifiedVisits: 38, pointsAwarded: 380 },
      { date: '2026-04-20', transactions: 40, qualifiedVisits: 32, pointsAwarded: 320 },
      { date: '2026-04-21', transactions: 35, qualifiedVisits: 25, pointsAwarded: 250 },
    ];
    const totalTransactions = dailyBreakdown.reduce((s, d) => s + d.transactions, 0);
    const qualifiedVisits = dailyBreakdown.reduce((s, d) => s + d.qualifiedVisits, 0);
    return {
      totalTransactions,
      qualifiedVisits,
      unqualifiedTransactions: totalTransactions - qualifiedVisits,
      visitConversionRate: parseFloat((qualifiedVisits / totalTransactions).toFixed(4)),
      uniqueVisitors: 45,
      avgVisitsPerMember: 2.67,
      avgSpendPerVisit: 850,
      totalPointsAwarded: dailyBreakdown.reduce((s, d) => s + d.pointsAwarded, 0),
      dailyBreakdown,
    };
  }

  async getOfferPerformance(_from: string, _to: string): Promise<OfferPerformanceItem[]> {
    return [
      { offerId: 'offer-1', name: '10% Off Purchase', type: 'percentage', impressions: 500, redemptions: 25, redemptionRate: 5.0, revenueGenerated: 2500, costPerRedemption: 3.50 },
      { offerId: 'offer-2', name: 'Bonus 50 Points', type: 'bonus_points', impressions: 300, redemptions: 60, redemptionRate: 20.0, revenueGenerated: 0, costPerRedemption: 0.50 },
    ];
  }
}

// ── Route Builder ─────────────────────────────────────────────────────────

export interface ReportingRouteDeps {
  reportingRepo: ReportingRepository;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const groupBySchema = z.enum(['day', 'week', 'month']).default('day');

export function buildReportingRoutes(deps: ReportingRouteDeps): Router {
  const router = Router();

  // ── Points Liability ──────────────────────────────────────────────────
  router.get('/v1/analytics/reports/liability', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await deps.reportingRepo.getLiability();
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  // ── Points Flow ───────────────────────────────────────────────────────
  router.get('/v1/analytics/reports/points-flow', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);
      const groupBy = groupBySchema.parse(req.query.groupBy ?? 'day') as 'day' | 'week' | 'month';

      const periods = await deps.reportingRepo.getPointsFlow(from, to, groupBy);
      res.json({ periods });
    } catch (err) {
      next(err);
    }
  });

  // ── Redemption Reserve ────────────────────────────────────────────────
  router.get('/v1/analytics/reports/redemption-reserve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);

      const periods = await deps.reportingRepo.getRedemptionReserve(from, to);
      const totals = {
        redemptionCount: periods.reduce((s, p) => s + p.redemptionCount, 0),
        totalPointsRedeemed: periods.reduce((s, p) => s + p.totalPointsRedeemed, 0),
        totalDiscountValue: parseFloat(periods.reduce((s, p) => s + p.totalDiscountValue, 0).toFixed(2)),
        avgCostPerPoint: periods.length > 0
          ? parseFloat((periods.reduce((s, p) => s + p.costPerPoint, 0) / periods.length).toFixed(4))
          : 0.01,
      };

      res.json({ periods, totals });
    } catch (err) {
      next(err);
    }
  });

  // ── Revenue Attribution ───────────────────────────────────────────────
  router.get('/v1/analytics/reports/revenue-attribution', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);

      const periods = await deps.reportingRepo.getRevenueAttribution(from, to);
      const totalRevenue = periods.reduce((s, p) => s + p.totalSpend, 0);
      const totalMembers = periods.reduce((s, p) => s + p.uniqueMembers, 0);
      const totalTxns = periods.reduce((s, p) => s + p.totalTransactions, 0);

      res.json({
        periods,
        summary: {
          avgBasketOverall: totalTxns > 0 ? parseFloat((totalRevenue / totalTxns).toFixed(0)) : 0,
          totalRevenue,
          revenuePerMember: totalMembers > 0 ? parseFloat((totalRevenue / totalMembers).toFixed(0)) : 0,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Engagement Funnel ─────────────────────────────────────────────────
  router.get('/v1/analytics/reports/engagement-funnel', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const funnel = await deps.reportingRepo.getEngagementFunnel();
      res.json(funnel);
    } catch (err) {
      next(err);
    }
  });

  // ── At-Risk Members ───────────────────────────────────────────────────
  router.get('/v1/analytics/reports/at-risk-members', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const daysInactive = parseInt(req.query.daysInactive as string, 10) || 60;
      const minBalance = parseInt(req.query.minBalance as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const result = await deps.reportingRepo.getAtRiskMembers(daysInactive, minBalance, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── Tier Distribution ─────────────────────────────────────────────────
  router.get('/v1/analytics/reports/tier-distribution', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tiers = await deps.reportingRepo.getTierDistribution();
      res.json({ tiers });
    } catch (err) {
      next(err);
    }
  });

  // ── Visit Analytics ──────────────────────────────────────────────────
  router.get('/v1/analytics/reports/visits', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);

      const report = await deps.reportingRepo.getVisitAnalytics(from, to);
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  // ── Offer Performance ─────────────────────────────────────────────────
  router.get('/v1/analytics/reports/offer-performance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);

      const offers = await deps.reportingRepo.getOfferPerformance(from, to);
      res.json({ offers });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
