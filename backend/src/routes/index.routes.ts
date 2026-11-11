import { Router } from 'express';
import { createAuthRouter } from './auth.routes';
import { createOsRouter } from './os.routes';

export function createRootRoutes(): Router {
  const routes = Router();
  routes.use('/auth', createAuthRouter());
  routes.use('/', createOsRouter());
  return routes;
}
