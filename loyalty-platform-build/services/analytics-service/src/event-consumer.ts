/**
 * Analytics Service — Event consumer
 *
 * Subscribes to Service Bus topics and upserts daily summary rows
 * on each event (materialized-view pattern).
 *
 * Events consumed:
 * - points.earned    → increment transactions, total_spend, points_issued
 * - points.redeemed  → increment points_redeemed, redemptions
 * - member.enrolled  → increment enrollments
 * - tier.upgraded    → (logged for tier distribution tracking)
 * - tier.downgraded  → (logged for tier distribution tracking)
 */

import { Logger } from '@loyalty/shared-logger';
import { SummaryRepository, RealtimeRepository } from './repositories';
import { MetricKey } from './types';

export interface EventConsumerDeps {
  summaryRepo: SummaryRepository;
  realtimeRepo: RealtimeRepository;
  logger: Logger;
}

export class AnalyticsEventConsumer {
  private deps: EventConsumerDeps;

  constructor(deps: EventConsumerDeps) {
    this.deps = deps;
  }

  /**
   * Handle a points.earned event.
   */
  async handlePointsEarned(envelope: {
    tenantId: string;
    timestamp: string;
    payload: {
      memberId: string;
      transactionId?: string;
      points: number;
      balanceAfter?: number;
      delta?: number;
      channel?: string;
      reasonCode?: string;
    };
  }): Promise<void> {
    const date = envelope.timestamp.slice(0, 10);
    const tenantId = envelope.tenantId;
    const points = envelope.payload.points ?? envelope.payload.delta ?? 0;
    const channel = envelope.payload.channel;

    // Increment points_issued
    await this.deps.summaryRepo.increment(tenantId, date, 'points_issued', points);
    await this.deps.realtimeRepo.incrementCounter(tenantId, date, 'points_issued', points);

    // If this is a transaction (not an adjustment), increment transaction counters
    if (envelope.payload.transactionId) {
      const txDimensions = channel ? { [channel]: 1 } : undefined;
      await this.deps.summaryRepo.increment(tenantId, date, 'transactions', 1, txDimensions);
      await this.deps.realtimeRepo.incrementCounter(tenantId, date, 'transactions', 1);
    }

    this.deps.logger.info(
      { tenantId, date, points, metric: 'points_issued' },
      'analytics.event.points_earned',
    );
  }

  /**
   * Handle a points.redeemed event.
   */
  async handlePointsRedeemed(envelope: {
    tenantId: string;
    timestamp: string;
    payload: {
      memberId: string;
      points: number;
      delta?: number;
      offerId?: string;
    };
  }): Promise<void> {
    const date = envelope.timestamp.slice(0, 10);
    const tenantId = envelope.tenantId;
    const points = Math.abs(envelope.payload.points ?? envelope.payload.delta ?? 0);

    await this.deps.summaryRepo.increment(tenantId, date, 'points_redeemed', points);
    await this.deps.summaryRepo.increment(tenantId, date, 'redemptions', 1);
    await this.deps.realtimeRepo.incrementCounter(tenantId, date, 'redemptions', 1);

    this.deps.logger.info(
      { tenantId, date, points, metric: 'points_redeemed' },
      'analytics.event.points_redeemed',
    );
  }

  /**
   * Handle a member.enrolled event.
   */
  async handleMemberEnrolled(envelope: {
    tenantId: string;
    timestamp: string;
    payload: {
      memberId: string;
      channel: string;
      enrolledAt?: string;
      tierId?: string;
    };
  }): Promise<void> {
    const date = envelope.timestamp.slice(0, 10);
    const tenantId = envelope.tenantId;
    const channel = envelope.payload.channel;

    const dimensions = channel ? { [channel]: 1 } : undefined;
    await this.deps.summaryRepo.increment(tenantId, date, 'enrollments', 1, dimensions);

    this.deps.logger.info(
      { tenantId, date, channel, metric: 'enrollments' },
      'analytics.event.member_enrolled',
    );
  }

  /**
   * Handle a tier.upgraded event.
   */
  async handleTierUpgraded(envelope: {
    tenantId: string;
    timestamp: string;
    payload: {
      memberId: string;
      fromTierId: string;
      toTierId: string;
    };
  }): Promise<void> {
    this.deps.logger.info(
      {
        tenantId: envelope.tenantId,
        fromTier: envelope.payload.fromTierId,
        toTier: envelope.payload.toTierId,
      },
      'analytics.event.tier_upgraded',
    );
  }

  /**
   * Handle a tier.downgraded event.
   */
  async handleTierDowngraded(envelope: {
    tenantId: string;
    timestamp: string;
    payload: {
      memberId: string;
      fromTierId: string;
      toTierId: string;
    };
  }): Promise<void> {
    this.deps.logger.info(
      {
        tenantId: envelope.tenantId,
        fromTier: envelope.payload.fromTierId,
        toTier: envelope.payload.toTierId,
      },
      'analytics.event.tier_downgraded',
    );
  }

  /**
   * Register all subscriptions using the shared-events ServiceBusSubscriber.
   * In test/dev mode this is a no-op; events are dispatched directly via the handle* methods.
   */
  async registerSubscriptions(subscriber: {
    subscribe: <T>(topic: string, subscription: string, handler: (envelope: { tenantId: string; timestamp: string; payload: T }) => Promise<void>, options?: Record<string, unknown>) => void;
  }): Promise<void> {
    const SUB_NAME = 'analytics-service';
    const opts = { maxDeliveryCount: 10, deadLetterOnProcessFailure: true };

    subscriber.subscribe('points.earned', SUB_NAME, (env) => this.handlePointsEarned(env as any), opts);
    subscriber.subscribe('points.redeemed', SUB_NAME, (env) => this.handlePointsRedeemed(env as any), opts);
    subscriber.subscribe('member.enrolled', SUB_NAME, (env) => this.handleMemberEnrolled(env as any), opts);
    subscriber.subscribe('tier.upgraded', SUB_NAME, (env) => this.handleTierUpgraded(env as any), opts);
    subscriber.subscribe('tier.downgraded', SUB_NAME, (env) => this.handleTierDowngraded(env as any), opts);

    this.deps.logger.info('analytics.subscriptions.registered');
  }
}
