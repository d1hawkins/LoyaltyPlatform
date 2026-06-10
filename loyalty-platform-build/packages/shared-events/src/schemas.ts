// Typed event schemas for the Loyalty Platform.

export const EVENT_TYPES = {
  MEMBER_ENROLLED: 'member.enrolled',
  MEMBER_UPDATED: 'member.updated',
  MEMBER_DELETED: 'member.deleted',
  POINTS_EARNED: 'points.earned',
  POINTS_REDEEMED: 'points.redeemed',
  TIER_UPGRADED: 'tier.upgraded',
  TIER_DOWNGRADED: 'tier.downgraded',
  TRANSACTION_VOIDED: 'transaction.voided',
  WEBHOOK_DELIVERY: 'webhook.delivery',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: EventType | string;
  tenantId: string;
  timestamp: string;
  version: string;
  payload: T;
}

// Payload interfaces
export interface MemberEnrolledPayload {
  memberId: string;
  channel: string;
  enrolledAt: string;
  tierId: string;
}

export interface MemberUpdatedPayload {
  memberId: string;
  changedFields: string[];
}

export interface MemberDeletedPayload {
  memberId: string;
  deletedAt: string;
}

export interface PointsEarnedPayload {
  memberId: string;
  transactionId: string;
  points: number;
  balanceAfter: number;
}

export interface PointsRedeemedPayload {
  memberId: string;
  transactionId?: string;
  offerId?: string;
  points: number;
  balanceAfter: number;
}

export interface TierUpgradedPayload {
  memberId: string;
  fromTierId: string;
  toTierId: string;
  effectiveAt: string;
}

export interface TierDowngradedPayload {
  memberId: string;
  fromTierId: string;
  toTierId: string;
  effectiveAt: string;
}

export interface TransactionVoidedPayload {
  transactionId: string;
  memberId: string;
  reason: string;
  pointsReversed: number;
}

export interface WebhookDeliveryPayload {
  webhookId: string;
  eventType: string;
  targetUrl: string;
  attempt: number;
  success: boolean;
  responseStatus?: number;
}

// --- T-05 extended payloads (loyalty-engine canonical schema) ---
// Superset of the original payloads; consumers may use either set.
export interface PointsEarnedPayloadV1 {
  memberId: string;
  transactionId: string;
  ledgerId: string;
  delta: number;
  newBalance: number;
  channel: string;
  reasonCode: 'earn' | 'adjust' | 'bonus';
}

export interface TransactionVoidedPayloadV1 {
  memberId: string;
  transactionId: string;
  originalLedgerId: string;
  reversalLedgerId: string;
  delta: number;
  newBalance: number;
  reason: string;
}

export interface PointsRedeemedPayloadV1 {
  memberId: string;
  redemptionId: string;
  ledgerId: string;
  delta: number;
  newBalance: number;
  offerId?: string;
}

export type PointsEarnedEventV1 = EventEnvelope<PointsEarnedPayloadV1>;
export type TransactionVoidedEventV1 = EventEnvelope<TransactionVoidedPayloadV1>;
export type PointsRedeemedEventV1 = EventEnvelope<PointsRedeemedPayloadV1>;

// Fully-typed event aliases
export type MemberEnrolledEvent = EventEnvelope<MemberEnrolledPayload>;
export type MemberUpdatedEvent = EventEnvelope<MemberUpdatedPayload>;
export type MemberDeletedEvent = EventEnvelope<MemberDeletedPayload>;
export type PointsEarnedEvent = EventEnvelope<PointsEarnedPayload>;
export type PointsRedeemedEvent = EventEnvelope<PointsRedeemedPayload>;
export type TierUpgradedEvent = EventEnvelope<TierUpgradedPayload>;
export type TierDowngradedEvent = EventEnvelope<TierDowngradedPayload>;
export type TransactionVoidedEvent = EventEnvelope<TransactionVoidedPayload>;
export type WebhookDeliveryEvent = EventEnvelope<WebhookDeliveryPayload>;
