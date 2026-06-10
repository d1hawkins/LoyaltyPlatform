import type {
  PaginatedResponse,
  MemberDTO,
  LedgerEntryDTO,
  TierDTO,
  TierCreateInput,
  TierUpdateInput,
  ProgramConfigDTO,
  ProgramConfigUpdateInput,
  WebhookDTO,
  WebhookCreateInput,
  WebhookDeliveryDTO,
  ApiKeyDTO,
  ApiKeyCreateResponse,
  AuditLogEntryDTO,
  FeatureFlagDTO,
  BrandingDTO,
  AnalyticsSummaryResponse,
  RealtimeKpiResponse,
  TierDistributionResponse,
  EnrollmentTrendResponse,
  TransactionTrendResponse,
  PointsEconomyResponse,
  RetentionCohortResponse,
  ProblemDetail,
  TransactionDTO,
  VisitAnalyticsResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: ProblemDetail,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

interface ClientOptions {
  adminBaseUrl: string;
  analyticsBaseUrl: string;
  tenantId: string;
  userId: string;
  userRole: string;
  token?: string;
  subscriptionKey?: string;
}

function getDefaultOptions(): ClientOptions {
  return {
    adminBaseUrl: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/v1/admin` : '/v1/admin',
    analyticsBaseUrl: import.meta.env.VITE_ANALYTICS_URL ? `${import.meta.env.VITE_ANALYTICS_URL}/v1/analytics` : '/v1/analytics',
    tenantId: import.meta.env.VITE_TENANT_ID || '11111111-1111-1111-1111-111111111111',
    userId: import.meta.env.VITE_USER_ID || 'dev-admin',
    userRole: import.meta.env.VITE_USER_ROLE || 'owner',
  };
}

class AdminApiClient {
  private opts: ClientOptions;

  constructor(opts?: Partial<ClientOptions>) {
    this.opts = { ...getDefaultOptions(), ...opts };
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    init?: RequestInit & { rawResponse?: boolean },
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-Tenant-ID': this.opts.tenantId,
      'X-User-ID': this.opts.userId,
      'X-User-Role': this.opts.userRole,
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (this.opts.token) {
      headers['Authorization'] = `Bearer ${this.opts.token}`;
    }
    if (this.opts.subscriptionKey) {
      headers['Ocp-Apim-Subscription-Key'] = this.opts.subscriptionKey;
    }

    const res = await fetch(url, {
      ...init,
      headers,
    });

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
        const problem = (await res.json()) as ProblemDetail;
        throw new ApiError(res.status, problem);
      }
      throw new ApiError(res.status, {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        detail: await res.text(),
      });
    }

    // Handle CSV/blob downloads
    if (init?.rawResponse) {
      return res as unknown as T;
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  private admin<T>(path: string, init?: RequestInit & { rawResponse?: boolean }): Promise<T> {
    return this.request<T>(this.opts.adminBaseUrl, path, init);
  }

  private analytics<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(this.opts.analyticsBaseUrl, path, init);
  }

  // ── Program Config ──
  getProgram(): Promise<ProgramConfigDTO> {
    return this.admin('/program');
  }

  updateProgram(data: ProgramConfigUpdateInput): Promise<ProgramConfigDTO> {
    return this.admin('/program', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  getProgramVersionHistory(): Promise<PaginatedResponse<AuditLogEntryDTO>> {
    return this.admin('/program/version-history');
  }

  // ── Tiers ──
  async getTiers(): Promise<TierDTO[]> {
    const res = await this.admin<{items: TierDTO[]} | TierDTO[]>('/tiers');
    return Array.isArray(res) ? res : res.items;
  }

  createTier(data: TierCreateInput): Promise<TierDTO> {
    return this.admin('/tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  updateTier(id: string, data: TierUpdateInput): Promise<TierDTO> {
    return this.admin(`/tiers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  deleteTier(id: string): Promise<void> {
    return this.admin(`/tiers/${id}`, { method: 'DELETE' });
  }

  // ── Members ──
  searchMembers(params: {
    query?: string;
    status?: string;
    tierId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResponse<MemberDTO>> {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', params.query);
    if (params.status) qs.set('status', params.status);
    if (params.tierId) qs.set('tierId', params.tierId);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit) qs.set('limit', String(params.limit));
    return this.admin(`/members/search?${qs.toString()}`);
  }

  getMember(id: string): Promise<MemberDTO> {
    return this.admin(`/members/${id}`);
  }

  getMemberLedger(id: string, params?: { cursor?: string; limit?: number }): Promise<PaginatedResponse<LedgerEntryDTO>> {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    return this.admin(`/members/${id}/ledger?${qs.toString()}`);
  }

  exportMembersCsv(): Promise<Response> {
    return this.admin('/members/export.csv', { rawResponse: true });
  }

  adjustPoints(memberId: string, data: { delta: number; reason: string }): Promise<{ ledgerId: string; delta: number; newBalance: number }> {
    return this.admin(`/members/${memberId}/points-adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  overrideTier(memberId: string, data: { tierId: string; reason: string }): Promise<void> {
    return this.admin(`/members/${memberId}/tier-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  changeMemberStatus(memberId: string, data: { status: string; reason: string }): Promise<void> {
    return this.admin(`/members/${memberId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  gdprDelete(memberId: string, confirm?: boolean): Promise<void> {
    return this.admin(`/members/${memberId}/gdpr-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirm ?? false }),
    });
  }

  // ── Transactions ──
  getTransactions(params?: {
    memberId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResponse<TransactionDTO>> {
    const qs = new URLSearchParams();
    if (params?.memberId) qs.set('memberId', params.memberId);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    return this.admin(`/transactions?${qs.toString()}`);
  }

  // ── API Keys ──
  async getApiKeys(): Promise<ApiKeyDTO[]> {
    const res = await this.admin<{items: ApiKeyDTO[]} | ApiKeyDTO[]>('/apikeys');
    return Array.isArray(res) ? res : res.items;
  }

  createApiKey(label: string): Promise<ApiKeyCreateResponse> {
    return this.admin('/apikeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
  }

  revokeApiKey(id: string): Promise<void> {
    return this.admin(`/apikeys/${id}`, { method: 'DELETE' });
  }

  // ── Webhooks ──
  async getWebhooks(): Promise<WebhookDTO[]> {
    const res = await this.admin<{items: WebhookDTO[]} | WebhookDTO[]>('/webhooks');
    return Array.isArray(res) ? res : res.items;
  }

  createWebhook(data: WebhookCreateInput): Promise<WebhookDTO> {
    return this.admin('/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  updateWebhook(id: string, data: Partial<WebhookCreateInput & { isActive: boolean }>): Promise<WebhookDTO> {
    return this.admin(`/webhooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  deleteWebhook(id: string): Promise<void> {
    return this.admin(`/webhooks/${id}`, { method: 'DELETE' });
  }

  testWebhook(id: string): Promise<{ success: boolean; statusCode: number }> {
    return this.admin(`/webhooks/${id}/test`, { method: 'POST' });
  }

  async getWebhookDeliveries(id: string): Promise<WebhookDeliveryDTO[]> {
    const res = await this.admin<{items: WebhookDeliveryDTO[]} | WebhookDeliveryDTO[]>(`/webhooks/${id}/deliveries`);
    return Array.isArray(res) ? res : res.items;
  }

  // ── Audit ──
  getAuditLog(params?: {
    entity?: string;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResponse<AuditLogEntryDTO>> {
    const qs = new URLSearchParams();
    if (params?.entity) qs.set('entity', params.entity);
    if (params?.action) qs.set('action', params.action);
    if (params?.actor) qs.set('actor', params.actor);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    return this.admin(`/audit?${qs.toString()}`);
  }

  exportAuditCsv(): Promise<Response> {
    return this.admin('/audit/export.csv', { rawResponse: true });
  }

  // ── Feature Flags ──
  async getFeatureFlags(): Promise<FeatureFlagDTO[]> {
    const res = await this.admin<{items: FeatureFlagDTO[]} | FeatureFlagDTO[]>('/feature-flags');
    return Array.isArray(res) ? res : res.items;
  }

  updateFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlagDTO> {
    return this.admin(`/feature-flags/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  // ── Branding ──
  getBranding(): Promise<BrandingDTO> {
    return this.admin('/branding');
  }

  updateBranding(data: Partial<BrandingDTO>): Promise<BrandingDTO> {
    return this.admin('/branding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  // ── Integrations ──
  getIntegrations(): Promise<{ items: Array<{
    provider: string;
    enabled: boolean;
    connected: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    contactsSynced: number;
    comingSoon: boolean;
  }> }> {
    return this.admin('/integrations');
  }

  getIntegrationDetail(provider: string): Promise<{
    provider: string;
    enabled: boolean;
    connected: boolean;
    apiUrl?: string;
    apiKeyMasked?: string | null;
    listId?: string;
    automationMappings?: Record<string, string | null>;
    syncSchedule?: string;
    lastSyncAt?: string | null;
    lastSyncStatus?: string | null;
    contactsSynced?: number;
  }> {
    return this.admin(`/integrations/${provider}`);
  }

  saveIntegration(provider: string, data: {
    apiUrl: string;
    apiKey: string;
    listId?: string;
    automationMappings?: Record<string, string | null>;
    syncSchedule?: string;
  }): Promise<{ provider: string; enabled: boolean; connected: boolean; message: string }> {
    return this.admin(`/integrations/${provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  disconnectIntegration(provider: string): Promise<{ provider: string; disconnected: boolean }> {
    return this.admin(`/integrations/${provider}`, { method: 'DELETE' });
  }

  testIntegration(provider: string, data?: { apiUrl?: string; apiKey?: string }): Promise<{
    success: boolean;
    accountName?: string;
    error?: string;
  }> {
    return this.admin(`/integrations/${provider}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data ?? {}),
    });
  }

  syncIntegration(provider: string): Promise<{ synced: number; errors: number }> {
    return this.admin(`/integrations/${provider}/sync`, { method: 'POST' });
  }

  getIntegrationStatus(provider: string): Promise<{
    provider: string;
    enabled: boolean;
    connected: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    contactsSynced: number;
  }> {
    return this.admin(`/integrations/${provider}/status`);
  }

  // ── Reports ──
  getReportLiability(): Promise<{
    reportDate: string;
    activeMembers: number;
    totalOutstandingPoints: number;
    estimatedLiabilityUsd: number;
    estimatedBreakagePoints: number;
    netLiabilityUsd: number;
    breakageRate: number;
    costPerPoint: number;
  }> {
    return this.analytics('/reports/liability');
  }

  getReportPointsFlow(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<{
    periods: Array<{
      date: string;
      pointsIssued: number;
      pointsRedeemed: number;
      pointsExpired: number;
      pointsVoided: number;
      netChange: number;
      cumulativeBalance: number;
    }>;
  }> {
    const qs = new URLSearchParams({ from, to, groupBy });
    return this.analytics(`/reports/points-flow?${qs.toString()}`);
  }

  getReportRedemptionReserve(from: string, to: string): Promise<{
    periods: Array<{
      year: number;
      month: number;
      redemptionCount: number;
      totalPointsRedeemed: number;
      totalDiscountValue: number;
      avgDiscountPerRedemption: number;
      costPerPoint: number;
    }>;
    totals: {
      redemptionCount: number;
      totalPointsRedeemed: number;
      totalDiscountValue: number;
      avgCostPerPoint: number;
    };
  }> {
    const qs = new URLSearchParams({ from, to });
    return this.analytics(`/reports/redemption-reserve?${qs.toString()}`);
  }

  getReportRevenueAttribution(from: string, to: string): Promise<{
    periods: Array<{
      date: string;
      totalTransactions: number;
      totalSpend: number;
      avgBasket: number;
      uniqueMembers: number;
      spendPerMember: number;
    }>;
    summary: {
      avgBasketOverall: number;
      totalRevenue: number;
      revenuePerMember: number;
    };
  }> {
    const qs = new URLSearchParams({ from, to });
    return this.analytics(`/reports/revenue-attribution?${qs.toString()}`);
  }

  getReportEngagementFunnel(): Promise<{
    totalEnrolled: number;
    madeFirstPurchase: number;
    repeatPurchasers: number;
    frequentPurchasers: number;
    tierUpgradedMembers: number;
    redeemedMembers: number;
    conversionRates: {
      enrollToFirst: number;
      firstToRepeat: number;
      repeatToFrequent: number;
      enrollToRedeem: number;
    };
  }> {
    return this.analytics('/reports/engagement-funnel');
  }

  getReportAtRiskMembers(daysInactive = 60, minBalance = 1, limit = 50): Promise<{
    items: Array<{
      memberId: string;
      firstName: string;
      lastName: string;
      tier: string;
      pointsBalance: number;
      lastTransactionDate: string | null;
      daysInactive: number;
    }>;
    total: number;
  }> {
    const qs = new URLSearchParams({
      daysInactive: String(daysInactive),
      minBalance: String(minBalance),
      limit: String(limit),
    });
    return this.analytics(`/reports/at-risk-members?${qs.toString()}`);
  }

  getReportTierDistribution(): Promise<{
    tiers: Array<{
      tierId: string;
      name: string;
      memberCount: number;
      percentage: number;
    }>;
  }> {
    return this.analytics('/reports/tier-distribution');
  }

  getReportOfferPerformance(from: string, to: string): Promise<{
    offers: Array<{
      offerId: string;
      name: string;
      type: string;
      impressions: number;
      redemptions: number;
      redemptionRate: number;
      revenueGenerated: number;
      costPerRedemption: number;
    }>;
  }> {
    const qs = new URLSearchParams({ from, to });
    return this.analytics(`/reports/offer-performance?${qs.toString()}`);
  }

  // ── Visit Analytics ──
  getVisitAnalytics(from: string, to: string): Promise<VisitAnalyticsResponse> {
    return this.analytics(`/reports/visits?from=${from}&to=${to}`);
  }

  // ── Analytics ──
  getAnalyticsSummary(from: string, to: string, metrics?: string[]): Promise<AnalyticsSummaryResponse> {
    const qs = new URLSearchParams({ from, to });
    if (metrics?.length) qs.set('metrics', metrics.join(','));
    return this.analytics(`/summary?${qs.toString()}`);
  }

  getRealtimeKpi(): Promise<RealtimeKpiResponse> {
    return this.analytics('/kpi/realtime');
  }

  getEnrollmentTrend(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<EnrollmentTrendResponse> {
    const qs = new URLSearchParams({ from, to, groupBy });
    return this.analytics(`/enrollment?${qs.toString()}`);
  }

  getTransactionTrend(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<TransactionTrendResponse> {
    const qs = new URLSearchParams({ from, to, groupBy });
    return this.analytics(`/transactions?${qs.toString()}`);
  }

  getPointsEconomy(from: string, to: string): Promise<PointsEconomyResponse> {
    const qs = new URLSearchParams({ from, to });
    return this.analytics(`/points-economy?${qs.toString()}`);
  }

  getTierDistribution(): Promise<TierDistributionResponse> {
    return this.analytics('/tier-distribution');
  }

  getRetentionCohort(from?: string, to?: string): Promise<RetentionCohortResponse> {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return this.analytics(`/retention-cohort?${qs.toString()}`);
  }
}

// Singleton instance
export const apiClient = new AdminApiClient();
export { AdminApiClient };
export type { ClientOptions };
