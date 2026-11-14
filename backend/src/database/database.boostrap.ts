import { AppDataSource } from './database-source';
import { logger } from '../utils/logger.util';

function getTargetHost(): string {
  try {
    const raw = (AppDataSource.options as { url?: string }).url || '';
    const parsed = new URL(raw);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return 'configured database';
  }
}

export async function bootstrapDatabase(maxRetries = 5, retryDelayMs = 3000): Promise<void> {
  if (AppDataSource.isInitialized) return;

  const targetHost = getTargetHost();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Database] Connecting to Neon database at ${targetHost} (attempt ${attempt}/${maxRetries})...`);
      await AppDataSource.initialize();
      logger.info(`PostgreSQL DataSource initialized successfully on ${targetHost}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as Record<string, unknown>)?.code;
      const isFatalAuthOrConfig = code === '28P01' || code === '3D000'; // Bad password or db not found

      if (attempt < maxRetries && !isFatalAuthOrConfig) {
        logger.warn(
          `PostgreSQL connection attempt ${attempt}/${maxRetries} failed (${msg || code || 'connection blip'}). Database may be resuming from cold start, retrying in ${retryDelayMs / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        logger.error(`PostgreSQL connection failed permanently after ${attempt} attempts`, {
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
    logger.info('PostgreSQL DataSource closed');
  }
}
