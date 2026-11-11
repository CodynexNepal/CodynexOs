import jwt, { SignOptions } from 'jsonwebtoken';
import { dotEnvConfig } from '../configs/envConfig';
import { UserRole } from '../constant/enum.constant';

export interface ITokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  sessionId?: string;
}

export class JwtTokenService {
  static signAccessToken(payload: ITokenPayload): string {
    return jwt.sign(payload, dotEnvConfig.ACCESS_TOKEN_SECRET, {
      expiresIn: dotEnvConfig.ACCESS_TOKEN_EXPIRY as SignOptions['expiresIn'],
    });
  }

  static signRefreshToken(payload: ITokenPayload): string {
    return jwt.sign(payload, dotEnvConfig.REFRESH_TOKEN_SECRET, {
      expiresIn: dotEnvConfig.REFRESH_TOKEN_EXPIRY as SignOptions['expiresIn'],
    });
  }

  static verifyAccessToken(token: string): ITokenPayload | null {
    try {
      return jwt.verify(token, dotEnvConfig.ACCESS_TOKEN_SECRET) as ITokenPayload;
    } catch {
      return null;
    }
  }

  static verifyRefreshToken(token: string): ITokenPayload | null {
    try {
      return jwt.verify(token, dotEnvConfig.REFRESH_TOKEN_SECRET) as ITokenPayload;
    } catch {
      return null;
    }
  }
}
