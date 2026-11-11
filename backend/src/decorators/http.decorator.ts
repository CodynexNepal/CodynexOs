import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error.util';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireParam(paramName: string, options?: { uuid?: boolean }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const val = req.params[paramName];
    if (!val || typeof val !== 'string' || val.trim() === '') {
      next(ApiError.badRequest(`Missing required route parameter: ${paramName}`));
      return;
    }
    if (options?.uuid && !UUID_REGEX.test(val.trim())) {
      next(ApiError.badRequest(`Invalid UUID parameter: ${paramName}`));
      return;
    }
    next();
  };
}

export function getRequiredParam(req: Request, paramName: string): string {
  const val = req.params[paramName];
  if (!val || typeof val !== 'string') {
    throw ApiError.badRequest(`Missing required route parameter: ${paramName}`);
  }
  return val.trim();
}
