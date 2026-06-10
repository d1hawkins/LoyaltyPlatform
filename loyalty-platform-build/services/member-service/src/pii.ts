import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for member PII at rest.
 * Format: base64(version|iv|authTag|ciphertext) — single opaque blob string.
 * Key versioning is supported via the `v` prefix so that Phase 2 rotation can
 * introduce new keys without breaking decryption of older ciphertexts.
 */
const VERSION = 1;
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

export interface PiiKeyProvider {
  getKey(version: number): Buffer;
  currentVersion(): number;
}

export class StaticPiiKeyProvider implements PiiKeyProvider {
  private readonly key: Buffer;
  constructor(hex: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('StaticPiiKeyProvider: expected 32-byte hex key');
    }
    this.key = Buffer.from(hex, 'hex');
  }
  public getKey(_version: number): Buffer {
    return this.key;
  }
  public currentVersion(): number {
    return VERSION;
  }
}

export function encryptPII(plaintext: string, provider: PiiKeyProvider): string {
  const version = provider.currentVersion();
  const key = provider.getKey(version);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from([version]);
  return Buffer.concat([header, iv, tag, ct]).toString('base64');
}

export function decryptPII(blob: string, provider: PiiKeyProvider): string {
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('decryptPII: ciphertext too short');
  }
  const version = buf[0] as number;
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = buf.subarray(1 + IV_LEN + TAG_LEN);
  const key = provider.getKey(version);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * HMAC-SHA256 hashing for deterministic lookup of email / phone values,
 * per-tenant peppered so that hashes are not comparable across tenants.
 */
export function hashLookup(value: string, tenantId: string, pepperBase: string): string {
  const pepper = createHmac('sha256', pepperBase).update(tenantId).digest();
  return createHmac('sha256', pepper).update(value.toLowerCase().trim()).digest('hex');
}

/** Normalize phone to a pseudo E.164 form for deterministic hashing. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  // Keep leading + if present; strip all non-digits otherwise.
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.slice(1).replace(/\D/g, '');
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits.length > 0 ? '+' + digits : '';
}

/** Mask PII for API responses — last 4 of phone visible, email local part hidden. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return '***' + phone.slice(-4);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local && local.length > 0 ? (local[0] as string) : '*';
  return `${visible}***@${domain}`;
}
