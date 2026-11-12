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
import { AiHealthService } from '../ai/services/ai-health.service';
import { previewDeployService } from '../services/preview-deploy.service';

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

  const aiHealthService = new AiHealthService();
  app.get('/api/ai/health', async (_req, res, next) => {
    try {
      const report = await aiHealthService.getFullHealthReport();
      res.status(report.status === 'healthy' ? 200 : 503).json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  });

  const serveLiveApp = (req: express.Request, res: express.Response) => {
    const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
    const html = previewDeployService.readPreview(projectId);
    if (!html) {
      res.status(404).send('<html><body style="font-family:sans-serif;padding:40px"><h2>Preview not ready yet</h2><p>UI/UX department has not published a live build for this project yet.</p></body></html>');
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' https: data:; frame-ancestors 'self' http://localhost:3000 http://127.0.0.1:3000;",
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  };
  app.get('/preview/:projectId', serveLiveApp);
  app.get('/live/:projectId', serveLiveApp);

  app.use('/api/v1/codynex', createRootRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
