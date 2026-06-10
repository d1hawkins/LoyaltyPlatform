import type { Logger } from '@loyalty/shared-logger';
import type { EventEnvelope } from '@loyalty/shared-events';
import { WebhookRepository } from './repository';
import { signPayload } from './signer';
import { decryptHookSecret } from './secrets';

export const WEBHOOK_TOPICS = [
  'member.enrolled',
  'member.updated',
  'member.deleted',
  'points.earned',
  'points.redeemed',
  'tier.upgraded',
  'tier.downgraded',
  'transaction.voided',
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export interface ConsumerDeps {
  repo: WebhookRepository;
  logger: Logger;
}

/**
 * Handle a single event envelope: fan out to every active webhook_config
 * whose event_type matches and insert a webhook_deliveries row per hook.
 * Idempotent per (hook_id, event_id): duplicate redelivery from Service Bus
 * is safe.
 */
export async function handleEventEnvelope(
  deps: ConsumerDeps,
  envelope: EventEnvelope<unknown>,
): Promise<number> {
  const { repo, logger } = deps;
  const hooks = await repo.listActiveHooksForEvent(envelope.eventType);
  if (hooks.length === 0) return 0;

  const body = JSON.stringify(envelope);
  const timestamp = envelope.timestamp ?? new Date().toISOString();

  let inserted = 0;
  for (const hook of hooks) {
    const secret = decryptHookSecret(hook.secret_encrypted);
    const { hex } = signPayload(secret, timestamp, body);
    const row = await repo.insertDelivery({
      hook_id: hook.hook_id,
      event_id: envelope.eventId,
      event_type: envelope.eventType,
      target_url: hook.target_url,
      payload: body,
      signature: hex,
    });
    if (row) {
      inserted += 1;
      logger.info(
        {
          deliveryId: row.delivery_id,
          hookId: hook.hook_id,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
        },
        'webhook.delivery.enqueued',
      );
    } else {
      logger.debug(
        { hookId: hook.hook_id, eventId: envelope.eventId },
        'webhook.delivery.duplicate',
      );
    }
  }
  return inserted;
}
