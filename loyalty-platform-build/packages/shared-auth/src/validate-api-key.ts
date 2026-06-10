import bcrypt from 'bcryptjs';

/**
 * Constant-time validation of a plaintext API key against its stored bcrypt hash.
 */
export async function validateApiKey(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  if (!plaintext || !hash) return false;
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}
