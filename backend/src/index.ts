import 'reflect-metadata';
import dns from 'dns';
import net from 'net';

// Prevent Node.js from hanging on unreachable IPv6 routes (Happy Eyeballs / RFC 8305) on Windows
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
if (typeof (net as Record<string, unknown>).setDefaultAutoSelectFamily === 'function') {
  (net as { setDefaultAutoSelectFamily: (val: boolean) => void }).setDefaultAutoSelectFamily(false);
}

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
    logger.info('[Startup] Step 1/6: Connecting to PostgreSQL database...');
    await bootstrapDatabase();

    logger.info('[Startup] Step 2/6: Running database migrations...');
    await AppDataSource.runMigrations();

    logger.info('[Startup] Step 3/6: Running initial seeds...');
    await runInitialSeed();

    logger.info('[Startup] Step 4/6: Initializing Express application...');
    const app = createApp();
    const httpServer = http.createServer(app);
    socketServer.init(httpServer);

    logger.info('[Startup] Step 5/6: Bootstrapping autonomous agent workers...');
    const { orchestratorService } = getOsContainer();
    bootstrapWorkers(orchestratorService);

    logger.info(`[Startup] Step 6/6: Starting HTTP server on port ${PORT}...`);
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
    const code = (err as Record<string, unknown>)?.code;
    const detail = (err as Record<string, unknown>)?.detail;
    const driverErr = (err as Record<string, unknown>)?.driverError;
    const message = err instanceof Error ? err.message : String(err);

    const resolvedError =
      (message && message.trim().length > 0)
        ? message
        : detail
          ? String(detail)
          : driverErr
            ? String(driverErr)
            : code
              ? `Database Error (code: ${code})`
              : err instanceof Error && err.name
                ? err.name
                : 'Unknown Fatal Startup Error';

    logger.fatal('Failed to start CodyNex OS Backend', {
      error: resolvedError,
      code,
      detail,
      stack: err instanceof Error ? err.stack : undefined,
    });
    console.error('FATAL STARTUP EXCEPTION:', err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
})();
