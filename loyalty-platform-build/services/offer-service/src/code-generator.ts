import { randomBytes } from 'crypto';

/**
 * Generates a batch of unique alphanumeric codes.
 *
 * @param count - Number of codes to generate
 * @param prefix - Optional prefix prepended to each code
 * @param length - Length of the random portion (default 8)
 * @returns Array of unique uppercase codes
 */
export function generateCodes(count: number, prefix?: string, length = 8): string[] {
  const codes = new Set<string>();
  const pfx = prefix ? prefix.toUpperCase() + '-' : '';

  // Safety: cap iterations to avoid infinite loops
  const maxIterations = count * 3;
  let iterations = 0;

  while (codes.size < count && iterations < maxIterations) {
    iterations++;
    const raw = randomBytes(length)
      .toString('base64url')
      .slice(0, length)
      .toUpperCase();
    codes.add(pfx + raw);
  }

  if (codes.size < count) {
    throw new Error(`Could not generate ${count} unique codes within iteration limit`);
  }

  return Array.from(codes);
}
