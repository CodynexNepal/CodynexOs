import { STATUS_CODE } from '../constant/statusCode.interface';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly errors?: Record<string, string[]>;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; errors?: Record<string, string[]> },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.errors = options?.errors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new ApiError(STATUS_CODE.BAD_REQUEST, message, { errors });
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(STATUS_CODE.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(STATUS_CODE.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(STATUS_CODE.NOT_FOUND, message);
  }

  static conflict(message: string) {
    return new ApiError(STATUS_CODE.CONFLICT, message);
  }

  static unprocessable(message: string, errors?: Record<string, string[]>) {
    return new ApiError(STATUS_CODE.UNPROCESSABLE_ENTITY, message, { errors });
  }

  static tooManyRequests(message = 'Rate limit exceeded.') {
    return new ApiError(STATUS_CODE.TOO_MANY_REQUESTS, message, { code: 'RATE_LIMITED' });
  }
}
