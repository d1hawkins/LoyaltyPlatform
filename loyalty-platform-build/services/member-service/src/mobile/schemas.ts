import { z } from 'zod';

// --- Query schemas ---

export const dashboardParamsSchema = z.object({
  memberId: z.string().uuid(),
});

export const transactionQuerySchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const offersParamsSchema = z.object({
  memberId: z.string().uuid(),
});

export const tierProgressParamsSchema = z.object({
  memberId: z.string().uuid(),
});

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// --- Push registration ---

export const pushRegisterSchema = z.object({
  memberId: z.string().uuid(),
  deviceToken: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android']),
});
export type PushRegisterInput = z.infer<typeof pushRegisterSchema>;

// --- Notification preferences ---

export const notificationPreferencesSchema = z.object({
  memberId: z.string().uuid(),
  templateKey: z.string().min(1).max(100),
  optedIn: z.boolean(),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

// --- Response DTOs ---

export interface TierProgressDTO {
  current: {
    tierId: string;
    tierName: string;
    rank: number;
    thresholdPoints: number;
    benefits: TierBenefitsDTO;
  };
  next: {
    tierId: string;
    tierName: string;
    rank: number;
    thresholdPoints: number;
    benefits: TierBenefitsDTO;
  } | null;
  pointsToNext: number;
  percentComplete: number;
}

export interface TierBenefitsDTO {
  earnMultiplier: number;
  bonusPointsOnEnroll?: number;
  freeShipping?: boolean;
  birthdayBonus?: number;
  customBenefits?: Record<string, unknown>;
}

export interface MobileTransactionDTO {
  id: string;
  memberId: string;
  channel: string;
  amountCents: number;
  currency: string;
  pointsEarned: number;
  createdAt: string;
}

export interface MobileOfferDTO {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: string;
  value: number;
  startsAt: string;
  endsAt: string;
  imageUrl?: string;
}

export interface MobileDashboardDTO {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  tier: {
    id: string;
    name: string;
  };
  balance: number;
  tierProgress: TierProgressDTO;
  recentTransactions: MobileTransactionDTO[];
  eligibleOffers: MobileOfferDTO[];
  unreadNotifications: number;
}

export interface MobileNotificationDTO {
  id: string;
  templateKey: string;
  channel: string;
  status: string;
  createdAt: string;
}

export interface PushRegistration {
  memberId: string;
  deviceToken: string;
  platform: 'ios' | 'android';
  registeredAt: string;
}
