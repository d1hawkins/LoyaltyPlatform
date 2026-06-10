import { HttpClient } from './http';
import type {
  LoyaltyClientOptions,
  Member,
  MemberSummary,
  EnrollMemberInput,
  RecordTransactionInput,
  TransactionResult,
  BalanceResult,
  Offer,
  RedeemOfferInput,
  RedemptionResult,
  LedgerEntry,
  PaginatedResult,
} from './types';

/**
 * Main entry point for the Loyalty Platform JavaScript SDK.
 *
 * Usage:
 * ```ts
 * const client = new LoyaltyClient({
 *   apiUrl: 'https://loyalty-dev-apim-xxx.azure-api.net',
 *   apiKey: 'your-subscription-key',
 *   tenantId: 'your-tenant-id',
 * });
 *
 * const member = await client.enrollMember({
 *   phone: '+15555551234',
 *   firstName: 'Jane',
 *   lastName: 'Doe',
 *   enrolledChannel: 'ecommerce',
 * });
 * ```
 */
export class LoyaltyClient {
  private readonly http: HttpClient;

  constructor(opts: LoyaltyClientOptions) {
    this.http = new HttpClient({
      baseUrl: opts.apiUrl,
      apiKey: opts.apiKey,
      tenantId: opts.tenantId,
      timeout: opts.timeout ?? 10_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  // ---- Members ----

  /** Enroll a new loyalty member. */
  async enrollMember(data: EnrollMemberInput): Promise<Member> {
    return this.http.post<Member>('/member/v1/members', data);
  }

  /** Get a member by ID. */
  async getMember(id: string): Promise<Member> {
    return this.http.get<Member>(`/member/v1/members/${encodeURIComponent(id)}`);
  }

  /** Lookup a member by phone number. Returns null if not found. */
  async lookupByPhone(phone: string): Promise<MemberSummary | null> {
    try {
      return await this.http.get<MemberSummary>('/member/v1/members', { phone });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** Lookup a member by email. Returns null if not found. */
  async lookupByEmail(email: string): Promise<MemberSummary | null> {
    try {
      return await this.http.get<MemberSummary>('/member/v1/members', { email });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ---- Transactions ----

  /** Record a purchase transaction and earn points. */
  async recordTransaction(data: RecordTransactionInput): Promise<TransactionResult> {
    return this.http.post<TransactionResult>('/engine/v1/transactions', data);
  }

  /** Void a previously recorded transaction. */
  async voidTransaction(txnId: string, reason: string): Promise<void> {
    await this.http.post<void>(`/engine/v1/transactions/${encodeURIComponent(txnId)}/void`, { reason });
  }

  // ---- Balance ----

  /** Get the current points balance for a member. */
  async getBalance(memberId: string): Promise<BalanceResult> {
    return this.http.get<BalanceResult>(`/engine/v1/members/${encodeURIComponent(memberId)}/balance`);
  }

  // ---- Offers ----

  /**
   * Get offers eligible for a member.
   * NOTE: Requires the Offer Service (T-13/A-13) to be deployed.
   */
  async getEligibleOffers(memberId: string): Promise<Offer[]> {
    const result = await this.http.get<{ items: Offer[] }>(
      `/member/v1/members/${encodeURIComponent(memberId)}/offers`,
    );
    return result.items ?? [];
  }

  /**
   * Redeem an offer by burning points.
   * NOTE: Requires the Offer Service (T-13/A-13) to be deployed.
   */
  async redeemOffer(data: RedeemOfferInput): Promise<RedemptionResult> {
    return this.http.post<RedemptionResult>('/engine/v1/redemptions', data);
  }

  // ---- Ledger ----

  /** Get paginated points ledger for a member. */
  async getLedger(
    memberId: string,
    opts?: { after?: string; limit?: number },
  ): Promise<PaginatedResult<LedgerEntry>> {
    const query: Record<string, string> = {};
    if (opts?.after) query['after'] = opts.after;
    if (opts?.limit) query['limit'] = String(opts.limit);
    return this.http.get<PaginatedResult<LedgerEntry>>(
      `/member/v1/members/${encodeURIComponent(memberId)}/ledger`,
      query,
    );
  }
}
