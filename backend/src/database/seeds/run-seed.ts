import 'reflect-metadata';
import { AppDataSource } from '../database-source';
import { runInitialSeed } from './initial.seed';
import { logger } from '../../utils/logger.util';

async function main() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await runInitialSeed();
  await AppDataSource.destroy();
  logger.info('Seed completed successfully');
}

main().catch((err) => {
  logger.error('Seed failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
