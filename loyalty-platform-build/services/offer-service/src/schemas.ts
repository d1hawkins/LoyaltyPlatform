import { z } from 'zod';

// --------------- Offer Schemas ---------------

export const offerTypeSchema = z.enum(['percent', 'fixed', 'bogo', 'threshold']);
export type OfferTypeEnum = z.infer<typeof offerTypeSchema>;

export const createOfferSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: offerTypeSchema,
  value: z.number().positive(),
  minPurchase: z.number().nonnegative().optional().nullable(),
  pointsCost: z.number().int().nonnegative().optional().nullable(),
  conditionsJson: z.record(z.unknown()).optional().nullable(),
  targetingJson: z.record(z.unknown()).optional().nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  perMemberLimit: z.number().int().positive().default(1),
  isStackable: z.boolean().default(false),
  isActive: z.boolean().default(true),

  // Visit-based eligibility (V19)
  minVisits: z.number().int().nonnegative().optional().nullable(),
  visitWindowDays: z.number().int().positive().optional().nullable(),
  visitResetOnRedeem: z.boolean().optional().nullable(),
  visitMinSpendCents: z.number().int().nonnegative().optional().nullable(),
  visitMinItems: z.number().int().nonnegative().optional().nullable(),
  visitMinUniqueSku: z.number().int().nonnegative().optional().nullable(),
  visitChannels: z.array(z.string()).optional().nullable(),
  visitStoreIds: z.array(z.string()).optional().nullable(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = createOfferSchema.partial();
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

// --------------- Redemption Schemas ---------------

export const createRedemptionSchema = z.object({
  memberId: z.string().uuid(),
  offerId: z.string().uuid(),
  channel: z.string().min(1),
  redemptionCode: z.string().max(50).optional(),
});
export type CreateRedemptionInput = z.infer<typeof createRedemptionSchema>;

export const reverseRedemptionSchema = z.object({
  reason: z.string().min(1).optional(),
});

// --------------- Code Generation Schema ---------------

export const generateCodesSchema = z.object({
  count: z.number().int().min(1).max(10000),
  prefix: z.string().max(10).optional(),
});
export type GenerateCodesInput = z.infer<typeof generateCodesSchema>;
