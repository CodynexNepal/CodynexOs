import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { corsConfig } from './cors.config';
import { globalRateLimiter } from './rateLimiter.config';
import { createRootRoutes } from '../routes/index.routes';
import { notFoundHandler } from '../middleware/not-found.middleware';
import { errorHandler } from '../middleware/error-handler.middleware';
import { compressionMiddleware } from '../middleware/compression.middleware';
import { metricsHandler, metricsMiddleware } from '../observability/metrics';
import { AppDataSource } from '../database/database-source';

export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(cors(corsConfig));
  app.use(compressionMiddleware());
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));
  app.use(cookieParser());
  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'codynex-os-backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req, res) => {
    const dbReady = AppDataSource.isInitialized;
    if (!dbReady) {
      res.status(503).json({ status: 'degraded', database: 'DISCONNECTED' });
      return;
    }
    res.status(200).json({ status: 'ok', database: 'CONNECTED' });
  });

  app.get('/metrics', metricsHandler);

  app.use('/api/v1/codynex', createRootRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
