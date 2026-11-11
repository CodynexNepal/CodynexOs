import { Router } from 'express';
import { getOsContainer } from '../factory/os.factory';
import { authenticate } from '../middleware/auth.middleware';
import { validateDto } from '../middleware/validate-dto.middleware';
import { authRateLimiter } from '../configs/rateLimiter.config';
import { ChangePasswordDto, LoginDto } from '../dto/auth.dto';

export function createAuthRouter(): Router {
  const router = Router();
  const { authController } = getOsContainer();

  router.post('/login', authRateLimiter, validateDto(LoginDto), authController.login);
  router.post('/refresh', authRateLimiter, authController.refresh);
  router.post('/logout', authController.logout);
  router.get('/me', authenticate, authController.me);
  router.put(
    '/password',
    authenticate,
    validateDto(ChangePasswordDto),
    authController.changePassword,
  );

  return router;
}
