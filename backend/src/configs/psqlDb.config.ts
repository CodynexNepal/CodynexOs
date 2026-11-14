import dns from 'dns';
import net from 'net';
import { DataSourceOptions } from 'typeorm';
import { dotEnvConfig } from './envConfig';

// Prevent Node.js from hanging on unreachable IPv6 routes on Windows
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
if (typeof (net as Record<string, unknown>).setDefaultAutoSelectFamily === 'function') {
  (net as { setDefaultAutoSelectFamily: (val: boolean) => void }).setDefaultAutoSelectFamily(false);
}

const isProduction = dotEnvConfig.NODE_ENV === 'production';
const rawDatabaseUrl = dotEnvConfig.DATABASE_URL;

function sanitizeDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Neon PgBouncer pooler does not support SCRAM channel binding in Node.js
    parsed.searchParams.delete('channel_binding');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url
      .replace(/([?&])channel_binding=[^&]+(&|$)/, '$1')
      .replace(/([?&])uselibpqcompat=[^&]+(&|$)/, '$1')
      .replace(/[?&]$/, '');
  }
}

const databaseUrl = sanitizeDbUrl(rawDatabaseUrl);

const isTsNode =
  Symbol.for('ts-node.register.instance') in process ||
  Boolean(process.env.TS_NODE_DEV) ||
  process.argv.some((arg) => arg.includes('ts-node') || arg.includes('vitest'));

const isSslRequired =
  !databaseUrl.includes('127.0.0.1') &&
  !databaseUrl.includes('localhost') &&
  (isProduction || databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech'));

export const psqlDbConfig: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
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
  ssl: isSslRequired ? { rejectUnauthorized: false } : false,
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '8', 10),
    min: parseInt(process.env.DB_POOL_MIN || '0', 10),
    // Increase timeout to 30s to allow serverless Postgres (e.g. Neon) to cold start smoothly
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '300000', 10),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: isSslRequired ? { rejectUnauthorized: false } : false,
  },
};

export default psqlDbConfig;
