import Redis from 'ioredis';
import { dotEnvConfig } from './envConfig';

let sharedClient: Redis | null = null;

export function getOptionalRedisClient(): Redis | null {
  if (!dotEnvConfig.ENABLE_REDIS) {
    return null;
  }
  if (!sharedClient) {
    sharedClient = new Redis(dotEnvConfig.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
    sharedClient.on('error', (err) => {
      console.warn('[Redis] Optional Redis error (PostgreSQL fallback active):', err.message);
    });
  }
  return sharedClient;
}

export async function closeRedisConnections(): Promise<void> {
  if (sharedClient) {
    await sharedClient.quit().catch(() => sharedClient?.disconnect());
    sharedClient = null;
  }
}
