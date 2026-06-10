/**
 * Analytics Service — Cron scheduler
 *
 * Nightly summary rebuild (3am UTC) and weekly cohort refresh.
 * Uses a simple interval-based approach for portability.
 * In production, Azure Container App scheduled jobs can replace this.
 */

import { Logger } from '@loyalty/shared-logger';
import { SummaryRepository, CohortRepository } from './repositories';

export interface SchedulerDeps {
  summaryRepo: SummaryRepository;
  cohortRepo: CohortRepository;
  logger: Logger;
}

export class AnalyticsScheduler {
  private deps: SchedulerDeps;
  private nightlyTimer?: ReturnType<typeof setInterval>;
  private weeklyTimer?: ReturnType<typeof setInterval>;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  /**
   * Start the scheduler.
   * In production the nightly job runs at 3am UTC.
   * For testability, the rebuild functions are exposed directly.
   */
  start(): void {
    // Check every minute if it's time to run
    this.nightlyTimer = setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
        this.rebuildRecentSummaries().catch((err) =>
          this.deps.logger.error({ err }, 'scheduler.nightly.failed'),
        );
      }
    }, 60_000);

    // Weekly cohort refresh: Sundays at 4am UTC
    this.weeklyTimer = setInterval(() => {
      const now = new Date();
      if (now.getUTCDay() === 0 && now.getUTCHours() === 4 && now.getUTCMinutes() === 0) {
        this.refreshCohorts().catch((err) =>
          this.deps.logger.error({ err }, 'scheduler.weekly.failed'),
        );
      }
    }, 60_000);

    this.deps.logger.info('scheduler.started');
  }

  stop(): void {
    if (this.nightlyTimer) clearInterval(this.nightlyTimer);
    if (this.weeklyTimer) clearInterval(this.weeklyTimer);
    this.deps.logger.info('scheduler.stopped');
  }

  /**
   * Rebuild daily summaries for the past 7 days (self-healing).
   * In a real implementation this would query raw tables and recompute.
   * Here it's a no-op placeholder that logs the intent.
   */
  async rebuildRecentSummaries(): Promise<void> {
    const now = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    this.deps.logger.info({ dates }, 'scheduler.nightly.rebuild.started');
    // In production: for each tenant, recompute summaries from raw tables.
    // The event consumer handles real-time; this is the self-healing layer.
    this.deps.logger.info({ dates }, 'scheduler.nightly.rebuild.completed');
  }

  /**
   * Refresh the retention cohort table.
   * In production: recompute from member/transaction tables.
   */
  async refreshCohorts(): Promise<void> {
    this.deps.logger.info('scheduler.weekly.cohort_refresh.started');
    // In production: for each tenant, run the cohort computation query.
    this.deps.logger.info('scheduler.weekly.cohort_refresh.completed');
  }
}
