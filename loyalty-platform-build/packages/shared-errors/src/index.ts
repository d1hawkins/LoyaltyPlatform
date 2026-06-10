export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): ProblemDetails {
    return {
      type: `https://errors.loyalty-platform.io/${this.code}`,
      title: this.name,
      status: this.statusCode,
      detail: this.message,
      code: this.code,
      ...(this.details ?? {}),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super(message, 'FORBIDDEN', 403, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class TenantNotFoundError extends AppError {
  constructor(tenantId: string, details?: Record<string, unknown>) {
    super(`Tenant not found: ${tenantId}`, 'TENANT_NOT_FOUND', 404, { tenantId, ...details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT', 429, details);
  }
}

export class TenantError extends AppError {
  constructor(message = 'Tenant error', details?: Record<string, unknown>) {
    super(message, 'TENANT_ERROR', 500, details);
  }
}
