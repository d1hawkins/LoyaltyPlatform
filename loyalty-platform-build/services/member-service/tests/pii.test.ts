import {
  StaticPiiKeyProvider,
  encryptPII,
  decryptPII,
  hashLookup,
  normalizePhone,
  maskEmail,
  maskPhone,
} from '../src/pii';

const keyHex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

describe('PII utilities', () => {
  const provider = new StaticPiiKeyProvider(keyHex);

  it('encryptPII / decryptPII round-trips', () => {
    const secret = 'alice@example.com';
    const ct = encryptPII(secret, provider);
    expect(ct).not.toContain(secret);
    expect(decryptPII(ct, provider)).toBe(secret);
  });

  it('encryptPII produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encryptPII('hello', provider);
    const b = encryptPII('hello', provider);
    expect(a).not.toBe(b);
  });

  it('decryptPII rejects tampered ciphertext', () => {
    const ct = encryptPII('hello', provider);
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] = ((buf[buf.length - 1] ?? 0) ^ 0xff) & 0xff;
    expect(() => decryptPII(buf.toString('base64'), provider)).toThrow();
  });

  it('hashLookup is deterministic per tenant + differs across tenants', () => {
    const h1 = hashLookup('user@example.com', 't1', 'pepper');
    const h2 = hashLookup('user@example.com', 't1', 'pepper');
    const h3 = hashLookup('user@example.com', 't2', 'pepper');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizePhone normalizes to E.164-ish form', () => {
    expect(normalizePhone('(415) 555-1212')).toBe('+4155551212');
    expect(normalizePhone('+1 415 555 1212')).toBe('+14155551212');
    expect(normalizePhone('')).toBe('');
  });

  it('masks phone and email', () => {
    expect(maskPhone('+14155551212')).toBe('***1212');
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
  });
});
