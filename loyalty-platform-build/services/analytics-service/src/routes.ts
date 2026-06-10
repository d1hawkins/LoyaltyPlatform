/**
 * Analytics Service — Express route handlers
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError, NotFoundError } from '@loyalty/shared-errors';
import {
  SummaryRepository,
  CohortRepository,
  TierRepository,
  ExportRepository,
  RealtimeRepository,
} from './repositories';
import { MetricKey, GroupBy } from './types';
import { isValidMetricKey, buildEnrollmentTrend, buildTransactionTrend, buildPointsEconomy } from './aggregator';
import { computeDerivedKpis, todayUtc } from './kpi-calculator';
import { buildCohortMatrix } from './cohort-builder';
import { createCsvStream, EXPORT_COLUMNS, rowToCsv } from './csv-stream';

export interface RouteDeps {
  summaryRepo: SummaryRepository;
  cohortRepo: CohortRepository;
  tierRepo: TierRepository;
  exportRepo: ExportRepository;
  realtimeRepo: RealtimeRepository;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const groupBySchema = z.enum(['day', 'week', 'month']).default('day');

export function buildRoutes(deps: RouteDeps): Router {
  const router = Router();

  // ── Summary endpoint ────────────────────────────────────────────────
  router.get('/v1/analytics/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);
      const metricsParam = req.query.metrics as string | undefined;

      let metrics: MetricKey[] | undefined;
      if (metricsParam) {
        const keys = metricsParam.split(',').map((k) => k.trim());
        for (const k of keys) {
          if (!isValidMetricKey(k)) throw new ValidationError(`Invalid metric key: ${k}`);
        }
        metrics = keys as MetricKey[];
      }

      const rows = await deps.summaryRepo.query(tenantId, from, to, metrics);
      const derived = computeDerivedKpis(rows);

      res.json({ from, to, summaries: rows, derived });
    } catch (err) {
      next(err);
    }
  });

  // ── Enrollment trends ───────────────────────────────────────────────
  router.get('/v1/analytics/enrollment', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);
      const groupBy = groupBySchema.parse(req.query.groupBy ?? 'day') as GroupBy;

      const rows = await deps.summaryRepo.query(tenantId, from, to, ['enrollments']);
      const trend = buildEnrollmentTrend(rows, groupBy);

      res.json({ from, to, groupBy, trend });
    } catch (err) {
      next(err);
    }
  });

  // ── Transaction analytics ───────────────────────────────────────────
  router.get('/v1/analytics/transactions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);
      const groupBy = groupBySchema.parse(req.query.groupBy ?? 'day') as GroupBy;

      const rows = await deps.summaryRepo.query(tenantId, from, to, ['transactions', 'total_spend', 'points_issued']);
      const trend = buildTransactionTrend(rows, groupBy);

      res.json({ from, to, groupBy, trend });
    } catch (err) {
      next(err);
    }
  });

  // ── Points economy ─────────────────────────────────────────────────
  router.get('/v1/analytics/points-economy', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const from = dateSchema.parse(req.query.from);
      const to = dateSchema.parse(req.query.to);

      const rows = await deps.summaryRepo.query(tenantId, from, to, [
        'points_issued',
        'points_redeemed',
        'points_expired',
      ]);
      const economy = buildPointsEconomy(rows, from, to);

      res.json(economy);
    } catch (err) {
      next(err);
    }
  });

  // ── Tier distribution ───────────────────────────────────────────────
  router.get('/v1/analytics/tier-distribution', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const distribution = await deps.tierRepo.getDistribution(tenantId);
      res.json({ tiers: distribution });
    } catch (err) {
      next(err);
    }
  });

  // ── Retention cohort ────────────────────────────────────────────────
  router.get('/v1/analytics/retention-cohort', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const from = req.query.from ? dateSchema.parse(req.query.from) : undefined;
      const to = req.query.to ? dateSchema.parse(req.query.to) : undefined;

      const rows = await deps.cohortRepo.query(tenantId, from, to);
      const matrix = buildCohortMatrix(rows);

      res.json({ cohorts: matrix });
    } catch (err) {
      next(err);
    }
  });

  // ── Bulk export ─────────────────────────────────────────────────────
  router.get('/v1/analytics/export/:entity', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const entity = req.params.entity;

      const validEntities = ['members', 'transactions', 'ledger', 'redemptions'];
      if (!entity || !validEntities.includes(entity)) {
        throw new NotFoundError(`Unknown export entity: ${entity}`);
      }

      const format = (req.query.format as string) ?? 'json';
      const since = req.query.since as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const query = {
        entity: entity as 'members' | 'transactions' | 'ledger' | 'redemptions',
        format: format as 'csv' | 'json',
        since,
        limit,
      };

      if (format === 'csv') {
        const columns = EXPORT_COLUMNS[entity as string] ?? [];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${entity}-export.csv"`);

        const stream = createCsvStream(deps.exportRepo.stream(tenantId, query), columns);
        stream.pipe(res);
      } else {
        const items: Record<string, unknown>[] = [];
        for await (const record of deps.exportRepo.stream(tenantId, query)) {
          items.push(record);
        }
        res.json({ entity, count: items.length, items });
      }
    } catch (err) {
      next(err);
    }
  });

  // ── Realtime KPIs ───────────────────────────────────────────────────
  router.get('/v1/analytics/kpi/realtime', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = extractTenantId(req);
      const today = todayUtc();
      const kpis = await deps.realtimeRepo.getKpis(tenantId, today);

      res.json({
        ...kpis,
        asOf: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractTenantId(req: Request): string {
  const tenantId =
    (req as any).user?.tenantId ??
    req.header('x-tenant-id');
  if (!tenantId) {
    throw new ValidationError('Missing tenant ID');
  }
  return tenantId;
}
