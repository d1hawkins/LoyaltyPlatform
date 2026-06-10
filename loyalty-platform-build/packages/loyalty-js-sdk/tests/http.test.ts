import { HttpClient } from '../src/http';
import {
  TimeoutError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '../src/errors';

// Mock fetch globally
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersObj,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('HttpClient', () => {
  let http: HttpClient;

  beforeEach(() => {
    mockFetch.mockReset();
    http = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      tenantId: 'tenant-123',
      timeout: 5000,
      maxRetries: 2,
    });
  });

  it('sends correct headers on GET', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await http.get('/v1/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/test');
    expect(init.method).toBe('GET');
    expect(init.headers['Authorization']).toBe('Bearer test-key');
    expect(init.headers['X-Tenant-ID']).toBe('tenant-123');
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('test-key');
  });

  it('sends Idempotency-Key on POST', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(201, { id: '1' }));

    await http.post('/v1/items', { name: 'test' });

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBeDefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('appends query parameters on GET', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    await http.get('/v1/members', { phone: '+15555551234' });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('phone=%2B15555551234');
  });

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { balance: 500, lastUpdated: '2026-01-01' }));

    const result = await http.get<{ balance: number }>('/v1/balance');

    expect(result).toEqual({ balance: 500, lastUpdated: '2026-01-01' });
  });

  it('returns undefined on 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(204, null));

    const result = await http.delete('/v1/items/1');

    expect(result).toBeUndefined();
  });

  it('throws ValidationError on 400', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, { title: 'Bad input', detail: 'phone required', code: 'VALIDATION_ERROR' }),
    );

    await expect(http.get('/v1/test')).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError on 401', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { title: 'Unauthorized' }));

    await expect(http.get('/v1/test')).rejects.toThrow(UnauthorizedError);
  });

  it('throws NotFoundError on 404', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { title: 'Not found' }));

    await expect(http.get('/v1/test')).rejects.toThrow(NotFoundError);
  });

  it('retries on 429 and then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await http.get<{ ok: boolean }>('/v1/test');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(500, { title: 'Internal error' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await http.get<{ ok: boolean }>('/v1/test');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 5xx', async () => {
    mockFetch
      .mockResolvedValue(jsonResponse(503, { title: 'Service unavailable' }));

    await expect(http.get('/v1/test')).rejects.toThrow(ServerError);
    // 1 initial + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws RateLimitError after exhausting retries on 429', async () => {
    mockFetch
      .mockResolvedValue(jsonResponse(429, {}));

    await expect(http.get('/v1/test')).rejects.toThrow(RateLimitError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws TimeoutError on AbortError', async () => {
    mockFetch.mockImplementation(() => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(err);
    });

    // With 2 retries, timeout is retryable so it will attempt 3 times
    await expect(http.get('/v1/test')).rejects.toThrow(TimeoutError);
  });

  it('does not retry on 400 errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { title: 'Bad request' }));

    await expect(http.get('/v1/test')).rejects.toThrow(ValidationError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('strips trailing slash from base URL', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/',
      apiKey: 'key',
      tenantId: 'tid',
      timeout: 5000,
      maxRetries: 0,
    });

    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await client.get('/v1/test');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/test');
  });
});
