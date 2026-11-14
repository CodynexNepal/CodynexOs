import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName, ModelEligibilityStatus } from '../../constant/enum.constant';
import { AppDataSource } from '../../database/database-source';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { encryptSecret } from '../../utils/encryption.util';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import { AiProviderAdapter } from '../ai-provider.interface';
import { GeminiAdapter } from '../adapters/gemini.adapter';
import { GroqAdapter } from '../adapters/groq.adapter';
import { OllamaAdapter } from '../adapters/ollama.adapter';
import { OpenAiAdapter } from '../adapters/openai.adapter';
import { OpenRouterAdapter } from '../adapters/openrouter.adapter';
import { CloudflareAdapter } from '../adapters/cloudflare.adapter';
import { HuggingFaceAdapter } from '../adapters/huggingface.adapter';
import { VERIFIED_FREE_MODELS } from '../config/free-models.config';
import { AiModelInfo, AiProviderConfig } from '../interfaces/ai-model.interface';

export class ProviderManagerService {
  private readonly adapters = new Map<AiProviderName, AiProviderAdapter>();

  constructor() {
    this.adapters.set(AiProviderName.OLLAMA, new OllamaAdapter());
    this.adapters.set(AiProviderName.GEMINI, new GeminiAdapter());
    this.adapters.set(AiProviderName.GROQ, new GroqAdapter());
    this.adapters.set(AiProviderName.OPENROUTER, new OpenRouterAdapter());
    this.adapters.set(AiProviderName.CLOUDFLARE, new CloudflareAdapter());
    this.adapters.set(AiProviderName.HUGGINGFACE, new HuggingFaceAdapter());
    this.adapters.set(AiProviderName.OPENAI, new OpenAiAdapter());
  }

  public getAdapter(provider: AiProviderName): AiProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  public getAllAdapters(): Map<AiProviderName, AiProviderAdapter> {
    return this.adapters;
  }

  /**
   * Returns metadata and live configuration status for all providers.
   */
  public async listProviders(): Promise<AiProviderConfig[]> {
    const [
      geminiKey,
      groqKey,
      openrouterKey,
      cfAccount,
      cfToken,
      hfKey,
      openaiKey,
    ] = await Promise.all([
      resolveRuntimeSecret('gemini_api_key'),
      resolveRuntimeSecret('groq_api_key'),
      resolveRuntimeSecret('openrouter_api_key'),
      resolveRuntimeSecret('cloudflare_account_id'),
      resolveRuntimeSecret('cloudflare_api_token'),
      resolveRuntimeSecret('huggingface_api_key'),
      resolveRuntimeSecret('openai_api_key'),
    ]);

    const isCfConfigured = Boolean(
      (cfAccount || dotEnvConfig.CLOUDFLARE_ACCOUNT_ID) &&
        (cfToken || dotEnvConfig.CLOUDFLARE_API_TOKEN),
    );

    return [
      {
        provider: AiProviderName.OLLAMA,
        displayName: 'Ollama (Local Inference)',
        isPaid: false,
        isConfigured: dotEnvConfig.OLLAMA_ENABLED && Boolean(dotEnvConfig.OLLAMA_BASE_URL),
        isEnabled: dotEnvConfig.OLLAMA_ENABLED,
        isLocal: true,
        priority: 1,
        defaultModel: dotEnvConfig.OLLAMA_MODEL || 'qwen3:4b',
        freeTierNotes: '100% Free & offline execution directly on your local device.',
        quotaInfoUnavailable: false,
        endpoint: dotEnvConfig.OLLAMA_BASE_URL,
      },
      {
        provider: AiProviderName.GEMINI,
        displayName: 'Google Gemini',
        isPaid: false,
        isConfigured: Boolean(geminiKey || dotEnvConfig.GEMINI_API_KEY),
        isEnabled: true,
        isLocal: false,
        priority: 2,
        defaultModel: dotEnvConfig.GEMINI_MODEL || 'gemini-3.8-flash',
        freeTierNotes: 'Free API tier via Google AI Studio (15 RPM / 1M TPM / 1500 RPD).',
        quotaInfoUnavailable: true,
      },
      {
        provider: AiProviderName.GROQ,
        displayName: 'Groq LPUs',
        isPaid: false,
        isConfigured: Boolean(groqKey || dotEnvConfig.GROQ_API_KEY),
        isEnabled: true,
        isLocal: false,
        priority: 3,
        defaultModel: dotEnvConfig.GROQ_MODEL || 'llama-3.3-70b-versatile',
        freeTierNotes: 'Free developer tier: 30 RPM, 6K TPM on custom LPU silicon.',
        quotaInfoUnavailable: true,
      },
      {
        provider: AiProviderName.OPENROUTER,
        displayName: 'OpenRouter (Free Hub)',
        isPaid: false,
        isConfigured: Boolean(openrouterKey || dotEnvConfig.OPENROUTER_API_KEY),
        isEnabled: true,
        isLocal: false,
        priority: 4,
        defaultModel: dotEnvConfig.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        freeTierNotes: 'Community-supported $0 verified models with 20 RPM free allowance.',
        quotaInfoUnavailable: true,
      },
      {
        provider: AiProviderName.CLOUDFLARE,
        displayName: 'Cloudflare Workers AI',
        isPaid: false,
        isConfigured: isCfConfigured,
        isEnabled: true,
        isLocal: false,
        priority: 5,
        defaultModel: dotEnvConfig.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct',
        freeTierNotes: '10,000 free Neurons/day edge inference globally across Cloudflare network.',
        quotaInfoUnavailable: false,
        dailyQuotaLimit: 10000,
      },
      {
        provider: AiProviderName.HUGGINGFACE,
        displayName: 'Hugging Face Serverless',
        isPaid: false,
        isConfigured: Boolean(hfKey || dotEnvConfig.HUGGINGFACE_API_KEY),
        isEnabled: true,
        isLocal: false,
        priority: 6,
        defaultModel: dotEnvConfig.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.2-3B-Instruct',
        freeTierNotes: 'Free serverless community inference with warm-up fallback.',
        quotaInfoUnavailable: true,
      },
      {
        provider: AiProviderName.OPENAI,
        displayName: 'OpenAI (Paid Provider)',
        isPaid: true,
        isConfigured: Boolean(openaiKey || dotEnvConfig.OPENAI_API_KEY),
        isEnabled: false,
        isLocal: false,
        priority: 7,
        defaultModel: dotEnvConfig.OPENAI_MODEL || 'gpt-4o-mini',
        freeTierNotes: 'Commercial paid provider ($0.15 - $10/M tokens). BLOCKED in FREE-ONLY mode.',
        quotaInfoUnavailable: true,
      },
    ];
  }

  /**
   * Tests connection to a specific provider and returns detailed health metrics.
   */
  public async testProviderConnection(
    provider: AiProviderName,
    testCredentials?: { apiKey?: string; accountId?: string; apiToken?: string; baseUrl?: string },
  ): Promise<{ ok: boolean; latencyMs: number; message: string; activeModels: string[] }> {
    const started = Date.now();

    try {
      if (provider === AiProviderName.OLLAMA) {
        const url = testCredentials?.baseUrl || dotEnvConfig.OLLAMA_BASE_URL;
        const res = await fetch(`${url}/api/tags`);
        const latencyMs = Date.now() - started;
        if (res.ok) {
          const body = (await res.json()) as { models?: Array<{ name?: string }> };
          const activeModels = (body.models ?? []).filter((m) => m.name).map((m) => m.name!);
          return {
            ok: true,
            latencyMs,
            message: `Ollama is running locally with ${activeModels.length} installed model(s).`,
            activeModels,
          };
        }
        return {
          ok: false,
          latencyMs,
          message: `Ollama returned HTTP ${res.status}.`,
          activeModels: [],
        };
      }

      if (provider === AiProviderName.GEMINI) {
        const key = testCredentials?.apiKey || (await resolveRuntimeSecret('gemini_api_key')) || dotEnvConfig.GEMINI_API_KEY;
        if (!key) return { ok: false, latencyMs: 0, message: 'Gemini API Key is not configured.', activeModels: [] };

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        const latencyMs = Date.now() - started;
        if (res.ok) {
          const body = (await res.json()) as { models?: Array<{ name?: string }> };
          const activeModels = (body.models ?? [])
            .filter((m) => m.name && /flash/i.test(m.name))
            .slice(0, 6)
            .map((m) => m.name!.replace(/^models\//, ''));
          return {
            ok: true,
            latencyMs,
            message: `Connected to Google AI Studio (${activeModels.length} Flash models available).`,
            activeModels,
          };
        }
        const err = await res.text().catch(() => '');
        return { ok: false, latencyMs, message: `Gemini API error ${res.status}: ${err.slice(0, 150)}`, activeModels: [] };
      }

      if (provider === AiProviderName.GROQ) {
        const key = testCredentials?.apiKey || (await resolveRuntimeSecret('groq_api_key')) || dotEnvConfig.GROQ_API_KEY;
        if (!key) return { ok: false, latencyMs: 0, message: 'Groq API Key is not configured.', activeModels: [] };

        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const latencyMs = Date.now() - started;
        if (res.ok) {
          const body = (await res.json()) as { data?: Array<{ id?: string }> };
          const activeModels = (body.data ?? []).slice(0, 6).map((m) => m.id!);
          return {
            ok: true,
            latencyMs,
            message: `Connected to Groq LPUs (${activeModels.length} active models).`,
            activeModels,
          };
        }
        return { ok: false, latencyMs, message: `Groq error HTTP ${res.status}`, activeModels: [] };
      }

      if (provider === AiProviderName.OPENROUTER) {
        const key = testCredentials?.apiKey || (await resolveRuntimeSecret('openrouter_api_key')) || dotEnvConfig.OPENROUTER_API_KEY;
        if (!key) return { ok: false, latencyMs: 0, message: 'OpenRouter API Key is not configured.', activeModels: [] };

        const adapter = this.adapters.get(AiProviderName.OPENROUTER) as OpenRouterAdapter;
        const freeModels = await adapter.discoverFreeModels(key);
        const latencyMs = Date.now() - started;
        return {
          ok: freeModels.length > 0,
          latencyMs,
          message: `Connected to OpenRouter. Discovered ${freeModels.length} verified $0 free models.`,
          activeModels: freeModels.slice(0, 8).map((m) => m.id),
        };
      }

      if (provider === AiProviderName.CLOUDFLARE) {
        const accountId = testCredentials?.accountId || (await resolveRuntimeSecret('cloudflare_account_id')) || dotEnvConfig.CLOUDFLARE_ACCOUNT_ID;
        const token = testCredentials?.apiToken || (await resolveRuntimeSecret('cloudflare_api_token')) || dotEnvConfig.CLOUDFLARE_API_TOKEN;

        if (!accountId || !token) {
          return { ok: false, latencyMs: 0, message: 'Cloudflare Account ID & API Token required.', activeModels: [] };
        }

        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?task=Text%20Generation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const latencyMs = Date.now() - started;
        if (res.ok) {
          const body = (await res.json()) as { result?: Array<{ id?: string; name?: string }> };
          const activeModels = (body.result ?? []).slice(0, 6).map((m) => m.id || m.name || '');
          return {
            ok: true,
            latencyMs,
            message: `Connected to Cloudflare Workers AI (${activeModels.length} text models found).`,
            activeModels,
          };
        }
        return { ok: false, latencyMs, message: `Cloudflare error HTTP ${res.status}`, activeModels: [] };
      }

      if (provider === AiProviderName.HUGGINGFACE) {
        const key = testCredentials?.apiKey || (await resolveRuntimeSecret('huggingface_api_key')) || dotEnvConfig.HUGGINGFACE_API_KEY;
        if (!key) return { ok: false, latencyMs: 0, message: 'Hugging Face API Key is not configured.', activeModels: [] };

        const res = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const latencyMs = Date.now() - started;
        if (res.ok) {
          const verified = VERIFIED_FREE_MODELS[AiProviderName.HUGGINGFACE].map((m) => m.id);
          return {
            ok: true,
            latencyMs,
            message: 'Connected to Hugging Face Serverless Inference API.',
            activeModels: verified,
          };
        }
        return { ok: false, latencyMs, message: `Hugging Face error HTTP ${res.status}`, activeModels: [] };
      }

      if (provider === AiProviderName.OPENAI) {
        const key = testCredentials?.apiKey || (await resolveRuntimeSecret('openai_api_key')) || dotEnvConfig.OPENAI_API_KEY;
        if (!key) return { ok: false, latencyMs: 0, message: 'OpenAI API Key is not configured.', activeModels: [] };

        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        const latencyMs = Date.now() - started;
        if (res.ok) {
          return {
            ok: true,
            latencyMs,
            message: 'Connected to OpenAI API (PAID provider - blocked in FREE-ONLY mode).',
            activeModels: ['gpt-4o-mini', 'gpt-4o'],
          };
        }
        return { ok: false, latencyMs, message: `OpenAI error HTTP ${res.status}`, activeModels: [] };
      }

      return { ok: false, latencyMs: 0, message: `Unknown provider: ${provider}`, activeModels: [] };
    } catch (err: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        activeModels: [],
      };
    }
  }

  /**
   * Discovers and returns all verified free models for a provider.
   */
  public async getProviderModels(provider: AiProviderName): Promise<AiModelInfo[]> {
    const curated = VERIFIED_FREE_MODELS[provider] || [];

    if (provider === AiProviderName.OPENROUTER) {
      const adapter = this.adapters.get(AiProviderName.OPENROUTER) as OpenRouterAdapter;
      const discovered = await adapter.discoverFreeModels();
      if (discovered.length > 0) return discovered;
    }

    if (provider === AiProviderName.OLLAMA) {
      const adapter = this.adapters.get(AiProviderName.OLLAMA) as OllamaAdapter;
      try {
        const res = await fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/tags`);
        if (res.ok) {
          const body = (await res.json()) as { models?: Array<{ name?: string; size?: number }> };
          const dynamicModels: AiModelInfo[] = (body.models ?? []).filter((m) => m.name).map((m) => ({
            id: m.name!,
            name: m.name!,
            provider: AiProviderName.OLLAMA,
            eligibility: ModelEligibilityStatus.FREE_VERIFIED,
            isFree: true,
            pricing: { promptUsdPerMillion: 0, completionUsdPerMillion: 0 },
            contextWindow: 32768,
            supportsTools: true,
            supportsStreaming: true,
            supportsJson: true,
            description: `Local installed Ollama model (${Math.round((m.size || 0) / 1024 / 1024)} MB).`,
            verifiedFreeAt: new Date().toISOString(),
          }));
          if (dynamicModels.length > 0) return dynamicModels;
        }
      } catch {
        // Fall back to curated
      }
    }

    if (provider === AiProviderName.CLOUDFLARE) {
      const adapter = this.adapters.get(AiProviderName.CLOUDFLARE) as CloudflareAdapter;
      const discovered = await adapter.discoverFreeModels();
      if (discovered.length > 0) return discovered;
    }

    if (provider === AiProviderName.HUGGINGFACE) {
      const adapter = this.adapters.get(AiProviderName.HUGGINGFACE) as HuggingFaceAdapter;
      const discovered = await adapter.discoverFreeModels();
      if (discovered.length > 0) return discovered;
    }

    return curated;
  }

  /**
   * Returns all verified free models across all registered providers.
   */
  public async getAllFreeModels(): Promise<AiModelInfo[]> {
    const allModels: AiModelInfo[] = [];
    const providers = [
      AiProviderName.OLLAMA,
      AiProviderName.GEMINI,
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.CLOUDFLARE,
      AiProviderName.HUGGINGFACE,
    ];

    for (const p of providers) {
      const models = await this.getProviderModels(p);
      allModels.push(...models.filter((m) => m.eligibility === ModelEligibilityStatus.FREE_VERIFIED));
    }

    return allModels;
  }

  /**
   * Stores an API key or token for a provider encrypted at rest using AES-256-GCM.
   */
  public async saveProviderCredentials(
    provider: AiProviderName,
    credentials: { apiKey?: string; accountId?: string; apiToken?: string; baseUrl?: string },
  ): Promise<boolean> {
    if (!AppDataSource.isInitialized) return false;

    const repo = AppDataSource.getRepository(SystemSettingEntity);

    if (credentials.apiKey) {
      const keyName = `${provider}_api_key`;
      const encrypted = encryptSecret(credentials.apiKey.trim());
      await repo.save(
        repo.create({
          key: keyName,
          isSecret: true,
          value: { encrypted },
        }),
      );
    }

    if (provider === AiProviderName.CLOUDFLARE) {
      if (credentials.accountId) {
        await repo.save(
          repo.create({
            key: 'cloudflare_account_id',
            isSecret: false,
            value: { value: credentials.accountId.trim() },
          }),
        );
      }
      if (credentials.apiToken) {
        const encrypted = encryptSecret(credentials.apiToken.trim());
        await repo.save(
          repo.create({
            key: 'cloudflare_api_token',
            isSecret: true,
            value: { encrypted },
          }),
        );
      }
    }

    return true;
  }

  /**
   * Deletes credentials for a given provider.
   */
  public async removeProviderCredentials(provider: AiProviderName): Promise<boolean> {
    if (!AppDataSource.isInitialized) return false;

    const repo = AppDataSource.getRepository(SystemSettingEntity);
    const keysToRemove = [`${provider}_api_key`];
    if (provider === AiProviderName.CLOUDFLARE) {
      keysToRemove.push('cloudflare_account_id', 'cloudflare_api_token');
    }

    for (const k of keysToRemove) {
      await repo.delete({ key: k });
    }

    return true;
  }
}
