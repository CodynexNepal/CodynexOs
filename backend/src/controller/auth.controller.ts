import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { dotEnvConfig } from '../configs/envConfig';

const isProd = dotEnvConfig.NODE_ENV === 'production';

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await this.authService.login(email, password, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.status(STATUS_CODE.OK).json({
        success: true,
        message: 'Authenticated successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.authService.me(req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken =
        (req.cookies?.refresh_token as string | undefined) ||
        (req.body?.refreshToken as string | undefined) ||
        '';
      const result = await this.authService.refresh(refreshToken);
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logoutAll = Boolean(req.body?.logoutAll);
      await this.authService.logout(req.user?.userId, req.user?.sessionId, logoutAll);
      clearAuthCookies(res);
      res.status(STATUS_CODE.OK).json({ success: true, message: 'Signed out cleanly' });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      await this.authService.changePassword(req.user!.userId, currentPassword, newPassword);
      clearAuthCookies(res);
      res.status(STATUS_CODE.OK).json({ success: true, message: 'Password updated' });
    } catch (err) {
      next(err);
    }
  };
}
