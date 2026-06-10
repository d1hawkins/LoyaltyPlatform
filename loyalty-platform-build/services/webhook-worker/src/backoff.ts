// Exponential backoff schedule for webhook retries.
// Attempt number is the attempt that JUST failed (1-indexed as it is written back).
// Schedule: 30s, 2m, 10m, 1h, 6h.
export const BACKOFF_SCHEDULE_MS: number[] = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

/**
 * Given the number of attempts already made (post-increment),
 * return the wait time in ms before the next attempt.
 * If attempt exceeds the schedule, returns the final entry.
 */
export function nextBackoffMs(attempt: number): number {
  if (attempt <= 0) return BACKOFF_SCHEDULE_MS[0]!;
  const idx = Math.min(attempt - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[idx]!;
}

export function nextAttemptAt(now: Date, attempt: number): Date {
  return new Date(now.getTime() + nextBackoffMs(attempt));
}
