import { Request, Response, NextFunction } from 'express';
import { JwtTokenService, ITokenPayload } from '../utils/jwt-token.util';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { UserRole } from '../constant/enum.constant';
import { applyCorsHeaders } from '../configs/cors.config';

declare global {
  namespace Express {
    interface Request {
      user?: ITokenPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.user) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.access_token) {
    token = String(req.cookies.access_token);
  }

  if (!token) {
    applyCorsHeaders(req, res);
    res.status(STATUS_CODE.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required. Please sign in.',
    });
    return;
  }

  const payload = JwtTokenService.verifyAccessToken(token);
  if (!payload) {
    applyCorsHeaders(req, res);
    res.status(STATUS_CODE.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
    return;
  }

  req.user = payload;
  next();
};

export const requireRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      applyCorsHeaders(req, res);
      res.status(STATUS_CODE.UNAUTHORIZED).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      applyCorsHeaders(req, res);
      res.status(STATUS_CODE.FORBIDDEN).json({
        success: false,
        message: `Forbidden. Requires role: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
};
