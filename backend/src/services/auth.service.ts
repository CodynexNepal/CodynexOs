import { UserRepository } from '../repository/user.repository';
import { AuditService } from './audit.service';
import { ApiError } from '../utils/api-error.util';
import { verifyPassword, hashPassword } from '../utils/password.util';
import { JwtTokenService, ITokenPayload } from '../utils/jwt-token.util';
import { sha256Hex } from '../utils/encryption.util';

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await this.auditService.log({
        actorType: 'USER',
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'user',
        resourceId: user.id,
        ipAddress: meta.ipAddress,
      });
      throw ApiError.unauthorized('Invalid email or password.');
    }

    const session = await this.userRepo.createSession({
      userId: user.id,
      refreshTokenHash: 'pending',
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const payload: ITokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      sessionId: session.id,
    };

    const accessToken = JwtTokenService.signAccessToken(payload);
    const refreshToken = JwtTokenService.signRefreshToken(payload);

    session.refreshTokenHash = sha256Hex(refreshToken);
    await this.userRepo.createSession(session);

    user.lastLoginAt = new Date();
    await this.userRepo.saveUser(user);

    await this.auditService.log({
      actorType: 'USER',
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'session',
      resourceId: session.id,
      ipAddress: meta.ipAddress,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async me(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account unavailable.');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async refresh(refreshToken: string) {
    const payload = JwtTokenService.verifyRefreshToken(refreshToken);
    if (!payload || !payload.sessionId) {
      throw ApiError.unauthorized('Invalid refresh token.');
    }

    const session = await this.userRepo.findActiveSession(payload.sessionId);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('Session expired or revoked.');
    }

    if (session.refreshTokenHash !== sha256Hex(refreshToken)) {
      throw ApiError.unauthorized('Refresh token mismatch.');
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User inactive.');
    }

    const nextPayload: ITokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      sessionId: session.id,
    };

    return {
      accessToken: JwtTokenService.signAccessToken(nextPayload),
    };
  }

  async logout(userId?: string, sessionId?: string, logoutAll = false) {
    if (logoutAll && userId) {
      await this.userRepo.revokeAllUserSessions(userId);
    } else if (sessionId) {
      await this.userRepo.revokeSession(sessionId);
    }
    if (userId) {
      await this.auditService.log({
        actorType: 'USER',
        actorId: userId,
        action: logoutAll ? 'AUTH_LOGOUT_ALL' : 'AUTH_LOGOUT',
        resourceType: 'session',
        resourceId: sessionId ?? null,
      });
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw ApiError.badRequest('Current password is incorrect.');
    user.passwordHash = await hashPassword(newPassword);
    await this.userRepo.saveUser(user);
    await this.userRepo.revokeAllUserSessions(userId);
  }
}
