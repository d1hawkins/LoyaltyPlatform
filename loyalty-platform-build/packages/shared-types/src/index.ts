// Branded ID types
export type MemberId = string & { readonly __brand: 'MemberId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type OfferId = string & { readonly __brand: 'OfferId' };
export type TierId = string & { readonly __brand: 'TierId' };
export type LedgerEntryId = string & { readonly __brand: 'LedgerEntryId' };
export type RedemptionId = string & { readonly __brand: 'RedemptionId' };
export type WebhookId = string & { readonly __brand: 'WebhookId' };

// Member
export type MemberStatus = 'active' | 'suspended' | 'closed';

export interface MemberPII {
  email?: string;
  phone: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
}

export interface Member {
  id: MemberId;
  tenantId: TenantId;
  status: MemberStatus;
  tierId: TierId;
  pointsBalance: number;
  phoneHash: string;
  emailEncrypted?: string;
  phoneEncrypted: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  communicationPrefs?: Record<string, unknown>;
  enrolledAt: string;
  channel: TransactionChannel;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
}

// Tier
export interface TierBenefits {
  earnMultiplier: number;
  bonusPointsOnEnroll?: number;
  freeShipping?: boolean;
  birthdayBonus?: number;
  customBenefits?: Record<string, unknown>;
}

export interface Tier {
  id: TierId;
  tenantId: TenantId;
  name: string;
  rank: number;
  thresholdPoints: number;
  thresholdSpendCents?: number;
  benefits: TierBenefits;
  createdAt: string;
  updatedAt: string;
}

// Transaction
export type TransactionChannel = 'pos' | 'ecommerce' | 'mobile' | 'admin';

export interface TransactionItem {
  sku: string;
  categoryCode?: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Transaction {
  id: TransactionId;
  tenantId: TenantId;
  memberId: MemberId;
  channel: TransactionChannel;
  amountCents: number;
  currency: string;
  locationId?: string;
  items?: TransactionItem[];
  idempotencyKey: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

// Points ledger
export type LedgerReason = 'earn' | 'redeem' | 'void' | 'expire' | 'adjust' | 'bonus' | 'transfer';

export interface PointsLedgerEntry {
  id: LedgerEntryId;
  tenantId: TenantId;
  memberId: MemberId;
  transactionId?: TransactionId;
  delta: number;
  balanceAfter: number;
  reason: LedgerReason;
  note?: string;
  createdAt: string;
}

// Offer
export type OfferType = 'percent' | 'fixed' | 'bogo' | 'threshold' | 'referral';

export interface Offer {
  id: OfferId;
  tenantId: TenantId;
  code: string;
  name: string;
  description?: string;
  type: OfferType;
  value: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  eligibilityRules?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Redemption {
  id: RedemptionId;
  tenantId: TenantId;
  offerId: OfferId;
  memberId: MemberId;
  transactionId?: TransactionId;
  valueAppliedCents: number;
  redeemedAt: string;
}

// Tenant
export type TenantStatus = 'active' | 'suspended' | 'deprovisioned';

export interface TenantConfig {
  baseEarnRate: number; // points per dollar
  pointsExpiryDays?: number;
  tierMode: 'points' | 'spend' | 'hybrid';
  currency: string;
  featureFlags?: Record<string, boolean>;
}

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  status: TenantStatus;
  dbSecretName: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
}

// Webhook
export type WebhookEventType =
  | 'member.enrolled'
  | 'member.updated'
  | 'member.deleted'
  | 'points.earned'
  | 'points.redeemed'
  | 'tier.upgraded'
  | 'tier.downgraded'
  | 'transaction.voided'
  | 'webhook.delivery';

export interface WebhookConfig {
  id: WebhookId;
  tenantId: TenantId;
  eventType: WebhookEventType;
  targetUrl: string;
  secretHash: string;
  isActive: boolean;
  retryCount: number;
  createdAt: string;
}

// Pagination & errors
export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  [key: string]: unknown;
}
