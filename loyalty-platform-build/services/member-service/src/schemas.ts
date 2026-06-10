import { z } from 'zod';

export const enrolledChannelSchema = z.enum(['pos', 'ecommerce', 'mobile', 'admin']);

export const enrollMemberSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(4, 'phone required'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  enrolledChannel: enrolledChannelSchema,
});
export type EnrollMemberInput = z.infer<typeof enrollMemberSchema>;

export const updateMemberSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(4).optional(),
    communicationPrefs: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberStatusSchema = z.enum(['active', 'suspended', 'closed']);
export const setMemberStatusSchema = z.object({
  status: memberStatusSchema,
  reason: z.string().min(1).max(500),
});
export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>;

export const ledgerQuerySchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const lookupQuerySchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
});

/**
 * Response DTO for a member. PII is decrypted in the DTO for callers that
 * are authorized — masking is applied at the HTTP layer where needed.
 */
export interface MemberDTO {
  id: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'closed';
  tierId: string;
  tierName: string;
  pointsBalance: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  dateOfBirth?: string;
  enrolledChannel: string;
  enrolledAt: string;
  communicationPrefs?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSummaryDTO {
  id: string;
  firstName: string;
  lastName: string;
  tierId: string;
  tierName: string;
  pointsBalance: number;
  eligibleOffers: unknown[]; // placeholder — populated in Phase 2 by offer service
}

export interface LedgerEntryDTO {
  id: string;
  memberId: string;
  transactionId?: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note?: string;
  createdAt: string;
}

export interface PaginatedLedger {
  items: LedgerEntryDTO[];
  nextCursor?: string;
}
