import {
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

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  timeout: number;
  maxRetries: number;
}

/**
 * Generate a UUID v4-like string (browser-safe, no crypto dependency required).
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Internal HTTP client with retry, timeout, and auth header injection.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly tenantId: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: HttpClientOptions) {
    // Strip trailing slash
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.tenantId = options.tenantId;
    this.timeout = options.timeout;
    this.maxRetries = options.maxRetries;
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, query);
    return this.requestWithRetry<T>(url, {
      method: 'GET',
      headers: this.headers(),
    });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.requestWithRetry<T>(url, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
        'Idempotency-Key': generateId(),
      },
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.requestWithRetry<T>(url, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    await this.requestWithRetry<void>(url, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Tenant-ID': this.tenantId,
      'Ocp-Apim-Subscription-Key': this.apiKey,
    };
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') {
          url.searchParams.set(k, v);
        }
      }
    }
    return url.toString();
  }

  private async requestWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.doFetch<T>(url, init);
      } catch (err) {
        lastError = err as Error;
        const isRetryable =
          err instanceof RateLimitError ||
          err instanceof ServerError ||
          err instanceof TimeoutError;

        if (!isRetryable || attempt >= this.maxRetries) {
          throw err;
        }

        // Exponential backoff: 500ms, 1000ms
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  private async doFetch<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      }

      // Parse error body
      let errorBody: { title?: string; detail?: string; code?: string; existingMemberId?: string } = {};
      try {
        errorBody = await response.json();
      } catch {
        // empty body
      }

      const msg = errorBody.title ?? `HTTP ${response.status}`;
      const detail = errorBody.detail;

      switch (response.status) {
        case 400:
          throw new ValidationError(msg, detail);
        case 401:
          throw new UnauthorizedError(msg);
        case 403:
          throw new ForbiddenError(msg);
        case 404:
          throw new NotFoundError(msg);
        case 409:
          throw new ConflictError(msg, errorBody.existingMemberId);
        case 429: {
          const retryAfter = response.headers.get('Retry-After');
          const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
          throw new RateLimitError(retryMs);
        }
        default:
          if (response.status >= 500) {
            throw new ServerError(response.status, msg);
          }
          throw new LoyaltyError(msg, errorBody.code ?? 'UNKNOWN', response.status, detail);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof LoyaltyError) {
        throw err;
      }
      if ((err as Error).name === 'AbortError') {
        throw new TimeoutError(this.timeout);
      }
      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
