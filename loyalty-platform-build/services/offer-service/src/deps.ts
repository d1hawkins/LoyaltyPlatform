/**
 * Dependency interfaces for the offer service.
 * Concrete implementations (mssql, HTTP) are injected at startup;
 * tests swap in in-memory doubles.
 */

export interface OfferRow {
  offerId: string;
  name: string;
  description: string | null;
  type: 'percent' | 'fixed' | 'bogo' | 'threshold';
  value: number;
  minPurchase: number | null;
  pointsCost: number | null;
  conditionsJson: Record<string, unknown> | null;
  targetingJson: Record<string, unknown> | null;
  validFrom: string;
  validTo: string;
  maxRedemptions: number | null;
  currentRedemptions: number;
  perMemberLimit: number;
  isStackable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Visit-based eligibility (V19)
  minVisits?: number | null;
  visitWindowDays?: number | null;
  visitResetOnRedeem?: boolean | null;
  visitMinSpendCents?: number | null;
  visitMinItems?: number | null;
  visitMinUniqueSku?: number | null;
  visitChannels?: string[] | null;
  visitStoreIds?: string[] | null;
  visitCountMode?: 'per-day' | 'per-transaction';
}

export interface RedemptionRow {
  redemptionId: string;
  memberId: string;
  offerId: string;
  channel: string;
  pointsUsed: number;
  discountValue: number;
  redemptionCode: string | null;
  status: 'completed' | 'reversed';
  redeemedAt: string;
  reversedAt: string | null;
  createdAt: string;
}

export interface OfferCodeRow {
  code: string;
  offerId: string;
  memberId: string | null;
  status: 'available' | 'assigned' | 'redeemed' | 'expired';
  assignedAt: string | null;
  redeemedAt: string | null;
}

export interface MemberInfo {
  memberId: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'closed';
  tierId: string;
  pointsBalance: number;
}

export interface OfferDb {
  // Offers CRUD
  createOffer(tenantId: string, offer: OfferRow): Promise<void>;
  updateOffer(tenantId: string, offerId: string, updates: Partial<OfferRow>): Promise<void>;
  getOffer(tenantId: string, offerId: string): Promise<OfferRow | null>;
  listOffers(tenantId: string, filters?: { type?: string; active?: boolean }): Promise<OfferRow[]>;
  deactivateOffer(tenantId: string, offerId: string): Promise<void>;

  // Redemptions
  createRedemption(tenantId: string, redemption: RedemptionRow): Promise<void>;
  getRedemption(tenantId: string, redemptionId: string): Promise<RedemptionRow | null>;
  countMemberRedemptions(tenantId: string, memberId: string, offerId: string): Promise<number>;
  incrementOfferRedemptions(tenantId: string, offerId: string): Promise<void>;
  decrementOfferRedemptions(tenantId: string, offerId: string): Promise<void>;
  reverseRedemption(tenantId: string, redemptionId: string): Promise<void>;

  // Visit counting (V19)
  getQualifiedVisitCount(tenantId: string, memberId: string, config: {
    windowDays?: number | null;
    minSpendCents?: number | null;
    minItems?: number | null;
    channels?: string[] | null;
    storeIds?: string[] | null;
    visitCountMode?: 'per-day' | 'per-transaction';
  }): Promise<number>;

  // Offer codes
  createCodes(tenantId: string, codes: OfferCodeRow[]): Promise<void>;
  listCodes(tenantId: string, offerId: string, status?: string): Promise<OfferCodeRow[]>;
  getCode(tenantId: string, code: string): Promise<OfferCodeRow | null>;
  getMemberCodeForOffer(tenantId: string, memberId: string, offerId: string): Promise<OfferCodeRow | null>;
  redeemCode(tenantId: string, code: string, memberId: string): Promise<void>;
  unredeemCode(tenantId: string, code: string): Promise<void>;
}

export interface EventPublisher {
  publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<void>;
}

export interface LoyaltyEngineClient {
  redeemPoints(tenantId: string, body: {
    memberId: string;
    offerId: string;
    pointsToBurn: number;
  }): Promise<{ redemptionId: string; pointsUsed: number; newBalance: number }>;

  reverseRedemption(tenantId: string, body: {
    memberId: string;
    pointsToRestore: number;
  }): Promise<{ newBalance: number }>;
}

export interface MemberClient {
  getMember(tenantId: string, memberId: string): Promise<MemberInfo | null>;
}
