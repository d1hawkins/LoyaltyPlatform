import { canTransition } from '../src/status';
import { encodeCursor, decodeCursor } from '../src/cursor';
import {
  enrollMemberSchema,
  updateMemberSchema,
  setMemberStatusSchema,
  ledgerQuerySchema,
} from '../src/schemas';

describe('status transitions', () => {
  it('allows active -> suspended and suspended -> active', () => {
    expect(canTransition('active', 'suspended')).toBe(true);
    expect(canTransition('suspended', 'active')).toBe(true);
  });
  it('allows active -> closed and suspended -> closed', () => {
    expect(canTransition('active', 'closed')).toBe(true);
    expect(canTransition('suspended', 'closed')).toBe(true);
  });
  it('rejects any transition from closed (terminal)', () => {
    expect(canTransition('closed', 'active')).toBe(false);
    expect(canTransition('closed', 'suspended')).toBe(false);
  });
  it('rejects same-state transitions', () => {
    expect(canTransition('active', 'active')).toBe(false);
  });
});

describe('ledger cursor', () => {
  it('round-trips', () => {
    const id = '00000000-0000-0000-0000-0000000000aa';
    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });
  it('rejects an empty / invalid cursor', () => {
    expect(() => decodeCursor('')).toThrow();
  });
});

describe('zod schemas', () => {
  it('enrollMemberSchema requires phone and names', () => {
    const good = enrollMemberSchema.safeParse({
      phone: '+14155551212',
      firstName: 'A',
      lastName: 'B',
      enrolledChannel: 'pos',
    });
    expect(good.success).toBe(true);
    const bad = enrollMemberSchema.safeParse({ phone: '+1', enrolledChannel: 'pos' });
    expect(bad.success).toBe(false);
  });
  it('updateMemberSchema requires at least one field', () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
    expect(updateMemberSchema.safeParse({ firstName: 'X' }).success).toBe(true);
  });
  it('setMemberStatusSchema constrains status values', () => {
    expect(
      setMemberStatusSchema.safeParse({ status: 'active', reason: 'ok' }).success,
    ).toBe(true);
    expect(
      setMemberStatusSchema.safeParse({ status: 'bogus', reason: 'ok' }).success,
    ).toBe(false);
  });
  it('ledgerQuerySchema caps limit at 200 and defaults to 50', () => {
    expect(ledgerQuerySchema.parse({}).limit).toBe(50);
    expect(ledgerQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
