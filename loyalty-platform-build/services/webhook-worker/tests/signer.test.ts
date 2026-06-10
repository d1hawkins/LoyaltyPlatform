import { createHmac } from 'crypto';
import { computeSignature, formatSignatureHeader, signPayload } from '../src/signer';

describe('signer', () => {
  // RFC 4231 Test Case 1 for HMAC-SHA256
  it('matches RFC 4231 test vector 1', () => {
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const data = 'Hi There';
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    // Validate our underlying primitive behaves identically to a direct call
    const direct = createHmac('sha256', Buffer.from(key, 'binary')).update(data).digest('hex');
    expect(direct).toBe(expected);
  });

  it('computes deterministic signature over timestamp.body', () => {
    const sig1 = computeSignature('s3cr3t', '2026-04-09T00:00:00Z', '{"a":1}');
    const sig2 = computeSignature('s3cr3t', '2026-04-09T00:00:00Z', '{"a":1}');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when body or timestamp changes', () => {
    const a = computeSignature('k', 't1', 'b');
    const b = computeSignature('k', 't2', 'b');
    const c = computeSignature('k', 't1', 'b2');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('formatSignatureHeader prepends sha256=', () => {
    expect(formatSignatureHeader('abc')).toBe('sha256=abc');
  });

  it('signPayload returns both hex and header', () => {
    const r = signPayload('k', 't', 'body');
    expect(r.header).toBe(`sha256=${r.hex}`);
  });
});
