import type { Logger } from '@loyalty/shared-logger';
import { EVENT_TYPES } from '@loyalty/shared-events';
import {
  envelopeSchema,
  pointsEarnedPayloadV1Schema,
  transactionVoidedPayloadV1Schema,
  type ParsedEnvelope,
} from './schemas';
import { classifyTransition, selectTier, type TierRow } from './evaluator';
import type { TierRepository, TierHistoryInsert } from './repository';
import type { DedupeStore } from './dedupe';

/**
 * Minimal surface the worker needs from a Service Bus publisher (or a test
 * spy). Matches @loyalty/shared-events ServiceBusPublisher.publish().
 */
export interface Publisher {
  publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<unknown>;
}

/**
 * Minimal surface the worker needs from a Redis client for cache invalidation.
 */
export interface CacheInvalidator {
  del(key: string): Promise<unknown>;
}

export interface ProcessResult {
  outcome:
    | 'skipped_duplicate'
    | 'noop'
    | 'upgraded'
    | 'downgraded'
    | 'dead_letter'
    | 'member_not_found';
  detail?: string;
}

export interface WorkerDeps {
  repo: TierRepository;
  dedupe: DedupeStore;
  publisher: Publisher;
  cache: CacheInvalidator;
  logger: Logger;
  now?: () => Date;
}

const BALANCE_CACHE_KEY = (tenantId: string, memberId: string) =>
  `tenant:${tenantId}:member:${memberId}:balance`;

/**
 * Represents either a successful parse or a permanent failure that should
 * dead-letter the message.
 */
type ParseResult =
  | { ok: true; envelope: ParsedEnvelope<{ memberId: string }> }
  | { ok: false; reason: string };

function parseMessage(rawBody: unknown, eventTypeHint?: string): ParseResult {
  const envResult = envelopeSchema.safeParse(rawBody);
  if (!envResult.success) {
    return { ok: false, reason: `malformed_envelope:${envResult.error.message}` };
  }
  const env = envResult.data;
  const type = eventTypeHint ?? env.eventType;
  if (type === EVENT_TYPES.POINTS_EARNED) {
    const p = pointsEarnedPayloadV1Schema.safeParse(env.payload);
    if (!p.success) return { ok: false, reason: `malformed_points_earned:${p.error.message}` };
    return {
      ok: true,
      envelope: {
        eventId: env.eventId,
        eventType: env.eventType,
        tenantId: env.tenantId,
        timestamp: env.timestamp,
        version: env.version,
        payload: p.data,
      },
    };
  }
  if (type === EVENT_TYPES.TRANSACTION_VOIDED) {
    const p = transactionVoidedPayloadV1Schema.safeParse(env.payload);
    if (!p.success) return { ok: false, reason: `malformed_tx_voided:${p.error.message}` };
    return {
      ok: true,
      envelope: {
        eventId: env.eventId,
        eventType: env.eventType,
        tenantId: env.tenantId,
        timestamp: env.timestamp,
        version: env.version,
        payload: p.data,
      },
    };
  }
  return { ok: false, reason: `unsupported_event_type:${type}` };
}

/**
 * Core message processor. Pure-ish: every side-effect goes through WorkerDeps,
 * so the whole loop can be driven from a unit test with in-memory fakes.
 *
 * Transient errors (thrown by repo/publisher/cache) propagate so the caller
 * (Service Bus receiver) can abandon the message and let the broker redeliver.
 * Permanent errors are converted to `dead_letter` results.
 */
export async function processMessage(
  deps: WorkerDeps,
  rawBody: unknown,
  messageId: string | undefined,
): Promise<ProcessResult> {
  const { repo, dedupe, publisher, cache, logger, now } = deps;
  const evaluatedAt = (now ?? (() => new Date()))().toISOString();

  if (!messageId) {
    logger.warn({}, 'tier-eval.message.missing_message_id');
    return { outcome: 'dead_letter', detail: 'missing_message_id' };
  }

  const fresh = await dedupe.claim(messageId);
  if (!fresh) {
    logger.info({ messageId }, 'tier-eval.message.skipped_duplicate');
    return { outcome: 'skipped_duplicate' };
  }

  const parsed = parseMessage(rawBody);
  if (!parsed.ok) {
    logger.warn({ messageId, reason: parsed.reason }, 'tier-eval.message.dead_letter');
    return { outcome: 'dead_letter', detail: parsed.reason };
  }
  const env = parsed.envelope;
  const { tenantId, payload, eventId } = env;
  const { memberId } = payload;

  const member = await repo.getMember(tenantId, memberId);
  if (!member) {
    logger.warn(
      { messageId, tenantId, memberId, eventId },
      'tier-eval.message.member_not_found',
    );
    return { outcome: 'member_not_found', detail: 'member_not_found' };
  }

  const [rollingPoints, tiers] = await Promise.all([
    repo.getRollingPoints(tenantId, memberId),
    repo.getTiers(tenantId),
  ]);

  const result = await applyEvaluation({
    deps,
    tenantId,
    memberId,
    rollingPoints,
    tiers,
    currentTierId: member.tierId,
    triggerEventId: eventId,
    evaluatedAt,
    reasonIfChange: (kind) => (kind === 'upgrade' ? 'auto_promotion' : 'auto_demotion'),
  });

  logger.info(
    {
      messageId,
      tenantId,
      memberId,
      eventId,
      rollingPoints,
      outcome: result.outcome,
    },
    'tier-eval.message.processed',
  );
  return result;
}

/**
 * Shared evaluation path used by both the message consumer and the demotion
 * cron. Picks the new tier, compares to the current tier, writes audit row,
 * invalidates cache, publishes the Service Bus event.
 */
export async function applyEvaluation(args: {
  deps: WorkerDeps;
  tenantId: string;
  memberId: string;
  rollingPoints: number;
  tiers: TierRow[];
  currentTierId: string | null;
  triggerEventId: string | null;
  evaluatedAt: string;
  reasonIfChange: (kind: 'upgrade' | 'downgrade') => TierHistoryInsert['reason'];
}): Promise<ProcessResult> {
  const {
    deps,
    tenantId,
    memberId,
    rollingPoints,
    tiers,
    currentTierId,
    triggerEventId,
    evaluatedAt,
    reasonIfChange,
  } = args;
  const { repo, publisher, cache } = deps;

  const selected = selectTier(rollingPoints, tiers);
  const previousTier = tiers.find((t) => t.id === currentTierId) ?? null;
  const nextTier = selected ? tiers.find((t) => t.id === selected.tierId) ?? null : null;
  const transition = classifyTransition(previousTier, nextTier);

  if (transition === 'none') {
    return { outcome: 'noop' };
  }

  const newTierId = nextTier?.id ?? null;
  const history: TierHistoryInsert = {
    memberId,
    previousTierId: currentTierId,
    newTierId,
    rollingPoints,
    reason: reasonIfChange(transition),
    evaluatedAt,
    triggerEventId,
  };
  await repo.applyTierChange(tenantId, memberId, newTierId, history);

  await cache.del(BALANCE_CACHE_KEY(tenantId, memberId));

  const topic =
    transition === 'upgrade' ? EVENT_TYPES.TIER_UPGRADED : EVENT_TYPES.TIER_DOWNGRADED;
  await publisher.publish(
    topic,
    topic,
    {
      memberId,
      previousTierId: currentTierId,
      newTierId,
      rollingPoints,
      evaluatedAt,
      triggerEventId,
    },
    tenantId,
  );

  return { outcome: transition === 'upgrade' ? 'upgraded' : 'downgraded' };
}

/**
 * Demotion cron: for every tenant, enumerate members whose most recent
 * transaction is older than `cooldownDays`, recompute rolling points, and
 * demote if they no longer qualify for their current tier.
 *
 * Each member is wrapped in its own DB transaction (via repo.applyTierChange)
 * so one failure doesn't poison the batch.
 */
export async function runDemotionScan(
  deps: WorkerDeps,
  cooldownDays: number,
): Promise<{ scanned: number; demoted: number; errors: number }> {
  const { repo, logger, now } = deps;
  const at = (now ?? (() => new Date()))();
  const cutoff = new Date(at.getTime() - cooldownDays * 24 * 60 * 60 * 1000);
  const evaluatedAt = at.toISOString();

  let scanned = 0;
  let demoted = 0;
  let errors = 0;

  const tenantIds = await repo.listTenantIds();
  for (const tenantId of tenantIds) {
    const tiers = await repo.getTiers(tenantId);
    const candidates = await repo.listDemotionCandidates(tenantId, cutoff);
    for (const member of candidates) {
      scanned += 1;
      try {
        const rollingPoints = await repo.getRollingPoints(tenantId, member.memberId);
        const result = await applyEvaluation({
          deps,
          tenantId,
          memberId: member.memberId,
          rollingPoints,
          tiers,
          currentTierId: member.tierId,
          triggerEventId: null,
          evaluatedAt,
          reasonIfChange: () => 'auto_demotion',
        });
        if (result.outcome === 'downgraded') demoted += 1;
      } catch (err) {
        errors += 1;
        logger.error(
          { err, tenantId, memberId: member.memberId },
          'tier-eval.demotion.member_failed',
        );
      }
    }
  }
  logger.info({ scanned, demoted, errors }, 'tier-eval.demotion.scan_complete');
  return { scanned, demoted, errors };
}
