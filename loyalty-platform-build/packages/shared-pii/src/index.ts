import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

/**
 * Shared PII helpers for services that must encrypt personal data at rest
 * and hash recipient identifiers for deterministic lookup / audit.
 *
 * The AES-256-GCM blob format matches the existing member-service
 * implementation byte-for-byte (single-byte version + 12-byte IV + 16-byte
 * auth tag + ciphertext, base64-encoded), so member-service can migrate to
 * this package without rewriting its ciphertext column.
 *
 * Format: base64( version[1] | iv[12] | authTag[16] | ciphertext )
 */
const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

function keyFromHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('shared-pii: expected 32-byte hex key (64 hex chars)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from([VERSION]);
  return Buffer.concat([header, iv, tag, ct]).toString('base64');
}

export function decrypt(blob: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('shared-pii: ciphertext too short');
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`shared-pii: unsupported ciphertext version ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Deterministic SHA-256 hash of a recipient identifier (email or phone)
 * peppered with a service-wide secret so the hashes cannot be cross-linked
 * to raw values by an attacker who obtains the database but not the pepper.
 *
 * Returned as a lowercase hex string (64 chars). Normalization: trims and
 * lowercases before hashing so case differences in emails collapse.
 */
export function hashRecipient(plaintext: string, pepper: string): string {
  const normalized = plaintext.trim().toLowerCase();
  return createHmac('sha256', pepper).update(normalized).digest('hex');
}

/** Convenience: plain SHA-256 (no pepper) hex — useful for non-PII digests. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
