// Main entry point for @loyalty/loyalty-js-sdk

export { LoyaltyClient } from './client';
export { HttpClient } from './http';
export type { HttpClientOptions } from './http';

// Types
export type {
  LoyaltyClientOptions,
  Member,
  MemberSummary,
  MemberStatus,
  EnrollMemberInput,
  SkuItem,
  RecordTransactionInput,
  AppliedMultiplier,
  TransactionResult,
  BalanceResult,
  OfferType,
  Offer,
  RedeemOfferInput,
  RedemptionResult,
  LedgerReason,
  LedgerEntry,
  PaginatedResult,
  Tier,
  TierBenefits,
} from './types';

// Errors
export {
  LoyaltyError,
  TimeoutError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
} from './errors';

// Widgets
export { renderBalanceWidget } from './widgets/balance-widget';
export { renderOffersWidget } from './widgets/offers-widget';
export { renderTierProgressWidget } from './widgets/tier-widget';
