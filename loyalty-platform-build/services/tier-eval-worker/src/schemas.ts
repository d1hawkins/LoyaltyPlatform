/**
 * Re-exports of canonical event envelope types the tier-eval-worker cares about.
 * Canonical definitions live in @loyalty/shared-events (see services/loyalty-engine/HANDOFF.md).
 */
export {
  EVENT_TYPES,
  type EventEnvelope,
  type PointsEarnedPayloadV1,
  type TransactionVoidedPayloadV1,
  type TierUpgradedPayload,
  type TierDowngradedPayload,
} from '@loyalty/shared-events';

import { z } from 'zod';

// Runtime validators for inbound envelopes.
export const pointsEarnedPayloadV1Schema = z.object({
  memberId: z.string().min(1),
  transactionId: z.string().min(1),
  ledgerId: z.string().min(1),
  delta: z.number(),
  newBalance: z.number(),
  channel: z.string().min(1),
  reasonCode: z.enum(['earn', 'adjust', 'bonus']),
});

export const transactionVoidedPayloadV1Schema = z.object({
  memberId: z.string().min(1),
  transactionId: z.string().min(1),
  originalLedgerId: z.string().min(1),
  reversalLedgerId: z.string().min(1),
  delta: z.number(),
  newBalance: z.number(),
  reason: z.string(),
});

export const envelopeSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  tenantId: z.string().min(1),
  timestamp: z.string().min(1),
  version: z.string().min(1),
  payload: z.unknown(),
});

export type ParsedEnvelope<T> = {
  eventId: string;
  eventType: string;
  tenantId: string;
  timestamp: string;
  version: string;
  payload: T;
};
