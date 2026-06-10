// ---- Client options ----

export interface LoyaltyClientOptions {
  /** Base URL for the Loyalty Platform API (e.g. https://loyalty-dev-apim-xxx.azure-api.net) */
  apiUrl: string;
  /** API subscription key (Ocp-Apim-Subscription-Key) */
  apiKey: string;
  /** Tenant identifier */
  tenantId: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum retries on 429/5xx (default: 2) */
  maxRetries?: number;
}

// ---- Member types ----

export type MemberStatus = 'active' | 'suspended' | 'closed';

export interface Member {
  id: string;
  tenantId: string;
  status: MemberStatus;
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

export interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  tierId: string;
  tierName: string;
  pointsBalance: number;
  eligibleOffers: unknown[];
}

export interface EnrollMemberInput {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  enrolledChannel: 'pos' | 'ecommerce' | 'mobile' | 'admin';
}

// ---- Transaction types ----

export interface SkuItem {
  sku: string;
  categoryId?: string;
  amount: number;
}

export interface RecordTransactionInput {
  memberId: string;
  channel: 'pos' | 'ecommerce' | 'mobile' | 'admin';
  amount: number;
  currency: string;
  skuList?: SkuItem[];
  locationId?: string;
  occurredAt?: string;
}

export interface AppliedMultiplier {
  source: string;
  multiplier: number;
  points: number;
}

export interface TransactionResult {
  transactionId: string;
  pointsEarned: number;
  newBalance: number;
  tierId: string;
  appliedMultipliers: AppliedMultiplier[];
}

// ---- Balance ----

export interface BalanceResult {
  balance: number;
  lastUpdated: string;
}

// ---- Offer types ----

export type OfferType = 'percent' | 'fixed' | 'bogo' | 'threshold' | 'referral';

export interface Offer {
  id: string;
  tenantId: string;
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

export interface RedeemOfferInput {
  memberId: string;
  offerId: string;
  pointsToBurn: number;
  redemptionContext?: Record<string, unknown>;
}

export interface RedemptionResult {
  redemptionId: string;
  pointsUsed: number;
  newBalance: number;
}

// ---- Ledger ----

export type LedgerReason = 'earn' | 'redeem' | 'void' | 'expire' | 'adjust' | 'bonus' | 'transfer';

export interface LedgerEntry {
  id: string;
  memberId: string;
  transactionId?: string;
  delta: number;
  balanceAfter: number;
  reason: LedgerReason;
  note?: string;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

// ---- Tier ----

export interface TierBenefits {
  earnMultiplier: number;
  bonusPointsOnEnroll?: number;
  freeShipping?: boolean;
  birthdayBonus?: number;
  customBenefits?: Record<string, unknown>;
}

export interface Tier {
  id: string;
  tenantId: string;
  name: string;
  rank: number;
  thresholdPoints: number;
  thresholdSpendCents?: number;
  benefits: TierBenefits;
  createdAt: string;
  updatedAt: string;
}
