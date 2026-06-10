import type { Logger } from '@loyalty/shared-logger';
import {
  EVENT_TYPES,
  type EventEnvelope,
  type MemberDeletedPayload,
  type MemberEnrolledPayload,
  type PointsEarnedPayload,
  type TierDowngradedPayload,
  type TierUpgradedPayload,
} from '@loyalty/shared-events';
import type { NotificationService } from './service';

/**
 * Mapping from Service Bus topic to template key. `points.earned` is
 * deliberately routed to `points_earned_digest` as a PENDING log row only
 * — the nightly flush to dispatch is deferred (see HANDOFF coordination
 * notes with T-17).
 */
export const EVENT_TO_TEMPLATE: Record<string, string> = {
  [EVENT_TYPES.MEMBER_ENROLLED]: 'welcome',
  [EVENT_TYPES.POINTS_EARNED]: 'points_earned_digest',
  [EVENT_TYPES.TIER_UPGRADED]: 'tier_upgraded',
  [EVENT_TYPES.TIER_DOWNGRADED]: 'tier_downgraded',
  [EVENT_TYPES.MEMBER_DELETED]: 'gdpr_deletion_confirmed',
};

export const SUBSCRIBED_TOPICS = [
  EVENT_TYPES.MEMBER_ENROLLED,
  EVENT_TYPES.POINTS_EARNED,
  EVENT_TYPES.TIER_UPGRADED,
  EVENT_TYPES.TIER_DOWNGRADED,
  EVENT_TYPES.MEMBER_DELETED,
];

export const SUBSCRIPTION_NAME = 'notification-service';

export interface EventRouterDeps {
  service: NotificationService;
  logger: Logger;
}

export function createEventRouter(deps: EventRouterDeps) {
  return {
    async handleMemberEnrolled(env: EventEnvelope<MemberEnrolledPayload>) {
      await deps.service.send(env.tenantId, {
        memberId: env.payload.memberId,
        templateKey: 'welcome',
        channel: 'email',
        triggeredByEventId: env.eventId,
      });
    },

    async handleTierUpgraded(env: EventEnvelope<TierUpgradedPayload>) {
      await deps.service.send(env.tenantId, {
        memberId: env.payload.memberId,
        templateKey: 'tier_upgraded',
        channel: 'email',
        triggeredByEventId: env.eventId,
        variables: {
          previousTier: env.payload.fromTierId,
          newTier: env.payload.toTierId,
        },
      });
    },

    async handleTierDowngraded(env: EventEnvelope<TierDowngradedPayload>) {
      await deps.service.send(env.tenantId, {
        memberId: env.payload.memberId,
        templateKey: 'tier_downgraded',
        channel: 'email',
        triggeredByEventId: env.eventId,
        variables: {
          previousTier: env.payload.fromTierId,
          newTier: env.payload.toTierId,
        },
      });
    },

    async handleMemberDeleted(env: EventEnvelope<MemberDeletedPayload>) {
      try {
        await deps.service.send(env.tenantId, {
          memberId: env.payload.memberId,
          templateKey: 'gdpr_deletion_confirmed',
          channel: 'email',
          triggeredByEventId: env.eventId,
        });
      } catch (err) {
        // Member may already be gone — log and swallow so we don't DLQ
        // the delete event.
        deps.logger.warn({ err, eventId: env.eventId }, 'notification.gdpr.send_failed');
      }
    },

    async handlePointsEarned(env: EventEnvelope<PointsEarnedPayload>) {
      // Deferred: nightly digest. Write a PENDING log row, do NOT dispatch.
      await deps.service.logEventAsPending(env.tenantId, {
        memberId: env.payload.memberId,
        templateKey: 'points_earned_digest',
        channel: 'email',
        triggeredByEventId: env.eventId,
      });
    },

    async route(env: EventEnvelope<unknown>) {
      switch (env.eventType) {
        case EVENT_TYPES.MEMBER_ENROLLED:
          return this.handleMemberEnrolled(env as EventEnvelope<MemberEnrolledPayload>);
        case EVENT_TYPES.TIER_UPGRADED:
          return this.handleTierUpgraded(env as EventEnvelope<TierUpgradedPayload>);
        case EVENT_TYPES.TIER_DOWNGRADED:
          return this.handleTierDowngraded(env as EventEnvelope<TierDowngradedPayload>);
        case EVENT_TYPES.MEMBER_DELETED:
          return this.handleMemberDeleted(env as EventEnvelope<MemberDeletedPayload>);
        case EVENT_TYPES.POINTS_EARNED:
          return this.handlePointsEarned(env as EventEnvelope<PointsEarnedPayload>);
        default:
          deps.logger.debug({ eventType: env.eventType }, 'notification.event.ignored');
          return undefined;
      }
    },
  };
}
