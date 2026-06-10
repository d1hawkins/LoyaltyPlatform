import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { ApiKey } from './types';

export const API_KEY_PREFIX = 'lp_sk_';
export const API_KEY_BCRYPT_ROUNDS = 12;

/**
 * Generates a fresh API key. Returns the plaintext (to show once to the caller)
 * and a bcrypt hash safe to persist.
 */
export function generateApiKey(): ApiKey {
  const random = randomBytes(32).toString('hex');
  const plaintext = `${API_KEY_PREFIX}${random}`;
  const hash = bcrypt.hashSync(plaintext, API_KEY_BCRYPT_ROUNDS);
  return { plaintext, hash };
}
