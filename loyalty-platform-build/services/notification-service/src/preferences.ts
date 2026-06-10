import type { NotificationRepository } from './repository';

/**
 * Pure preferences evaluator: default opt-in is TRUE for all templates
 * except marketing-flavored ones, which default to OFF. Transactional
 * templates (welcome, tier changes, GDPR confirmations) cannot be opted out
 * — they are always sent regardless of stored preference.
 */
const TRANSACTIONAL_TEMPLATES = new Set<string>([
  'welcome',
  'tier_upgraded',
  'tier_downgraded',
  'gdpr_deletion_confirmed',
]);

const DEFAULT_OFF_TEMPLATES = new Set<string>([
  // marketing / digest defaults-off
  'points_earned_digest',
]);

export function isTransactional(templateKey: string): boolean {
  return TRANSACTIONAL_TEMPLATES.has(templateKey);
}

export function defaultOptIn(templateKey: string): boolean {
  return !DEFAULT_OFF_TEMPLATES.has(templateKey);
}

export async function isAllowed(
  repo: NotificationRepository,
  memberId: string,
  templateKey: string,
  channel: string,
): Promise<boolean> {
  if (isTransactional(templateKey)) return true;
  const pref = await repo.getPreference(memberId, templateKey, channel);
  if (!pref) return defaultOptIn(templateKey);
  return pref.optedIn;
}
