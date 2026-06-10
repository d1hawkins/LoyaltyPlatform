import { randomUUID } from 'crypto';

export interface WebhookConfigRow {
  hook_id: string;
  event_type: string;
  target_url: string;
  secret_encrypted: string;
  is_active: boolean;
}

export type DeliveryStatus = 'pending' | 'in_flight' | 'delivered' | 'failed' | 'dead';

export interface WebhookDeliveryRow {
  delivery_id: string;
  hook_id: string;
  event_id: string;
  event_type: string;
  target_url: string;
  payload: string;
  attempt: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  last_attempt_at: Date | null;
  status: DeliveryStatus;
  last_status_code: number | null;
  last_error: string | null;
  signature: string;
  created_at: Date;
  updated_at: Date;
}

export interface InsertDeliveryInput {
  hook_id: string;
  event_id: string;
  event_type: string;
  target_url: string;
  payload: string;
  signature: string;
  max_attempts?: number;
}

export interface WebhookRepository {
  listActiveHooksForEvent(eventType: string): Promise<WebhookConfigRow[]>;
  insertDelivery(input: InsertDeliveryInput): Promise<WebhookDeliveryRow | null>;
  claimPendingBatch(limit: number, now: Date): Promise<WebhookDeliveryRow[]>;
  markDelivered(id: string, statusCode: number, at: Date): Promise<void>;
  markFailedPermanent(id: string, statusCode: number, error: string, at: Date): Promise<void>;
  scheduleRetry(
    id: string,
    attempt: number,
    nextAttemptAt: Date,
    statusCode: number | null,
    error: string,
    at: Date,
  ): Promise<void>;
  markDead(id: string, statusCode: number | null, error: string, at: Date): Promise<void>;
  listDeliveries(filter: {
    hookId?: string;
    status?: DeliveryStatus;
    limit?: number;
  }): Promise<WebhookDeliveryRow[]>;
  requeueDelivery(id: string, at: Date): Promise<WebhookDeliveryRow | null>;
  getHook(hookId: string): Promise<WebhookConfigRow | null>;
}

// ---------- In-memory implementation (used by tests + dev) ----------

export class InMemoryWebhookRepository implements WebhookRepository {
  public hooks: WebhookConfigRow[] = [];
  public deliveries: WebhookDeliveryRow[] = [];

  async getHook(hookId: string): Promise<WebhookConfigRow | null> {
    return this.hooks.find((h) => h.hook_id === hookId) ?? null;
  }

  async listActiveHooksForEvent(eventType: string): Promise<WebhookConfigRow[]> {
    return this.hooks.filter((h) => h.is_active && h.event_type === eventType);
  }

  async insertDelivery(input: InsertDeliveryInput): Promise<WebhookDeliveryRow | null> {
    // Idempotent per (hook_id, event_id) — mirrors unique index.
    const existing = this.deliveries.find(
      (d) => d.hook_id === input.hook_id && d.event_id === input.event_id,
    );
    if (existing) return null;
    const now = new Date();
    const row: WebhookDeliveryRow = {
      delivery_id: randomUUID(),
      hook_id: input.hook_id,
      event_id: input.event_id,
      event_type: input.event_type,
      target_url: input.target_url,
      payload: input.payload,
      attempt: 0,
      max_attempts: input.max_attempts ?? 5,
      next_attempt_at: now,
      last_attempt_at: null,
      status: 'pending',
      last_status_code: null,
      last_error: null,
      signature: input.signature,
      created_at: now,
      updated_at: now,
    };
    this.deliveries.push(row);
    return row;
  }

  async claimPendingBatch(limit: number, now: Date): Promise<WebhookDeliveryRow[]> {
    const claimed = this.deliveries
      .filter(
        (d) => d.status === 'pending' && d.next_attempt_at !== null && d.next_attempt_at <= now,
      )
      .sort(
        (a, b) =>
          (a.next_attempt_at?.getTime() ?? 0) - (b.next_attempt_at?.getTime() ?? 0),
      )
      .slice(0, limit);
    for (const row of claimed) {
      row.status = 'in_flight';
      row.updated_at = now;
    }
    return claimed;
  }

  private find(id: string): WebhookDeliveryRow | undefined {
    return this.deliveries.find((d) => d.delivery_id === id);
  }

  async markDelivered(id: string, statusCode: number, at: Date): Promise<void> {
    const row = this.find(id);
    if (!row) return;
    row.status = 'delivered';
    row.last_status_code = statusCode;
    row.last_attempt_at = at;
    row.updated_at = at;
  }

  async markFailedPermanent(
    id: string,
    statusCode: number,
    error: string,
    at: Date,
  ): Promise<void> {
    const row = this.find(id);
    if (!row) return;
    row.status = 'failed';
    row.last_status_code = statusCode;
    row.last_error = error;
    row.last_attempt_at = at;
    row.updated_at = at;
  }

  async scheduleRetry(
    id: string,
    attempt: number,
    nextAttemptAt: Date,
    statusCode: number | null,
    error: string,
    at: Date,
  ): Promise<void> {
    const row = this.find(id);
    if (!row) return;
    row.status = 'pending';
    row.attempt = attempt;
    row.next_attempt_at = nextAttemptAt;
    row.last_status_code = statusCode;
    row.last_error = error;
    row.last_attempt_at = at;
    row.updated_at = at;
  }

  async markDead(
    id: string,
    statusCode: number | null,
    error: string,
    at: Date,
  ): Promise<void> {
    const row = this.find(id);
    if (!row) return;
    row.status = 'dead';
    row.attempt = row.attempt + 1;
    row.last_status_code = statusCode;
    row.last_error = error;
    row.last_attempt_at = at;
    row.updated_at = at;
  }

  async listDeliveries(filter: {
    hookId?: string;
    status?: DeliveryStatus;
    limit?: number;
  }): Promise<WebhookDeliveryRow[]> {
    let rows = this.deliveries.slice();
    if (filter.hookId) rows = rows.filter((r) => r.hook_id === filter.hookId);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return rows.slice(0, filter.limit ?? 100);
  }

  async requeueDelivery(id: string, at: Date): Promise<WebhookDeliveryRow | null> {
    const row = this.find(id);
    if (!row) return null;
    row.status = 'pending';
    row.attempt = 0;
    row.next_attempt_at = at;
    row.last_error = null;
    row.last_status_code = null;
    row.updated_at = at;
    return row;
  }
}

// ---------- mssql stub ----------
// A-12 / infra wires the real connection; this placeholder exists so the
// bootstrap path type-checks. It throws on use so missing wiring is loud.
export class MssqlWebhookRepository implements WebhookRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly connectionString: string) {}
  private nyi(): never {
    throw new Error('MssqlWebhookRepository not yet implemented — use InMemoryWebhookRepository');
  }
  listActiveHooksForEvent(): Promise<WebhookConfigRow[]> {
    return this.nyi();
  }
  insertDelivery(): Promise<WebhookDeliveryRow | null> {
    return this.nyi();
  }
  claimPendingBatch(): Promise<WebhookDeliveryRow[]> {
    return this.nyi();
  }
  markDelivered(): Promise<void> {
    return this.nyi();
  }
  markFailedPermanent(): Promise<void> {
    return this.nyi();
  }
  scheduleRetry(): Promise<void> {
    return this.nyi();
  }
  markDead(): Promise<void> {
    return this.nyi();
  }
  listDeliveries(): Promise<WebhookDeliveryRow[]> {
    return this.nyi();
  }
  requeueDelivery(): Promise<WebhookDeliveryRow | null> {
    return this.nyi();
  }
  getHook(): Promise<WebhookConfigRow | null> {
    return this.nyi();
  }
}
