import crypto from 'crypto';
import { dotEnvConfig } from '../../configs/envConfig';
import { AppDataSource } from '../../database/database-source';
import { AiUsageLogEntity } from '../../entities/ai-usage-log.entity';
import { BudgetPolicyEntity } from '../../entities/budget-policy.entity';
import { AiProviderName, AiUsageStatus } from '../../constant/enum.constant';
import { sha256Hex } from '../../utils/encryption.util';
import { logger } from '../../utils/logger.util';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
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
import { AiHealthService } from '../services/ai-health.service';
import { ModelSelectorService } from '../services/model-selector.service';

export interface RouteOptions {
  taskId?: string | null;
  userId?: string | null;
  employeeId?: string | null;
  preferredProvider?: string;
  preferredModel?: string;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  employeeDailyTokenBudget?: number;
  userDailyTokenBudget?: number;
  taskType?: string;
  complexity?: 'low' | 'medium' | 'high';
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntil: number;
}

export class ModelRouterService {
  private readonly adapters: Map<AiProviderName, AiProviderAdapter>;
  private readonly responseCache = new Map<string, { value: AiCompletionResponse; expiresAt: number }>();
  private readonly circuitBreakers = new Map<AiProviderName, CircuitBreakerState>();
  private readonly waitQueue: Array<() => void> = [];
  private activeRequests = 0;

  public readonly healthService = new AiHealthService();
  public readonly modelSelector = new ModelSelectorService();

  constructor() {
    this.adapters = new Map<AiProviderName, AiProviderAdapter>([
      [AiProviderName.OLLAMA, new OllamaAdapter()],
      [AiProviderName.GEMINI, new GeminiAdapter()],
      [AiProviderName.GROQ, new GroqAdapter()],
      [AiProviderName.OPENAI, new OpenAiAdapter()],
    ]);

    for (const provider of this.adapters.keys()) {
      this.circuitBreakers.set(provider, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        openUntil: 0,
      });
    }
  }

  public getProviderStatus() {
    return Array.from(this.adapters.values()).map((adapter) => ({
      provider: adapter.name,
      isPaid: adapter.isPaid,
      configured: adapter.isConfigured(),
    }));
  }

  public getHealthReport() {
    return this.healthService.getFullHealthReport();
  }

  public resetCircuitBreakers() {
    for (const provider of this.adapters.keys()) {
      this.circuitBreakers.set(provider, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        openUntil: 0,
      });
      this.healthService.updateTelemetry({
        provider,
        circuitState: 'CLOSED',
        consecutiveFailures: 0,
        openUntil: null,
      });
    }
  }

  public async probeFreeProviders() {
    const geminiKey = await resolveRuntimeSecret('gemini_api_key');
    const groqKey = await resolveRuntimeSecret('groq_api_key');

    const geminiResult: { configured: boolean; ok: boolean; detail: string; activeModels: string[] } =
      { configured: Boolean(geminiKey), ok: false, detail: 'Not configured', activeModels: [] };

    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`,
        );
        const body = (await res.json()) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
          error?: { message?: string };
        };
        if (res.ok) {
          geminiResult.ok = true;
          geminiResult.activeModels = (body.models ?? [])
            .filter((m) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
            .slice(0, 8)
            .map((m) => m.name!.replace(/^models\//, ''));
          geminiResult.detail = `Connected (${geminiResult.activeModels.length} active models)`;
        } else {
          geminiResult.detail = body.error?.message || `HTTP ${res.status}`;
        }
      } catch (err) {
        geminiResult.detail = err instanceof Error ? err.message : String(err);
      }
    }

    const groqResult: { configured: boolean; ok: boolean; detail: string; activeModels: string[] } = {
      configured: Boolean(groqKey),
      ok: false,
      detail: 'Not configured',
      activeModels: [],
    };

    if (groqKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${groqKey}` },
        });
        const body = (await res.json()) as {
          data?: Array<{ id?: string; active?: boolean }>;
          error?: { message?: string };
        };
        if (res.ok) {
          groqResult.ok = true;
          groqResult.activeModels = (body.data ?? [])
            .filter((m) => m.id && m.active !== false)
            .slice(0, 8)
            .map((m) => m.id!);
          groqResult.detail = `Connected (${groqResult.activeModels.length} active models)`;
        } else {
          groqResult.detail = body.error?.message || `HTTP ${res.status}`;
        }
      } catch (err) {
        groqResult.detail = err instanceof Error ? err.message : String(err);
      }
    }

    const ollamaSnap = await this.healthService.checkOllama();
    const ollamaResult = {
      configured: ollamaSnap.enabled,
      ok: ollamaSnap.available,
      detail: ollamaSnap.available
        ? `Connected (${ollamaSnap.installedModels.length} local model${ollamaSnap.installedModels.length === 1 ? '' : 's'})`
        : ollamaSnap.error || 'Not running',
      activeModels: ollamaSnap.installedModels,
    };

    return { gemini: geminiResult, groq: groqResult, ollama: ollamaResult };
  }

  private async getGlobalPolicy(): Promise<BudgetPolicyEntity | null> {
    if (!AppDataSource.isInitialized) return null;
    return AppDataSource.getRepository(BudgetPolicyEntity).findOne({
      where: { scopeType: 'GLOBAL' },
    });
  }

  private async getTodayTokenTotal(filters: {
    employeeId?: string | null;
    userId?: string | null;
    excludeLocalOllama?: boolean;
  }): Promise<number> {
    if (!AppDataSource.isInitialized) return 0;
    const qb = AppDataSource.getRepository(AiUsageLogEntity)
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.input_tokens + u.output_tokens), 0)', 'total')
      .where("u.created_at >= date_trunc('day', NOW())");
    if (filters.employeeId) {
      qb.andWhere('u.employee_id = :employeeId', { employeeId: filters.employeeId });
    }
    if (filters.userId) {
      qb.andWhere('u.user_id = :userId', { userId: filters.userId });
    }
    if (filters.excludeLocalOllama) {
      qb.andWhere('u.provider != :ollama', { ollama: AiProviderName.OLLAMA });
    }
    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async logUsage(params: {
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
  }) {
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

  private async acquireSlot(maxConcurrent: number, signal?: AbortSignal): Promise<void> {
    if (this.activeRequests < maxConcurrent) {
      this.activeRequests += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.indexOf(onRelease);
        if (idx >= 0) this.waitQueue.splice(idx, 1);
        reject(
          new AiProviderError(
            AiProviderName.OLLAMA,
            'RATE_LIMITED',
            `AI concurrency cap reached (${maxConcurrent} active requests). Task remains queued.`,
            { category: 'RATE_LIMIT' },
          ),
        );
      }, 10_000);

      const onAbort = () => {
        clearTimeout(timeout);
        const idx = this.waitQueue.indexOf(onRelease);
        if (idx >= 0) this.waitQueue.splice(idx, 1);
        reject(new AiProviderError(AiProviderName.OLLAMA, 'PROVIDER_ERROR', 'Request cancelled.'));
      };

      const onRelease = () => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', onAbort);
        this.activeRequests += 1;
        resolve();
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.waitQueue.push(onRelease);
    });
  }

  private releaseSlot() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private isCircuitOpen(provider: AiProviderName): boolean {
    const cb = this.circuitBreakers.get(provider);
    if (!cb) return false;
    if (cb.state === 'OPEN') {
      if (Date.now() >= cb.openUntil) {
        cb.state = 'HALF_OPEN';
        this.healthService.updateTelemetry({
          provider,
          circuitState: 'HALF_OPEN',
        });
        return false;
      }
      return true;
    }
    return false;
  }

  private recordSuccess(provider: AiProviderName, latencyMs: number) {
    this.circuitBreakers.set(provider, {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openUntil: 0,
    });
    this.healthService.updateTelemetry({
      provider,
      circuitState: 'CLOSED',
      consecutiveFailures: 0,
      openUntil: null,
      lastSuccessAt: new Date().toISOString(),
      lastLatencyMs: latencyMs,
    });
  }

  private recordFailure(provider: AiProviderName, err: AiProviderError) {
    const cb = this.circuitBreakers.get(provider) ?? {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openUntil: 0,
    };
    cb.consecutiveFailures += 1;

    const isQuotaOrRate = err.code === 'RATE_LIMITED' || err.code === 'QUOTA_EXHAUSTED';
    const isPermanentAuth = err.category === 'AUTH';
    const shouldOpen = isQuotaOrRate || isPermanentAuth || cb.consecutiveFailures >= 3;

    if (shouldOpen) {
      const backoffMs = err.retryAfterMs
        ? Math.min(300_000, Math.max(5_000, err.retryAfterMs))
        : isPermanentAuth
          ? 300_000
          : Math.min(300_000, 15_000 * 2 ** Math.min(4, cb.consecutiveFailures - 1));
      cb.state = 'OPEN';
      cb.openUntil = Date.now() + backoffMs;
    }

    this.circuitBreakers.set(provider, cb);
    this.healthService.updateTelemetry({
      provider,
      circuitState: cb.state,
      consecutiveFailures: cb.consecutiveFailures,
      openUntil: cb.openUntil ? new Date(cb.openUntil).toISOString() : null,
      lastErrorAt: new Date().toISOString(),
      lastErrorCategory: err.category,
    });
  }

  async complete(req: AiCompletionRequest, opts: RouteOptions = {}): Promise<AiCompletionResponse> {
    const requestId = crypto.randomUUID();
    const canCache = !req.tools?.length && !req.stream && !req.messages?.length;

    const cacheKey = sha256Hex(
      JSON.stringify({
        s: req.systemPrompt,
        u: req.userPrompt,
        m: req.model || opts.preferredModel || '',
        f: req.responseFormat || 'text',
      }),
    );

    if (canCache) {
      const cached = this.responseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.value, latencyMs: 0 };
      }
    }

    const policy = await this.getGlobalPolicy();
    const maxConcurrent = policy?.maxConcurrentRequests ?? 3;
    const allowPaid = Boolean(policy?.allowPaidProviders);
    const globalDailyLimit = policy?.dailyTokenLimit ?? 500000;

    // Cloud token quota check (local Ollama has no external provider token quota)
    const [globalCloudUsedToday, empCloudUsedToday, userCloudUsedToday] = await Promise.all([
      this.getTodayTokenTotal({ excludeLocalOllama: true }),
      opts.employeeId
        ? this.getTodayTokenTotal({ employeeId: opts.employeeId, excludeLocalOllama: true })
        : Promise.resolve(0),
      opts.userId
        ? this.getTodayTokenTotal({ userId: opts.userId, excludeLocalOllama: true })
        : Promise.resolve(0),
    ]);

    const cloudQuotaExhausted =
      globalCloudUsedToday >= globalDailyLimit ||
      Boolean(opts.employeeId && opts.employeeDailyTokenBudget && empCloudUsedToday >= opts.employeeDailyTokenBudget) ||
      Boolean(opts.userId && opts.userDailyTokenBudget && userCloudUsedToday >= opts.userDailyTokenBudget);

    const candidateOrder: Array<{ provider: AiProviderName; model?: string }> = [];
    const addCandidate = (p?: string | null, m?: string | null) => {
      if (!p) return;
      const name = p as AiProviderName;
      if (!candidateOrder.some((c) => c.provider === name)) {
        candidateOrder.push({ provider: name, model: m || undefined });
      }
    };

    // Priority 1: Ollama (local primary)
    addCandidate(
      AiProviderName.OLLAMA,
      opts.preferredProvider === AiProviderName.OLLAMA
        ? opts.preferredModel || req.model
        : undefined,
    );
    // Priority 2: Gemini (or explicit preferred cloud provider if non-ollama)
    if (opts.preferredProvider && opts.preferredProvider !== AiProviderName.OLLAMA) {
      addCandidate(opts.preferredProvider, opts.preferredModel || req.model);
    }
    addCandidate(AiProviderName.GEMINI);
    // Priority 3: Groq
    addCandidate(AiProviderName.GROQ, opts.fallbackProvider === AiProviderName.GROQ ? opts.fallbackModel : undefined);
    // Priority 4: OpenAI (only if budget policy allows paid providers)
    if (allowPaid) {
      addCandidate(AiProviderName.OPENAI);
    }

    const errors: string[] = [];
    let configuredAttempted = false;
    let sawQuotaOrRateLimit = false;

    await this.acquireSlot(maxConcurrent, req.signal);
    try {
      for (const candidate of candidateOrder) {
        const adapter = this.adapters.get(candidate.provider);
        if (!adapter) continue;
        if (adapter.isPaid && !allowPaid) continue;
        if (candidate.provider !== AiProviderName.OLLAMA && cloudQuotaExhausted) {
          errors.push(`${candidate.provider}: Daily cloud token budget reached`);
          sawQuotaOrRateLimit = true;
          continue;
        }
        if (this.isCircuitOpen(candidate.provider)) {
          errors.push(`${candidate.provider}: Circuit breaker OPEN (cooldown active)`);
          continue;
        }

        let chosenModel = candidate.model || req.model;
        if (candidate.provider === AiProviderName.OLLAMA && !chosenModel) {
          const selected = await this.modelSelector.selectOllamaModel({
            taskType: opts.taskType,
            complexity: opts.complexity,
            requiresTools: Boolean(req.tools?.length),
            preferredModel: dotEnvConfig.OLLAMA_MODEL,
          });
          chosenModel = selected.model;
        }

        try {
          const response = await adapter.complete({
            ...req,
            model: chosenModel,
          });
          configuredAttempted = true;
          this.recordSuccess(candidate.provider, response.latencyMs);

          logger.info('AI inference succeeded', {
            requestId,
            provider: response.provider,
            model: response.model,
            latencyMs: response.latencyMs,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
          });

          await this.logUsage({
            taskId: opts.taskId,
            userId: opts.userId,
            employeeId: opts.employeeId,
            requestId,
            provider: response.provider,
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            estimatedCostUsd: response.estimatedCostUsd,
            status: AiUsageStatus.SUCCESS,
            latencyMs: response.latencyMs,
          });

          if (canCache) {
            if (this.responseCache.size > 200) {
              const firstKey = this.responseCache.keys().next().value;
              if (firstKey) this.responseCache.delete(firstKey);
            }
            this.responseCache.set(cacheKey, {
              value: response,
              expiresAt: Date.now() + 10 * 60 * 1000,
            });
          }
          return response;
        } catch (err) {
          if (err instanceof AiProviderError) {
            if (err.code === 'NOT_CONFIGURED' && err.category !== 'UNAVAILABLE') {
              continue;
            }
            if (err.code === 'NOT_CONFIGURED') {
              // Ollama unavailable or key not configured: record failure only if unavailable server
              if (candidate.provider === AiProviderName.OLLAMA && dotEnvConfig.OLLAMA_ENABLED) {
                this.recordFailure(candidate.provider, err);
                errors.push(`${err.provider}: ${err.message}`);
              }
              continue;
            }

            configuredAttempted = true;
            this.recordFailure(candidate.provider, err);
            if (err.code === 'RATE_LIMITED' || err.code === 'QUOTA_EXHAUSTED') {
              sawQuotaOrRateLimit = true;
            }
            errors.push(`${err.provider}: ${err.message}`);

            logger.warn('AI provider attempt failed', {
              requestId,
              provider: candidate.provider,
              model: chosenModel || 'default',
              category: err.category,
              error: err.message,
            });

            const status =
              err.code === 'RATE_LIMITED'
                ? AiUsageStatus.RATE_LIMITED
                : err.code === 'QUOTA_EXHAUSTED'
                  ? AiUsageStatus.QUOTA_EXHAUSTED
                  : AiUsageStatus.ERROR;
            await this.logUsage({
              taskId: opts.taskId,
              userId: opts.userId,
              employeeId: opts.employeeId,
              requestId,
              provider: candidate.provider,
              model: chosenModel || 'default',
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostUsd: 0,
              status,
              errorCategory: err.category,
              latencyMs: 0,
            });
          } else {
            configuredAttempted = true;
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${candidate.provider}: ${msg}`);
          }
        }
      }
    } finally {
      this.releaseSlot();
    }

    if (!configuredAttempted && errors.length === 0) {
      throw new AiProviderError(
        AiProviderName.OLLAMA,
        'NOT_CONFIGURED',
        'No AI provider is available. Start Ollama locally or configure GEMINI_API_KEY / GROQ_API_KEY.',
      );
    }

    throw new AiProviderError(
      AiProviderName.OLLAMA,
      sawQuotaOrRateLimit ? 'QUOTA_EXHAUSTED' : 'PROVIDER_ERROR',
      allowPaid
        ? `No configured AI provider succeeded: ${errors.join(' | ')}`
        : `No configured free-tier AI provider succeeded: ${errors.join(' | ')}`,
    );
  }
}
