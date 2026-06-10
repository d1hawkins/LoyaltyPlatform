import { createOfferSchema, updateOfferSchema, createRedemptionSchema, generateCodesSchema } from '../src/schemas';

describe('createOfferSchema', () => {
  const validInput = {
    name: 'Summer Sale',
    type: 'percent' as const,
    value: 15,
    validFrom: '2026-06-01T00:00:00Z',
    validTo: '2026-08-31T23:59:59Z',
  };

  it('parses valid minimal input with defaults', () => {
    const result = createOfferSchema.parse(validInput);
    expect(result.name).toBe('Summer Sale');
    expect(result.perMemberLimit).toBe(1);
    expect(result.isStackable).toBe(false);
    expect(result.isActive).toBe(true);
  });

  it('parses full input', () => {
    const result = createOfferSchema.parse({
      ...validInput,
      description: 'Big sale',
      minPurchase: 50.0,
      pointsCost: 200,
      conditionsJson: { minItems: 3 },
      targetingJson: { requiredTiers: ['gold'] },
      maxRedemptions: 1000,
      perMemberLimit: 5,
      isStackable: true,
      isActive: false,
    });
    expect(result.description).toBe('Big sale');
    expect(result.pointsCost).toBe(200);
    expect(result.targetingJson).toEqual({ requiredTiers: ['gold'] });
  });

  it('rejects missing name', () => {
    expect(() => createOfferSchema.parse({ ...validInput, name: '' })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() => createOfferSchema.parse({ ...validInput, type: 'invalid' })).toThrow();
  });

  it('rejects negative value', () => {
    expect(() => createOfferSchema.parse({ ...validInput, value: -5 })).toThrow();
  });

  it('rejects invalid datetime', () => {
    expect(() => createOfferSchema.parse({ ...validInput, validFrom: 'not-a-date' })).toThrow();
  });
});

describe('updateOfferSchema', () => {
  it('accepts partial updates', () => {
    const result = updateOfferSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
    expect(result.type).toBeUndefined();
  });

  it('accepts empty object', () => {
    const result = updateOfferSchema.parse({});
    expect(result).toEqual({});
  });
});

describe('createRedemptionSchema', () => {
  it('parses valid input', () => {
    const result = createRedemptionSchema.parse({
      memberId: '00000000-0000-0000-0000-000000000001',
      offerId: '00000000-0000-0000-0000-000000000002',
      channel: 'pos',
    });
    expect(result.memberId).toBeDefined();
    expect(result.redemptionCode).toBeUndefined();
  });

  it('accepts optional redemption code', () => {
    const result = createRedemptionSchema.parse({
      memberId: '00000000-0000-0000-0000-000000000001',
      offerId: '00000000-0000-0000-0000-000000000002',
      channel: 'ecommerce',
      redemptionCode: 'SUMMER-ABC123',
    });
    expect(result.redemptionCode).toBe('SUMMER-ABC123');
  });

  it('rejects invalid memberId', () => {
    expect(() =>
      createRedemptionSchema.parse({ memberId: 'not-uuid', offerId: '00000000-0000-0000-0000-000000000002', channel: 'pos' }),
    ).toThrow();
  });

  it('rejects missing channel', () => {
    expect(() =>
      createRedemptionSchema.parse({
        memberId: '00000000-0000-0000-0000-000000000001',
        offerId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toThrow();
  });
});

describe('generateCodesSchema', () => {
  it('parses valid input', () => {
    const result = generateCodesSchema.parse({ count: 100 });
    expect(result.count).toBe(100);
    expect(result.prefix).toBeUndefined();
  });

  it('accepts prefix', () => {
    const result = generateCodesSchema.parse({ count: 50, prefix: 'SALE' });
    expect(result.prefix).toBe('SALE');
  });

  it('rejects count below 1', () => {
    expect(() => generateCodesSchema.parse({ count: 0 })).toThrow();
  });

  it('rejects count above 10000', () => {
    expect(() => generateCodesSchema.parse({ count: 10001 })).toThrow();
  });
});
