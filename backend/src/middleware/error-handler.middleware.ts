import { Request, Response, NextFunction } from 'express';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { dotEnvConfig } from '../configs/envConfig';
import { applyCorsHeaders } from '../configs/cors.config';
import { ApiError } from '../utils/api-error.util';
import { logger } from '../utils/logger.util';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  applyCorsHeaders(req, res);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  logger.error('Unhandled request error', {
    path: req.path,
    method: req.method,
    error: err.message,
  });

  res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
    success: false,
    message:
      dotEnvConfig.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error',
    ...(dotEnvConfig.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};
