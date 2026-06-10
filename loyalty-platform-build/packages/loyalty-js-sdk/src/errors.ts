/**
 * Base error class for all Loyalty SDK errors.
 */
export class LoyaltyError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail?: string;

  constructor(message: string, code: string, status: number, detail?: string) {
    super(message);
    this.name = 'LoyaltyError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    Object.setPrototypeOf(this, LoyaltyError.prototype);
  }
}

/**
 * Thrown when a request times out.
 */
export class TimeoutError extends LoyaltyError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT', 0);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when the server returns a validation error (400).
 */
export class ValidationError extends LoyaltyError {
  constructor(message: string, detail?: string) {
    super(message, 'VALIDATION_ERROR', 400, detail);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when the API key or auth is invalid (401).
 */
export class UnauthorizedError extends LoyaltyError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Thrown when the caller lacks permission (403).
 */
export class ForbiddenError extends LoyaltyError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Thrown when the requested resource does not exist (404).
 */
export class NotFoundError extends LoyaltyError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown on a conflict such as duplicate enrollment (409).
 */
export class ConflictError extends LoyaltyError {
  public readonly existingMemberId?: string;

  constructor(message: string, existingMemberId?: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
    this.existingMemberId = existingMemberId;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Thrown when rate-limited (429).
 */
export class RateLimitError extends LoyaltyError {
  public readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown on server errors (5xx).
 */
export class ServerError extends LoyaltyError {
  constructor(status: number, message = 'Server error') {
    super(message, 'SERVER_ERROR', status);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}
