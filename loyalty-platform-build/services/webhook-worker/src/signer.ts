import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 signer.
 *
 * Canonical string: `${timestamp}.${body}`
 * Signature format: `sha256=${hexDigest}`
 *
 * Consumers verify by recomputing HMAC-SHA256 with their shared secret
 * over `${X-Loyalty-Timestamp}.${rawBody}` and comparing in constant time
 * against the value after the `sha256=` prefix in `X-Loyalty-Signature`.
 */
export function computeSignature(secret: string, timestamp: string, body: string): string {
  const h = createHmac('sha256', secret);
  h.update(`${timestamp}.${body}`);
  return h.digest('hex');
}

export function formatSignatureHeader(hex: string): string {
  return `sha256=${hex}`;
}

export function signPayload(
  secret: string,
  timestamp: string,
  body: string,
): { hex: string; header: string } {
  const hex = computeSignature(secret, timestamp, body);
  return { hex, header: formatSignatureHeader(hex) };
}
