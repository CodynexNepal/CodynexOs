import { DataSourceOptions } from 'typeorm';
import { dotEnvConfig } from './envConfig';

const isProduction = dotEnvConfig.NODE_ENV === 'production';
const databaseUrl = dotEnvConfig.DATABASE_URL;

const isTsNode =
  Symbol.for('ts-node.register.instance') in process ||
  Boolean(process.env.TS_NODE_DEV) ||
  process.argv.some((arg) => arg.includes('ts-node') || arg.includes('vitest'));

export const psqlDbConfig: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl.includes('sslmode=require') && !databaseUrl.includes('uselibpqcompat=')
    ? `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}uselibpqcompat=true`
    : databaseUrl,
  synchronize: false,
  logging: !isProduction && process.env.NODE_ENV !== 'test' ? ['error', 'warn'] : ['error'],
  entities: [
    isTsNode || !isProduction ? 'src/entities/**/*.entity.ts' : 'dist/entities/**/*.entity.js',
  ],
  migrations: [
    isTsNode || !isProduction
      ? 'src/database/migrations/**/*.ts'
      : 'dist/database/migrations/**/*.js',
  ],
  migrationsRun: isProduction,
  migrationsTableName: 'typeorm_migrations',
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '8', 10),
    // Keep one connection warm.  A zero-sized pool combined with a 30-second
    // idle timeout repeatedly cold-started the hosted Postgres connection,
    // making dashboard requests wait long enough for the client to time out.
    min: parseInt(process.env.DB_POOL_MIN || '1', 10),
    // Fail a bad upstream quickly so the API can return an error instead of
    // leaving the browser request open until its Axios timeout expires.
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '300000', 10),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl:
      !databaseUrl.includes('127.0.0.1') &&
      !databaseUrl.includes('localhost') &&
      (isProduction || databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech'))
        ? { rejectUnauthorized: false }
        : false,
  },
};

export default psqlDbConfig;
