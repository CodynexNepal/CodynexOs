import { AppDataSource } from './database-source';
import { logger } from '../utils/logger.util';

export async function bootstrapDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    logger.info('PostgreSQL DataSource initialized');
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('PostgreSQL DataSource closed');
  }
}
