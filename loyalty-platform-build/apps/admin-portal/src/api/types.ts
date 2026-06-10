// ── DTOs matching backend services ──

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
}

// ── Members (from member-service) ──
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

// ── Transactions (from loyalty-engine) ──
export interface TransactionDTO {
  transactionId: string;
  memberId: string;
  channel: 'pos' | 'ecommerce' | 'mobile' | 'admin';
  amount: number;
  currency: string;
  pointsEarned: number;
  status: 'committed' | 'voided';
  locationId?: string;
  occurredAt: string;
  createdAt: string;
  storeId?: string | null;
  storeName?: string | null;
  registerId?: string | null;
  associateId?: string | null;
  associateName?: string | null;
  sourceChannel?: string | null;
  sourceSystem?: string | null;
  orderRef?: string | null;
}

// ── Tiers ──
export interface TierDTO {
  id: string;
  name: string;
  sortOrder: number;
  thresholdPoints: number;
  multiplier: number;
  benefits: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TierCreateInput {
  name: string;
  sortOrder: number;
  thresholdPoints: number;
  multiplier: number;
  benefits?: Record<string, unknown>;
}

export interface TierUpdateInput {
  name?: string;
  sortOrder?: number;
  thresholdPoints?: number;
  multiplier?: number;
  benefits?: Record<string, unknown>;
}

// ── Program Config ──
export interface ProgramConfigDTO {
  id: string;
  programName: string;
  baseEarnRate: number;
  pointsExpiryDays: number;
  voidWindowHours: number;
  currency: string;
  timezone: string;
  configJson: Record<string, unknown>;
  updatedAt: string;
}

export interface ProgramConfigUpdateInput {
  programName?: string;
  baseEarnRate?: number;
  pointsExpiryDays?: number;
  voidWindowHours?: number;
  currency?: string;
  timezone?: string;
  earnMode?: 'per-dollar' | 'per-visit';
  pointsPerVisit?: number;
  visitMinSpendCents?: number;
  maxVisitsPerDay?: number | null;
}

// ── Webhooks ──
export interface WebhookDTO {
  id: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookCreateInput {
  url: string;
  events: string[];
}

export interface WebhookDeliveryDTO {
  id: string;
  webhookId: string;
  eventType: string;
  statusCode: number;
  success: boolean;
  attemptCount: number;
  lastAttemptAt: string;
  createdAt: string;
}

// ── API Keys ──
export interface ApiKeyDTO {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface ApiKeyCreateResponse {
  id: string;
  label: string;
  prefix: string;
  plaintextKey: string;
  createdAt: string;
}

// ── Audit Log ──
export interface AuditLogEntryDTO {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  createdAt: string;
}

// ── Feature Flags ──
export interface FeatureFlagDTO {
  key: string;
  enabled: boolean;
  updatedAt: string;
}

// ── Branding ──
export interface BrandingDTO {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  senderName: string;
  senderEmail: string;
}

// ── Analytics (from analytics-service) ──
export interface AnalyticsSummaryResponse {
  from: string;
  to: string;
  summaries: Array<{
    summaryDate: string;
    metricKey: string;
    metricValue: number;
    dimensionsJson?: Record<string, number>;
  }>;
  derived: {
    avgTransactionValue: number;
    pointsPerTransaction: number;
    redemptionRate: number;
    enrollmentGrowthRate: number;
    activeRate: number;
  };
}

export interface RealtimeKpiResponse {
  activeMembersToday: number;
  transactionsToday: number;
  pointsIssuedToday: number;
  redemptionsToday: number;
  asOf: string;
}

export interface TierDistributionResponse {
  tiers: Array<{
    tierId: string;
    tierName: string;
    memberCount: number;
    percentage: number;
  }>;
}

export interface EnrollmentTrendResponse {
  from: string;
  to: string;
  data?: Array<{ period: string; total: number; channels?: Record<string, number> }>;
  trend?: Array<{ period: string; enrollments: number; channels?: Record<string, number> }>;
  [key: string]: unknown;
}

export interface TransactionTrendResponse {
  from: string;
  to: string;
  data?: Array<{ period: string; totalTransactions: number; totalSpend: number; avgBasket: number; pointsPerTransaction: number; channels?: Record<string, number> }>;
  trend?: Array<{ period: string; count: number; totalSpendCents: number; avgBasketCents: number; channels?: Record<string, number> }>;
  [key: string]: unknown;
}

export interface PointsEconomyResponse {
  from: string;
  to: string;
  pointsIssued?: number;
  pointsRedeemed?: number;
  pointsExpired?: number;
  totalIssued?: number;
  totalRedeemed?: number;
  totalExpired?: number;
  netOutstanding?: number;
  liabilityEstimate?: number;
  [key: string]: unknown;
}

export interface RetentionCohortResponse {
  cohorts: Array<{
    cohortMonth: string;
    totalMembers: number;
    intervals: Array<{
      daysSinceEnroll: number;
      activeCount: number;
      retentionRate: number;
    }>;
  }>;
}

// ── Offers (Phase 2 — stubbed) ──
export interface OfferDTO {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'bonus_points' | 'free_item';
  value: number;
  minSpend?: number;
  maxRedemptions?: number;
  currentRedemptions: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Visit Analytics ──
export interface VisitAnalyticsResponse {
  totalTransactions: number;
  qualifiedVisits: number;
  unqualifiedTransactions: number;
  visitConversionRate: number;
  uniqueVisitors: number;
  avgVisitsPerMember: number;
  avgSpendPerVisit: number;
  totalPointsAwarded: number;
  dailyBreakdown: Array<{
    date: string;
    transactions: number;
    qualifiedVisits: number;
    pointsAwarded: number;
  }>;
}

// ── RFC 7807 Problem Details ──
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

// ── User / Auth ──
export type UserRole = 'owner' | 'manager' | 'analyst';

export interface AuthUser {
  userId: string;
  tenantId: string;
  roles: UserRole[];
  displayName: string;
  email?: string;
}
