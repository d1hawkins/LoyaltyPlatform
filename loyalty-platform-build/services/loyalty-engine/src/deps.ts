/**
 * Dependency interfaces for the loyalty engine. Concrete implementations
 * (mssql, ioredis, ServiceBusPublisher, member-service HTTP client) are
 * injected at startup; tests swap in in-memory doubles.
 */

import type { CalculatorPromoMultiplier } from './points-calculator';

export interface MemberRecord {
  memberId: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'closed';
  tierId: string;
  tierMultiplier: number;
}

export interface ProgramConfig {
  baseEarnRate: number;
  voidWindowHours: number;
  multiplierCap: number;
  currency: string;
  promoMultipliers: CalculatorPromoMultiplier[];
  pointsExpiryMonths?: number | null;
  expiryNotificationDays?: string | null;
  earnMode: 'per-dollar' | 'per-visit';
  pointsPerVisit: number | null;
  visitMinSpendCents: number | null;
  maxVisitsPerDay: number | null;
}

export interface TransactionRow {
  id: string;
  tenantId: string;
  memberId: string;
  channel: string;
  amount: number;
  currency: string;
  status: 'committed' | 'voided';
  pointsEarned: number;
  ledgerId: string;
  locationId?: string;
  skuList: unknown;
  occurredAt: string;
  createdAt: string;
  idempotencyKey?: string;
  storeId?: string;
  storeName?: string;
  registerId?: string;
  associateId?: string;
  associateName?: string;
  sourceChannel?: string;
  sourceSystem?: string;
  orderRef?: string;
  basketSize?: number;
  metadata?: Record<string, unknown>;
}

export interface LedgerEntryRow {
  id: string;
  tenantId: string;
  memberId: string;
  transactionId?: string;
  delta: number;
  balanceAfter: number;
  reasonCode: 'earn' | 'redeem' | 'void' | 'expire' | 'adjust' | 'bonus' | 'transfer';
  refLedgerId?: string;
  note?: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface ExpiringCredit {
  ledgerId: string;
  memberId: string;
  delta: number;
  expiresAt: string;
  /** Sum of absolute deltas of debit entries referencing this credit */
  alreadyUsed: number;
}

export interface ExpiryWarningCredit {
  memberId: string;
  totalExpiringPoints: number;
  earliestExpiryDate: string;
}

export interface IdempotencyRecord {
  idempotencyKey: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
}

/**
 * Tx-scoped database handle. All writes that must be atomic go through
 * this single object inside a `withTransaction` callback.
 */
export interface LoyaltyTx {
  insertTransaction(row: Omit<TransactionRow, 'createdAt'>): Promise<void>;
  updateTransactionStatus(id: string, status: 'voided'): Promise<void>;
  insertLedgerEntry(row: Omit<LedgerEntryRow, 'createdAt'>): Promise<void>;
  currentBalance(memberId: string): Promise<number>;
}

export interface LoyaltyDb {
  withTransaction<T>(tenantId: string, fn: (tx: LoyaltyTx) => Promise<T>): Promise<T>;
  getBalance(tenantId: string, memberId: string): Promise<number>;
  getTransaction(tenantId: string, id: string): Promise<TransactionRow | null>;
  getLedgerEntry(tenantId: string, id: string): Promise<LedgerEntryRow | null>;
  getProgramConfig(tenantId: string): Promise<ProgramConfig>;
  ensureIdempotencyTable(): Promise<void>;
  getIdempotency(tenantId: string, key: string): Promise<IdempotencyRecord | null>;
  putIdempotency(tenantId: string, rec: IdempotencyRecord): Promise<void>;

  // Per-visit earn mode
  countTodayVisits(tenantId: string, memberId: string): Promise<number>;

  // Expiry-related queries
  getExpiringCredits(tenantId: string, asOfDate?: Date): Promise<ExpiringCredit[]>;
  getCreditsExpiringInDays(tenantId: string, days: number, asOfDate?: Date): Promise<ExpiryWarningCredit[]>;
  getLedgerEntriesWithoutExpiry(tenantId: string): Promise<LedgerEntryRow[]>;
  setExpiresAt(tenantId: string, ledgerId: string, expiresAt: string): Promise<void>;
}

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface EventPublisher {
  publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<void>;
}

export interface MemberClient {
  getMember(tenantId: string, memberId: string): Promise<MemberRecord | null>;
}
