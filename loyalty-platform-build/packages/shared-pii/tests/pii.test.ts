import { encrypt, decrypt, hashRecipient, sha256Hex } from '../src';

const KEY = '00'.repeat(32); // all-zero 32-byte key is fine for tests

describe('shared-pii', () => {
  it('round-trips encryption', () => {
    const blob = encrypt('alice@example.com', KEY);
    expect(blob).not.toContain('alice');
    expect(decrypt(blob, KEY)).toBe('alice@example.com');
  });

  it('produces distinct ciphertexts for the same plaintext', () => {
    const a = encrypt('hello', KEY);
    const b = encrypt('hello', KEY);
    expect(a).not.toBe(b); // random IV
    expect(decrypt(a, KEY)).toBe('hello');
    expect(decrypt(b, KEY)).toBe('hello');
  });

  it('rejects bad keys', () => {
    expect(() => encrypt('x', 'not-hex')).toThrow(/hex key/);
  });

  it('hashRecipient is deterministic and case-insensitive', () => {
    const a = hashRecipient('Alice@Example.com', 'pepper-1');
    const b = hashRecipient('alice@example.com', 'pepper-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashRecipient differs across peppers', () => {
    expect(hashRecipient('alice@example.com', 'p1')).not.toBe(
      hashRecipient('alice@example.com', 'p2'),
    );
  });

  it('sha256Hex', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
