import 'reflect-metadata';
import http from 'http';
import { dotEnvConfig } from './configs/envConfig';
import { createApp } from './configs/app';
import { bootstrapDatabase, closeDatabase } from './database/database.boostrap';
import { AppDataSource } from './database/database-source';
import { runInitialSeed } from './database/seeds/initial.seed';
import { socketServer } from './socket/socket.server';
import { getOsContainer } from './factory/os.factory';
import { bootstrapWorkers, shutdownWorkers } from './workers/workers.bootstrap';
import { closeRedisConnections } from './configs/redis.config';
import { logger } from './utils/logger.util';

const { PORT } = dotEnvConfig;

(async () => {
  try {
    await bootstrapDatabase();
    await AppDataSource.runMigrations();
    await runInitialSeed();

    const app = createApp();
    const httpServer = http.createServer(app);
    socketServer.init(httpServer);

    const { orchestratorService } = getOsContainer();
    bootstrapWorkers(orchestratorService);

    httpServer.listen(PORT, () => {
      logger.info('CodyNex OS Backend listening', { port: PORT, env: dotEnvConfig.NODE_ENV });
    });

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('Shutting down gracefully', { signal });
      await shutdownWorkers();
      await socketServer.close();
      await closeRedisConnections();
      await closeDatabase();
      httpServer.close(() => process.exit(0));
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal('Failed to start CodyNex OS Backend', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
})();
