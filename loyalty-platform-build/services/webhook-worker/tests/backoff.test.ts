import { BACKOFF_SCHEDULE_MS, nextBackoffMs, nextAttemptAt } from '../src/backoff';

describe('backoff', () => {
  it('follows the 30s/2m/10m/1h/6h schedule', () => {
    expect(BACKOFF_SCHEDULE_MS).toEqual([
      30_000,
      2 * 60_000,
      10 * 60_000,
      60 * 60_000,
      6 * 60 * 60_000,
    ]);
  });

  it('maps attempt 1..5 to schedule entries', () => {
    expect(nextBackoffMs(1)).toBe(30_000);
    expect(nextBackoffMs(2)).toBe(120_000);
    expect(nextBackoffMs(3)).toBe(600_000);
    expect(nextBackoffMs(4)).toBe(3_600_000);
    expect(nextBackoffMs(5)).toBe(21_600_000);
  });

  it('clamps beyond schedule to final entry', () => {
    expect(nextBackoffMs(99)).toBe(21_600_000);
  });

  it('attempt <=0 falls back to first entry', () => {
    expect(nextBackoffMs(0)).toBe(30_000);
    expect(nextBackoffMs(-5)).toBe(30_000);
  });

  it('nextAttemptAt adds backoff to now', () => {
    const now = new Date('2026-04-09T00:00:00Z');
    const next = nextAttemptAt(now, 1);
    expect(next.getTime() - now.getTime()).toBe(30_000);
  });
});
