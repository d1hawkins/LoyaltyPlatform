import { InMemoryNotificationRepository } from '../src/repository.memory';
import { defaultOptIn, isAllowed, isTransactional } from '../src/preferences';

describe('preferences evaluator', () => {
  it('classifies transactional templates', () => {
    expect(isTransactional('welcome')).toBe(true);
    expect(isTransactional('tier_upgraded')).toBe(true);
    expect(isTransactional('tier_downgraded')).toBe(true);
    expect(isTransactional('gdpr_deletion_confirmed')).toBe(true);
    expect(isTransactional('points_earned_digest')).toBe(false);
  });

  it('default opt-in is off for digest, on for unknown', () => {
    expect(defaultOptIn('points_earned_digest')).toBe(false);
    expect(defaultOptIn('marketing_banner')).toBe(true);
  });

  it('transactional templates cannot be opted out', async () => {
    const repo = new InMemoryNotificationRepository();
    await repo.upsertPreference({
      memberId: 'm1',
      templateKey: 'welcome',
      channel: 'email',
      optedIn: false,
      updatedAt: new Date().toISOString(),
    });
    expect(await isAllowed(repo, 'm1', 'welcome', 'email')).toBe(true);
  });

  it('honors opt-in preference for non-transactional', async () => {
    const repo = new InMemoryNotificationRepository();
    // Default off — no pref stored
    expect(await isAllowed(repo, 'm1', 'points_earned_digest', 'email')).toBe(false);
    // Opt in
    await repo.upsertPreference({
      memberId: 'm1',
      templateKey: 'points_earned_digest',
      channel: 'email',
      optedIn: true,
      updatedAt: new Date().toISOString(),
    });
    expect(await isAllowed(repo, 'm1', 'points_earned_digest', 'email')).toBe(true);
  });
});
