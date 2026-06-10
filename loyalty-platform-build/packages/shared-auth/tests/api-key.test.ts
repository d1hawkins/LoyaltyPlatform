import {
  generateApiKey,
  validateApiKey,
  API_KEY_PREFIX,
} from '../src';

describe('api key', () => {
  it('generates a prefixed key with bcrypt hash', () => {
    const k = generateApiKey();
    expect(k.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(k.plaintext.length).toBe(API_KEY_PREFIX.length + 64);
    expect(k.hash.startsWith('$2')).toBe(true);
  });

  it('round-trips validation', async () => {
    const k = generateApiKey();
    await expect(validateApiKey(k.plaintext, k.hash)).resolves.toBe(true);
  });

  it('rejects mismatched key', async () => {
    const a = generateApiKey();
    const b = generateApiKey();
    await expect(validateApiKey(a.plaintext, b.hash)).resolves.toBe(false);
  });

  it('rejects empty inputs', async () => {
    await expect(validateApiKey('', 'x')).resolves.toBe(false);
    await expect(validateApiKey('x', '')).resolves.toBe(false);
  });

  it('returns false for invalid hash', async () => {
    await expect(validateApiKey('lp_sk_abc', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });

  it('produces unique keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
  });
});
