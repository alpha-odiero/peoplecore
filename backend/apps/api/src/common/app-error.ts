export interface ProblemFieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ProblemFieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (message = 'Validation failed', details?: ProblemFieldError[]) =>
    new AppError(422, 'VALIDATION_FAILED', message, details),
  unauthenticated: (message = 'Authentication is required') =>
    new AppError(401, 'UNAUTHENTICATED', message),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  tenantRequired: () => new AppError(400, 'TENANT_REQUIRED', 'A tenant must be resolved'),
  tenantNotFound: () => new AppError(404, 'TENANT_NOT_FOUND', 'Tenant was not found'),
  notFound: (resource = 'Resource') =>
    new AppError(404, 'RESOURCE_NOT_FOUND', `${resource} was not found`),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  rateLimited: (message = 'Too many requests') => new AppError(429, 'RATE_LIMITED', message),
  internal: (message = 'An unexpected error occurred') =>
    new AppError(500, 'INTERNAL_ERROR', message),
};
