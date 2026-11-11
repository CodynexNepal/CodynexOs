import { AppDataSource } from '../../database/database-source';
import { AiUsageLogEntity } from '../../entities/ai-usage-log.entity';
import { BudgetPolicyEntity } from '../../entities/budget-policy.entity';
import { AiProviderName, AiUsageStatus } from '../../constant/enum.constant';
import { sha256Hex } from '../../utils/encryption.util';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';
import { GeminiAdapter } from '../adapters/gemini.adapter';
import { GroqAdapter } from '../adapters/groq.adapter';
import { OllamaAdapter } from '../adapters/ollama.adapter';
import { OpenAiAdapter } from '../adapters/openai.adapter';

export interface RouteOptions {
  taskId?: string | null;
  employeeId?: string | null;
  preferredProvider?: string;
  preferredModel?: string;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  employeeDailyTokenBudget?: number;
}

export class ModelRouterService {
  private readonly adapters: Map<AiProviderName, AiProviderAdapter>;
  private readonly responseCache = new Map<string, { value: AiCompletionResponse; expiresAt: number }>();
  private activeRequests = 0;

  constructor() {
    this.adapters = new Map<AiProviderName, AiProviderAdapter>([
      [AiProviderName.GEMINI, new GeminiAdapter()],
      [AiProviderName.GROQ, new GroqAdapter()],
      [AiProviderName.OLLAMA, new OllamaAdapter()],
      [AiProviderName.OPENAI, new OpenAiAdapter()],
    ]);
  }

  public getProviderStatus() {
    return Array.from(this.adapters.values()).map((adapter) => ({
      provider: adapter.name,
      isPaid: adapter.isPaid,
      configured: adapter.isConfigured(),
    }));
  }

  private async getGlobalPolicy(): Promise<BudgetPolicyEntity | null> {
    if (!AppDataSource.isInitialized) return null;
    return AppDataSource.getRepository(BudgetPolicyEntity).findOne({
      where: { scopeType: 'GLOBAL' },
    });
  }

  private async getTodayTokenTotal(employeeId?: string | null): Promise<number> {
    if (!AppDataSource.isInitialized) return 0;
    const qb = AppDataSource.getRepository(AiUsageLogEntity)
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.input_tokens + u.output_tokens), 0)', 'total')
      .where("u.created_at >= date_trunc('day', NOW())");
    if (employeeId) {
      qb.andWhere('u.employee_id = :employeeId', { employeeId });
    }
    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async logUsage(params: {
    taskId?: string | null;
    employeeId?: string | null;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    status: AiUsageStatus;
    latencyMs: number;
  }) {
    if (!AppDataSource.isInitialized) return;
    await AppDataSource.getRepository(AiUsageLogEntity).save(
      AppDataSource.getRepository(AiUsageLogEntity).create({
        taskId: params.taskId ?? null,
        employeeId: params.employeeId ?? null,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd: params.estimatedCostUsd.toFixed(6),
        status: params.status,
        latencyMs: params.latencyMs,
      }),
    );
  }

  async complete(req: AiCompletionRequest, opts: RouteOptions = {}): Promise<AiCompletionResponse> {
    const cacheKey = sha256Hex(
      JSON.stringify({
        s: req.systemPrompt,
        u: req.userPrompt,
        m: req.model || opts.preferredModel || '',
        f: req.responseFormat || 'text',
      }),
    );

    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.value, latencyMs: 0 };
    }

    const policy = await this.getGlobalPolicy();
    const maxConcurrent = policy?.maxConcurrentRequests ?? 3;
    if (this.activeRequests >= maxConcurrent) {
      throw new AiProviderError(
        AiProviderName.GEMINI,
        'RATE_LIMITED',
        `AI concurrency cap reached (${maxConcurrent} active requests). Task remains queued.`,
      );
    }

    const globalDailyLimit = policy?.dailyTokenLimit ?? 500000;
    const globalUsedToday = await this.getTodayTokenTotal(null);
    if (globalUsedToday >= globalDailyLimit) {
      throw new AiProviderError(
        AiProviderName.GEMINI,
        'QUOTA_EXHAUSTED',
        `Global daily token budget exhausted (${globalUsedToday}/${globalDailyLimit}).`,
      );
    }

    if (opts.employeeId && opts.employeeDailyTokenBudget) {
      const empUsed = await this.getTodayTokenTotal(opts.employeeId);
      if (empUsed >= opts.employeeDailyTokenBudget) {
        throw new AiProviderError(
          AiProviderName.GEMINI,
          'QUOTA_EXHAUSTED',
          `Employee daily token budget exhausted (${empUsed}/${opts.employeeDailyTokenBudget}).`,
        );
      }
    }

    const allowPaid = Boolean(policy?.allowPaidProviders);
    const candidateOrder: Array<{ provider: AiProviderName; model?: string }> = [];

    const addCandidate = (p?: string | null, m?: string | null) => {
      if (!p) return;
      const name = p as AiProviderName;
      if (!candidateOrder.some((c) => c.provider === name)) {
        candidateOrder.push({ provider: name, model: m || undefined });
      }
    };

    addCandidate(opts.preferredProvider || AiProviderName.GEMINI, opts.preferredModel || req.model);
    addCandidate(opts.fallbackProvider || AiProviderName.GROQ, opts.fallbackModel);
    addCandidate(AiProviderName.GEMINI);
    addCandidate(AiProviderName.GROQ);
    addCandidate(AiProviderName.OLLAMA);
    if (allowPaid) {
      addCandidate(AiProviderName.OPENAI);
    }

    const errors: string[] = [];
    let configuredAttempted = false;
    let sawQuotaOrRateLimit = false;
    this.activeRequests += 1;
    try {
      for (const candidate of candidateOrder) {
        const adapter = this.adapters.get(candidate.provider);
        if (!adapter) continue;
        if (adapter.isPaid && !allowPaid) continue;

        try {
          const response = await adapter.complete({
            ...req,
            model: candidate.model || req.model,
          });
          configuredAttempted = true;
          await this.logUsage({
            taskId: opts.taskId,
            employeeId: opts.employeeId,
            provider: response.provider,
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            estimatedCostUsd: response.estimatedCostUsd,
            status: AiUsageStatus.SUCCESS,
            latencyMs: response.latencyMs,
          });
          if (this.responseCache.size > 200) {
            const firstKey = this.responseCache.keys().next().value;
            if (firstKey) this.responseCache.delete(firstKey);
          }
          this.responseCache.set(cacheKey, {
            value: response,
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
          return response;
        } catch (err) {
          if (err instanceof AiProviderError) {
            if (err.code === 'NOT_CONFIGURED') {
              continue;
            }
            configuredAttempted = true;
            if (err.code === 'RATE_LIMITED' || err.code === 'QUOTA_EXHAUSTED') {
              sawQuotaOrRateLimit = true;
            }
            errors.push(`${err.provider}: ${err.message}`);
            const status =
              err.code === 'RATE_LIMITED'
                ? AiUsageStatus.RATE_LIMITED
                : err.code === 'QUOTA_EXHAUSTED'
                  ? AiUsageStatus.QUOTA_EXHAUSTED
                  : AiUsageStatus.ERROR;
            await this.logUsage({
              taskId: opts.taskId,
              employeeId: opts.employeeId,
              provider: candidate.provider,
              model: candidate.model || 'default',
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostUsd: 0,
              status,
              latencyMs: 0,
            });
          } else {
            configuredAttempted = true;
            errors.push(`${candidate.provider}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    }

    if (!configuredAttempted) {
      throw new AiProviderError(
        AiProviderName.GEMINI,
        'NOT_CONFIGURED',
        'No free-tier AI provider API key is configured. Add GEMINI_API_KEY or GROQ_API_KEY.',
      );
    }

    throw new AiProviderError(
      AiProviderName.GEMINI,
      sawQuotaOrRateLimit ? 'QUOTA_EXHAUSTED' : 'PROVIDER_ERROR',
      `No configured free-tier AI provider succeeded: ${errors.join(' | ')}`,
    );
  }
}
