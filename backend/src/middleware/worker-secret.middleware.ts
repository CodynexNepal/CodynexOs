import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { dotEnvConfig } from '../configs/envConfig';
import { STATUS_CODE } from '../constant/statusCode.interface';

export function requireWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = String(req.headers['x-worker-secret'] || '');
  const expected = dotEnvConfig.WORKER_TICK_SECRET;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(STATUS_CODE.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid worker tick secret.',
    });
    return;
  }

  next();
}
