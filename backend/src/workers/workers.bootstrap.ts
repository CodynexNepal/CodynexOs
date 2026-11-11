import { dotEnvConfig } from '../configs/envConfig';
import { OrchestratorService } from '../services/orchestrator.service';
import { logger } from '../utils/logger.util';

let timer: NodeJS.Timeout | null = null;
let ticking = false;

export function bootstrapWorkers(orchestrator: OrchestratorService): void {
  if (!dotEnvConfig.ENABLE_WORKERS) {
    logger.info('Background worker loop disabled (ENABLE_WORKERS=false); relying on /workers/tick');
    return;
  }

  const intervalMs = dotEnvConfig.WORKER_POLL_INTERVAL_MS;
  logger.info('Starting durable PostgreSQL task worker loop', { intervalMs });

  timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await orchestrator.runTick(2);
    } catch (err) {
      logger.error('Worker tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      ticking = false;
    }
  }, intervalMs);
}

export async function shutdownWorkers(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Background task worker loop stopped');
  }
}
