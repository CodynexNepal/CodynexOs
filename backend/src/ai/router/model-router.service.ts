import crypto from 'crypto';
import { dotEnvConfig } from '../../configs/envConfig';
import { AppDataSource } from '../../database/database-source';
import { AiUsageLogEntity } from '../../entities/ai-usage-log.entity';
import { BudgetPolicyEntity } from '../../entities/budget-policy.entity';
import { AiProviderName, AiUsageStatus, ModelEligibilityStatus } from '../../constant/enum.constant';
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
import { OpenRouterAdapter } from '../adapters/openrouter.adapter';
import { CloudflareAdapter } from '../adapters/cloudflare.adapter';
import { HuggingFaceAdapter } from '../adapters/huggingface.adapter';
import { AiHealthService } from '../services/ai-health.service';
import { ModelSelectorService } from '../services/model-selector.service';
import { ProviderManagerService } from '../services/provider-manager.service';
import { AiSettingsService } from '../services/ai-settings.service';
import { QuotaManagerService } from '../services/quota-manager.service';
import { ModelEligibilityValidator } from '../services/model-eligibility.validator';
import { AgentModelPreference, AiGlobalSettings, AiModelInfo, AiProviderConfig, ProviderQuotaInfo } from '../interfaces/ai-model.interface';

export interface RouteOptions {
  taskId?: string | null;
  userId?: string | null;
  employeeId?: string | null;
  agentRole?: string | null;
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
  public readonly providerManager = new ProviderManagerService();
  public readonly aiSettingsService = new AiSettingsService();
  public readonly quotaManager = new QuotaManagerService();

  constructor() {
    this.adapters = this.providerManager.getAllAdapters();

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
    const [geminiKey, groqKey, openrouterKey, cfAccount, cfToken, hfKey] = await Promise.all([
      resolveRuntimeSecret('gemini_api_key'),
      resolveRuntimeSecret('groq_api_key'),
      resolveRuntimeSecret('openrouter_api_key'),
      resolveRuntimeSecret('cloudflare_account_id'),
      resolveRuntimeSecret('cloudflare_api_token'),
      resolveRuntimeSecret('huggingface_api_key'),
    ]);

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

    const openrouterResult: { configured: boolean; ok: boolean; detail: string; activeModels: string[] } = {
      configured: Boolean(openrouterKey),
      ok: false,
      detail: 'Not configured',
      activeModels: [],
    };

    if (openrouterKey) {
      try {
        const openrouterAdapter = this.adapters.get(AiProviderName.OPENROUTER) as OpenRouterAdapter;
        const freeModels = await openrouterAdapter.discoverFreeModels(openrouterKey);
        openrouterResult.ok = freeModels.length > 0;
        openrouterResult.activeModels = freeModels.slice(0, 8).map((m) => m.id);
        openrouterResult.detail = openrouterResult.ok
          ? `Connected (${freeModels.length} verified free models)`
          : 'Connected (no free models discovered)';
      } catch (err) {
        openrouterResult.detail = err instanceof Error ? err.message : String(err);
      }
    }

    const cloudflareResult: { configured: boolean; ok: boolean; detail: string; activeModels: string[] } = {
      configured: Boolean((cfAccount || dotEnvConfig.CLOUDFLARE_ACCOUNT_ID) && (cfToken || dotEnvConfig.CLOUDFLARE_API_TOKEN)),
      ok: false,
      detail: 'Not configured',
      activeModels: [],
    };

    if (cloudflareResult.configured) {
      const actId = cfAccount || dotEnvConfig.CLOUDFLARE_ACCOUNT_ID;
      const tok = cfToken || dotEnvConfig.CLOUDFLARE_API_TOKEN;
      try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(actId)}/ai/models/search?task=Text%20Generation`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (res.ok) {
          const body = (await res.json()) as { result?: Array<{ id?: string }> };
          cloudflareResult.ok = true;
          cloudflareResult.activeModels = (body.result ?? []).slice(0, 6).map((m) => m.id || '');
          cloudflareResult.detail = `Connected (${cloudflareResult.activeModels.length} edge models)`;
        } else {
          cloudflareResult.detail = `HTTP ${res.status}`;
        }
      } catch (err) {
        cloudflareResult.detail = err instanceof Error ? err.message : String(err);
      }
    }

    const huggingfaceResult: { configured: boolean; ok: boolean; detail: string; activeModels: string[] } = {
      configured: Boolean(hfKey),
      ok: false,
      detail: 'Not configured',
      activeModels: [],
    };

    if (hfKey) {
      try {
        const res = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${hfKey}` },
        });
        if (res.ok) {
          huggingfaceResult.ok = true;
          huggingfaceResult.activeModels = ['meta-llama/Llama-3.2-3B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'];
          huggingfaceResult.detail = 'Connected to Serverless Inference';
        } else {
          huggingfaceResult.detail = `HTTP ${res.status}`;
        }
      } catch (err) {
        huggingfaceResult.detail = err instanceof Error ? err.message : String(err);
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

    return {
      gemini: geminiResult,
      groq: groqResult,
      ollama: ollamaResult,
      openrouter: openrouterResult,
      cloudflare: cloudflareResult,
      huggingface: huggingfaceResult,
    };
  }

  // --- Multi-Provider Management Facades ---

  public async listProviders(): Promise<AiProviderConfig[]> {
    return this.providerManager.listProviders();
  }

  public async testProvider(
    provider: AiProviderName,
    creds?: { apiKey?: string; accountId?: string; apiToken?: string; baseUrl?: string },
  ) {
    return this.providerManager.testProviderConnection(provider, creds);
  }

  public async getProviderModels(provider: AiProviderName): Promise<AiModelInfo[]> {
    return this.providerManager.getProviderModels(provider);
  }

  public async getAllFreeModels(): Promise<AiModelInfo[]> {
    return this.providerManager.getAllFreeModels();
  }

  public async getGlobalSettings(): Promise<AiGlobalSettings> {
    return this.aiSettingsService.getGlobalSettings();
  }

  public async updateGlobalSettings(patch: Partial<AiGlobalSettings>): Promise<AiGlobalSettings> {
    return this.aiSettingsService.updateGlobalSettings(patch);
  }

  public async getAgentPreferences(): Promise<AgentModelPreference[]> {
    return this.aiSettingsService.getAgentPreferences();
  }

  public async updateAgentPreference(agentRole: string, patch: Partial<AgentModelPreference>): Promise<AgentModelPreference> {
    return this.aiSettingsService.updateAgentPreference(agentRole, patch);
  }

  public async saveProviderCredentials(
    provider: AiProviderName,
    creds: { apiKey?: string; accountId?: string; apiToken?: string; baseUrl?: string },
  ): Promise<boolean> {
    return this.providerManager.saveProviderCredentials(provider, creds);
  }

  public async removeProviderCredentials(provider: AiProviderName): Promise<boolean> {
    return this.providerManager.removeProviderCredentials(provider);
  }

  public async getQuotaStatus(): Promise<ProviderQuotaInfo[]> {
    return this.quotaManager.getQuotaStatus();
  }

  // --- Private Helpers ---

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

  // --- Central AI Completion Router ---

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

    const [policy, globalSettings, agentPreferences] = await Promise.all([
      this.getGlobalPolicy(),
      this.aiSettingsService.getGlobalSettings(),
      this.aiSettingsService.getAgentPreferences(),
    ]);

    const freeOnlyMode = dotEnvConfig.AI_FREE_ONLY && globalSettings.freeOnlyMode;
    const allowPaid = Boolean(policy?.allowPaidProviders || globalSettings.allowPaidProviders) && !freeOnlyMode;
    const maxConcurrent = globalSettings.maxConcurrentRequests ?? policy?.maxConcurrentRequests ?? 4;
    const globalDailyLimit = policy?.dailyTokenLimit ?? globalSettings.dailyTokenLimit ?? 500000;

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

    // Agent-specific preferred provider lookup
    let agentPref = opts.agentRole
      ? agentPreferences.find((a) => a.agentRole.toLowerCase() === opts.agentRole!.toLowerCase())
      : undefined;

    if (!agentPref && opts.taskType) {
      agentPref = agentPreferences.find((a) => a.agentRole.toLowerCase() === opts.taskType!.toLowerCase());
    }

    const preferredProvider = opts.preferredProvider || agentPref?.preferredProvider;
    const preferredModel = opts.preferredModel || agentPref?.preferredModel || req.model;
    const fallbackProvider = opts.fallbackProvider || agentPref?.fallbackProvider;
    const fallbackModel = opts.fallbackModel || agentPref?.fallbackModel;

    const candidateOrder: Array<{ provider: AiProviderName; model?: string }> = [];
    const addCandidate = (p?: string | null, m?: string | null) => {
      if (!p) return;
      const name = p as AiProviderName;
      if (!candidateOrder.some((c) => c.provider === name)) {
        candidateOrder.push({ provider: name, model: m || undefined });
      }
    };

    // 1. Preferred provider (agent preference or caller preference)
    if (preferredProvider) {
      addCandidate(preferredProvider, preferredModel);
    } else {
      addCandidate(AiProviderName.OLLAMA);
    }

    // 2. Explicit fallback provider (if specified)
    if (fallbackProvider) {
      addCandidate(fallbackProvider, fallbackModel);
    }

    // 3. Ollama (local primary) if not already first
    addCandidate(AiProviderName.OLLAMA);

    // 4. Default priority order across verified free providers
    const priorityList = globalSettings.providerPriority || [
      AiProviderName.OLLAMA,
      AiProviderName.GEMINI,
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.CLOUDFLARE,
      AiProviderName.HUGGINGFACE,
    ];

    for (const p of priorityList) {
      if (p !== AiProviderName.OPENAI || allowPaid) {
        addCandidate(p);
      }
    }

    // 5. OpenAI only if paid providers are explicitly allowed AND free-only mode is OFF
    if (allowPaid && !freeOnlyMode) {
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

        if (!chosenModel) {
          if (candidate.provider === AiProviderName.GEMINI) chosenModel = dotEnvConfig.GEMINI_MODEL || 'gemini-3.8-flash';
          if (candidate.provider === AiProviderName.GROQ) chosenModel = dotEnvConfig.GROQ_MODEL || 'llama-3.3-70b-versatile';
          if (candidate.provider === AiProviderName.OPENROUTER) chosenModel = dotEnvConfig.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
          if (candidate.provider === AiProviderName.CLOUDFLARE) chosenModel = dotEnvConfig.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';
          if (candidate.provider === AiProviderName.HUGGINGFACE) chosenModel = dotEnvConfig.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.2-3B-Instruct';
          if (candidate.provider === AiProviderName.OPENAI) chosenModel = dotEnvConfig.OPENAI_MODEL || 'gpt-4o-mini';
        }

        // STRICT FREE-ONLY VALIDATOR: Prevent execution of paid or unknown pricing models
        const validation = ModelEligibilityValidator.validate(candidate.provider, chosenModel || 'default', {
          freeOnlyMode,
          allowPaidProviders: allowPaid,
        });

        if (!validation.eligible) {
          errors.push(`${candidate.provider}: ${validation.reason}`);
          continue;
        }

        if (adapter.isPaid && !allowPaid) {
          errors.push(`${candidate.provider}: Paid providers blocked by $0 policy`);
          continue;
        }

        if (candidate.provider !== AiProviderName.OLLAMA && cloudQuotaExhausted) {
          errors.push(`${candidate.provider}: Daily cloud token budget reached`);
          sawQuotaOrRateLimit = true;
          continue;
        }

        if (this.isCircuitOpen(candidate.provider)) {
          errors.push(`${candidate.provider}: Circuit breaker OPEN (cooldown active)`);
          continue;
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
        'No free AI provider is currently available. Start Ollama locally or configure GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or CLOUDFLARE_API_TOKEN.',
      );
    }

    throw new AiProviderError(
      AiProviderName.OLLAMA,
      sawQuotaOrRateLimit ? 'QUOTA_EXHAUSTED' : 'PROVIDER_ERROR',
      freeOnlyMode
        ? `No free AI provider succeeded under strict FREE-ONLY mode: ${errors.join(' | ')}`
        : `No configured AI provider succeeded: ${errors.join(' | ')}`,
    );
  }
}
