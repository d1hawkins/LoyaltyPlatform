/**
 * Repository abstractions used by the admin API.
 *
 * Concrete SQL implementations are backed by `@loyalty/shared-db-client`
 * and the tenant's DB pool. In unit/integration tests, we use the
 * in-memory implementations in this file.
 */

export interface ProgramConfig {
  tenantId: string;
  configJson: Record<string, unknown>;
  updatedAt: string;
}

export interface TierRecord {
  id: string;
  tenantId: string;
  name: string;
  rank: number;
  thresholdPoints: number;
  benefits: Record<string, unknown>;
  isActive: boolean;
  updatedAt: string;
}

export interface MemberSummary {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  emailHash?: string;
  phoneHash: string;
  tierId: string;
  tierName?: string;
  status: 'active' | 'suspended' | 'closed';
  pointsBalance: number;
  enrolledAt: string;
}

export interface WebhookRecord {
  id: string;
  tenantId: string;
  eventType: string;
  targetUrl: string;
  isActive: boolean;
  retryCount: number;
  createdAt: string;
}

export interface ApiKeyRecord {
  keyId: string;
  tenantId: string;
  label: string;
  scope: 'read' | 'read-write';
  createdAt: string;
  revokedAt?: string | null;
}

export interface FeatureFlagRecord {
  flagKey: string;
  tenantId: string;
  enabled: boolean;
  valueJson?: Record<string, unknown> | null;
  updatedAt: string;
}

// --- Program config repo ------------------------------------------------

export interface ProgramConfigRepository {
  get(tenantId: string): Promise<ProgramConfig | null>;
  update(tenantId: string, configJson: Record<string, unknown>): Promise<ProgramConfig>;
}

export class InMemoryProgramConfigRepo implements ProgramConfigRepository {
  private store = new Map<string, ProgramConfig>();
  async get(tenantId: string): Promise<ProgramConfig | null> {
    return this.store.get(tenantId) ?? null;
  }
  async update(
    tenantId: string,
    configJson: Record<string, unknown>,
  ): Promise<ProgramConfig> {
    const row: ProgramConfig = {
      tenantId,
      configJson,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(tenantId, row);
    return row;
  }
}

// --- Tier repo ----------------------------------------------------------

export interface TierRepository {
  list(tenantId: string): Promise<TierRecord[]>;
  get(tenantId: string, id: string): Promise<TierRecord | null>;
  create(row: Omit<TierRecord, 'updatedAt'>): Promise<TierRecord>;
  update(tenantId: string, id: string, patch: Partial<TierRecord>): Promise<TierRecord | null>;
  deactivate(tenantId: string, id: string): Promise<TierRecord | null>;
}

export class InMemoryTierRepo implements TierRepository {
  private rows: TierRecord[] = [];
  async list(tenantId: string): Promise<TierRecord[]> {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
  async get(tenantId: string, id: string): Promise<TierRecord | null> {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async create(row: Omit<TierRecord, 'updatedAt'>): Promise<TierRecord> {
    const full: TierRecord = { ...row, updatedAt: new Date().toISOString() };
    this.rows.push(full);
    return full;
  }
  async update(
    tenantId: string,
    id: string,
    patch: Partial<TierRecord>,
  ): Promise<TierRecord | null> {
    const idx = this.rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
    if (idx < 0) return null;
    const current = this.rows[idx]!;
    const updated: TierRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.rows[idx] = updated;
    return updated;
  }
  async deactivate(tenantId: string, id: string): Promise<TierRecord | null> {
    return this.update(tenantId, id, { isActive: false });
  }
}

// --- Webhook repo -------------------------------------------------------

export interface WebhookRepository {
  list(tenantId: string): Promise<WebhookRecord[]>;
  get(tenantId: string, id: string): Promise<WebhookRecord | null>;
  create(row: WebhookRecord): Promise<WebhookRecord>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<WebhookRecord>,
  ): Promise<WebhookRecord | null>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

export class InMemoryWebhookRepo implements WebhookRepository {
  private rows: WebhookRecord[] = [];
  async list(tenantId: string): Promise<WebhookRecord[]> {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
  async get(tenantId: string, id: string): Promise<WebhookRecord | null> {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async create(row: WebhookRecord): Promise<WebhookRecord> {
    this.rows.push(row);
    return row;
  }
  async update(
    tenantId: string,
    id: string,
    patch: Partial<WebhookRecord>,
  ): Promise<WebhookRecord | null> {
    const idx = this.rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
    if (idx < 0) return null;
    const current = this.rows[idx]!;
    const updated: WebhookRecord = { ...current, ...patch };
    this.rows[idx] = updated;
    return updated;
  }
  async remove(tenantId: string, id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.tenantId === tenantId && r.id === id));
    return this.rows.length < before;
  }
}

// --- API key repo (control plane) ---------------------------------------

export interface ApiKeyRepository {
  list(tenantId: string): Promise<ApiKeyRecord[]>;
  create(row: {
    tenantId: string;
    label: string;
    scope: 'read' | 'read-write';
    keyHash: string;
  }): Promise<ApiKeyRecord>;
  revoke(tenantId: string, keyId: string): Promise<ApiKeyRecord | null>;
}

export class InMemoryApiKeyRepo implements ApiKeyRepository {
  private rows: (ApiKeyRecord & { keyHash: string })[] = [];
  private nextId = 1;
  async list(tenantId: string): Promise<ApiKeyRecord[]> {
    return this.rows
      .filter((r) => r.tenantId === tenantId)
      .map(({ keyHash: _ignored, ...rest }) => rest);
  }
  async create(row: {
    tenantId: string;
    label: string;
    scope: 'read' | 'read-write';
    keyHash: string;
  }): Promise<ApiKeyRecord> {
    const full: ApiKeyRecord & { keyHash: string } = {
      keyId: `key_${this.nextId++}`,
      tenantId: row.tenantId,
      label: row.label,
      scope: row.scope,
      keyHash: row.keyHash,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.rows.push(full);
    const { keyHash: _kh, ...rest } = full;
    return rest;
  }
  async revoke(tenantId: string, keyId: string): Promise<ApiKeyRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.keyId === keyId);
    if (!row) return null;
    row.revokedAt = new Date().toISOString();
    const { keyHash: _kh, ...rest } = row;
    return rest;
  }
}

// --- Feature flag repo (control plane) ----------------------------------

export interface FeatureFlagRepository {
  list(tenantId: string): Promise<FeatureFlagRecord[]>;
  upsert(row: FeatureFlagRecord): Promise<FeatureFlagRecord>;
  get(tenantId: string, flagKey: string): Promise<FeatureFlagRecord | null>;
}

export class InMemoryFeatureFlagRepo implements FeatureFlagRepository {
  private rows: FeatureFlagRecord[] = [];
  async list(tenantId: string): Promise<FeatureFlagRecord[]> {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
  async get(tenantId: string, flagKey: string): Promise<FeatureFlagRecord | null> {
    return this.rows.find((r) => r.tenantId === tenantId && r.flagKey === flagKey) ?? null;
  }
  async upsert(row: FeatureFlagRecord): Promise<FeatureFlagRecord> {
    const idx = this.rows.findIndex(
      (r) => r.tenantId === row.tenantId && r.flagKey === row.flagKey,
    );
    const updated = { ...row, updatedAt: new Date().toISOString() };
    if (idx < 0) this.rows.push(updated);
    else this.rows[idx] = updated;
    return updated;
  }
}

// --- Member proxy client ------------------------------------------------
// Wraps calls to the member-service / loyalty-engine / webhook-worker.
// The HTTP implementation lives in `clients.ts`; tests use the in-memory one.

export interface MemberClient {
  search(
    tenantId: string,
    filter: { q?: string; tierId?: string; status?: string; limit?: number; cursor?: string },
  ): Promise<{ items: MemberSummary[]; nextCursor?: string }>;
  getById(tenantId: string, memberId: string): Promise<MemberSummary | null>;
  setStatus(
    tenantId: string,
    memberId: string,
    status: 'active' | 'suspended' | 'closed',
  ): Promise<MemberSummary | null>;
  gdprDelete(tenantId: string, memberId: string, confirm: boolean): Promise<boolean>;
}

export interface LoyaltyEngineClient {
  adjustPoints(
    tenantId: string,
    memberId: string,
    delta: number,
    reasonCode: string,
    notes?: string,
  ): Promise<{ balanceAfter: number; ledgerEntryId: string }>;
  overrideTier(
    tenantId: string,
    memberId: string,
    toTierId: string,
    reason: string,
  ): Promise<{ fromTierId: string; toTierId: string }>;
}

export interface TransactionRecord {
  transactionId: string;
  memberId: string;
  channel: string;
  amount: number;
  currency: string;
  pointsEarned: number;
  status: string;
  occurredAt: string;
  createdAt: string;
  storeId: string | null;
  storeName: string | null;
  registerId: string | null;
  associateId: string | null;
  associateName: string | null;
  sourceChannel: string | null;
  sourceSystem: string | null;
  orderRef: string | null;
  items: Array<{ sku: string; name?: string; quantity?: number; unitPrice?: number; amount?: number }>;
}

export interface TransactionRepository {
  list(
    tenantId: string,
    filter: { memberId?: string; limit?: number; cursor?: string },
  ): Promise<{ items: TransactionRecord[]; nextCursor?: string }>;
}

export interface WebhookWorkerClient {
  test(tenantId: string, webhookId: string): Promise<{ ok: boolean; responseStatus?: number }>;
  listDeliveries(
    tenantId: string,
    webhookId: string,
    status?: string,
  ): Promise<Array<Record<string, unknown>>>;
}

export class InMemoryMemberClient implements MemberClient {
  public members: MemberSummary[] = [];

  async search(
    tenantId: string,
    filter: { q?: string; tierId?: string; status?: string; limit?: number; cursor?: string },
  ): Promise<{ items: MemberSummary[]; nextCursor?: string }> {
    let items = this.members.filter((m) => m.tenantId === tenantId);
    if (filter.tierId) items = items.filter((m) => m.tierId === filter.tierId);
    if (filter.status) items = items.filter((m) => m.status === filter.status);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      items = items.filter(
        (m) =>
          m.firstName.toLowerCase().includes(q) ||
          m.lastName.toLowerCase().includes(q) ||
          m.phoneHash.includes(q),
      );
    }
    const limit = Math.min(filter.limit ?? 50, 500);
    const offset = filter.cursor ? Number.parseInt(filter.cursor, 10) : 0;
    const slice = items.slice(offset, offset + limit);
    const nextCursor = offset + limit < items.length ? String(offset + limit) : undefined;
    return { items: slice, nextCursor };
  }
  async getById(tenantId: string, memberId: string): Promise<MemberSummary | null> {
    return this.members.find((m) => m.tenantId === tenantId && m.id === memberId) ?? null;
  }
  async setStatus(
    tenantId: string,
    memberId: string,
    status: 'active' | 'suspended' | 'closed',
  ): Promise<MemberSummary | null> {
    const m = this.members.find((x) => x.tenantId === tenantId && x.id === memberId);
    if (!m) return null;
    m.status = status;
    return m;
  }
  async gdprDelete(tenantId: string, memberId: string, confirm: boolean): Promise<boolean> {
    if (!confirm) return false;
    const before = this.members.length;
    this.members = this.members.filter((m) => !(m.tenantId === tenantId && m.id === memberId));
    return this.members.length < before;
  }
}

export class InMemoryLoyaltyEngineClient implements LoyaltyEngineClient {
  public adjustments: Array<{ tenantId: string; memberId: string; delta: number; reasonCode: string }> = [];
  public tierOverrides: Array<{ tenantId: string; memberId: string; toTierId: string; reason: string }> = [];

  async adjustPoints(
    tenantId: string,
    memberId: string,
    delta: number,
    reasonCode: string,
    _notes?: string,
  ): Promise<{ balanceAfter: number; ledgerEntryId: string }> {
    this.adjustments.push({ tenantId, memberId, delta, reasonCode });
    return { balanceAfter: 1000 + delta, ledgerEntryId: `le_${this.adjustments.length}` };
  }
  async overrideTier(
    tenantId: string,
    memberId: string,
    toTierId: string,
    reason: string,
  ): Promise<{ fromTierId: string; toTierId: string }> {
    this.tierOverrides.push({ tenantId, memberId, toTierId, reason });
    return { fromTierId: 'tier_bronze', toTierId };
  }
}

export class InMemoryWebhookWorkerClient implements WebhookWorkerClient {
  public tests: Array<{ tenantId: string; webhookId: string }> = [];
  async test(tenantId: string, webhookId: string): Promise<{ ok: boolean; responseStatus?: number }> {
    this.tests.push({ tenantId, webhookId });
    return { ok: true, responseStatus: 200 };
  }
  async listDeliveries(
    _tenantId: string,
    _webhookId: string,
    _status?: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }
}
