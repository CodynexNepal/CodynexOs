import { GovernanceRepository } from '../repository/governance.repository';
import { logger } from '../utils/logger.util';

export class AuditService {
  constructor(private readonly governanceRepo: GovernanceRepository) {}

  async log(params: {
    actorType: 'USER' | 'AI_EMPLOYEE' | 'SYSTEM' | 'WORKER';
    actorId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    ipAddress?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.governanceRepo.appendAuditLog({
        actorType: params.actorType,
        actorId: params.actorId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        ipAddress: params.ipAddress ?? null,
        metadata: params.metadata ?? {},
      });
    } catch (err) {
      logger.error('Failed to persist audit log', {
        action: params.action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
