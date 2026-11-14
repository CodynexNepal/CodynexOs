import { AppDataSource } from './database-source';
import { logger } from '../utils/logger.util';

export async function bootstrapDatabase(maxRetries = 5, retryDelayMs = 3000): Promise<void> {
  if (AppDataSource.isInitialized) return;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        logger.info(`[Database] Connecting to PostgreSQL database (attempt ${attempt}/${maxRetries})...`);
      }
      await AppDataSource.initialize();
      logger.info('[Database] PostgreSQL connected successfully');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as Record<string, unknown>)?.code;
      const isFatalAuthOrConfig = code === '28P01' || code === '3D000'; // Bad password or db not found

      if (attempt < maxRetries && !isFatalAuthOrConfig) {
        logger.warn(
          `[Database] Connection attempt ${attempt}/${maxRetries} failed (${msg || code || 'connection blip'}). Retrying in ${retryDelayMs / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        logger.error(`[Database] Connection failed after ${attempt} attempts`, {
          error: msg,
          code,
        });
        throw err;
      }
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('[Database] PostgreSQL connection closed');
  }
}
