import { AppDataSource } from '../../database/database-source';
import { AiUsageLogEntity } from '../../entities/ai-usage-log.entity';
import { AiUsageStatus } from '../../constant/enum.constant';

export interface UsageLogParams {
  taskId?: string | null;
  userId?: string | null;
  employeeId?: string | null;
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  status: AiUsageStatus;
  errorCategory?: string | null;
  latencyMs: number;
}

export class UsageTrackerService {
  async log(params: UsageLogParams): Promise<void> {
    if (!AppDataSource.isInitialized) return;
    const totalTokens = params.inputTokens + params.outputTokens;
    await AppDataSource.getRepository(AiUsageLogEntity).save(
      AppDataSource.getRepository(AiUsageLogEntity).create({
        taskId: params.taskId ?? null,
        userId: params.userId ?? null,
        employeeId: params.employeeId ?? null,
        requestId: params.requestId,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens,
        estimatedCostUsd: params.estimatedCostUsd.toFixed(6),
        status: params.status,
        errorCategory: params.errorCategory ?? null,
        latencyMs: params.latencyMs,
      }),
    );
  }
}
