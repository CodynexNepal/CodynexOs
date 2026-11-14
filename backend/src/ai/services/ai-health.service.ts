import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';

export interface ProviderTelemetry {
  provider: AiProviderName;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntil: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCategory: string | null;
  lastLatencyMs: number | null;
}

export interface OllamaHealthSnapshot {
  enabled: boolean;
  available: boolean;
  version: string | null;
  installedModels: string[];
  runningModels: Array<{ name: string; sizeVram?: number }>;
  latencyMs: number | null;
  error: string | null;
}

export class AiHealthService {
  private readonly telemetry = new Map<AiProviderName, ProviderTelemetry>();

  constructor() {
    for (const provider of [
      AiProviderName.OLLAMA,
      AiProviderName.GEMINI,
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.CLOUDFLARE,
      AiProviderName.HUGGINGFACE,
      AiProviderName.OPENAI,
    ]) {
      this.telemetry.set(provider, {
        provider,
        circuitState: 'CLOSED',
        consecutiveFailures: 0,
        openUntil: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorCategory: null,
        lastLatencyMs: null,
      });
    }
  }

  updateTelemetry(patch: Partial<ProviderTelemetry> & { provider: AiProviderName }) {
    const prev = this.telemetry.get(patch.provider) ?? {
      provider: patch.provider,
      circuitState: 'CLOSED' as const,
      consecutiveFailures: 0,
      openUntil: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCategory: null,
      lastLatencyMs: null,
    };
    this.telemetry.set(patch.provider, { ...prev, ...patch });
  }

  getTelemetrySnapshot(): ProviderTelemetry[] {
    return Array.from(this.telemetry.values());
  }

  async checkOllama(timeoutMs = 3000): Promise<OllamaHealthSnapshot> {
    if (!dotEnvConfig.OLLAMA_ENABLED || !dotEnvConfig.OLLAMA_BASE_URL) {
      return {
        enabled: false,
        available: false,
        version: null,
        installedModels: [],
        runningModels: [],
        latencyMs: null,
        error: 'Ollama is disabled by configuration.',
      };
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const [verRes, tagsRes, psRes] = await Promise.all([
        fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/version`, { signal: controller.signal }),
        fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal }),
        fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/ps`, { signal: controller.signal }),
      ]);

      const latencyMs = Date.now() - started;
      if (!verRes.ok && !tagsRes.ok) {
        return {
          enabled: true,
          available: false,
          version: null,
          installedModels: [],
          runningModels: [],
          latencyMs,
          error: `Ollama HTTP ${verRes.status || tagsRes.status}`,
        };
      }

      const verData = verRes.ok ? ((await verRes.json()) as { version?: string }) : {};
      const tagsData = tagsRes.ok
        ? ((await tagsRes.json()) as { models?: Array<{ name?: string }> })
        : {};
      const psData = psRes.ok
        ? ((await psRes.json()) as { models?: Array<{ name?: string; size_vram?: number }> })
        : {};

      return {
        enabled: true,
        available: true,
        version: verData.version ?? null,
        installedModels: (tagsData.models ?? [])
          .map((m) => m.name)
          .filter((n): n is string => Boolean(n)),
        runningModels: (psData.models ?? [])
          .filter((m) => Boolean(m.name))
          .map((m) => ({ name: m.name!, sizeVram: m.size_vram })),
        latencyMs,
        error: null,
      };
    } catch (err) {
      return {
        enabled: true,
        available: false,
        version: null,
        installedModels: [],
        runningModels: [],
        latencyMs: Date.now() - started,
        error:
          err instanceof Error && err.name === 'AbortError'
            ? `Timed out after ${timeoutMs}ms`
            : err instanceof Error
              ? err.message
              : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getFullHealthReport() {
    const [
      ollama,
      geminiKey,
      groqKey,
      openrouterKey,
      cloudflareToken,
      cloudflareAccount,
      huggingfaceKey,
      openaiKey,
    ] = await Promise.all([
      this.checkOllama(),
      resolveRuntimeSecret('gemini_api_key'),
      resolveRuntimeSecret('groq_api_key'),
      resolveRuntimeSecret('openrouter_api_key'),
      resolveRuntimeSecret('cloudflare_api_token'),
      resolveRuntimeSecret('cloudflare_account_id'),
      resolveRuntimeSecret('huggingface_api_key'),
      resolveRuntimeSecret('openai_api_key'),
    ]);

    const telemetry = this.getTelemetrySnapshot();
    const hasAnyFreeConfigured =
      ollama.available ||
      Boolean(geminiKey) ||
      Boolean(groqKey) ||
      Boolean(openrouterKey) ||
      Boolean(cloudflareToken && cloudflareAccount) ||
      Boolean(huggingfaceKey);

    const overallStatus = hasAnyFreeConfigured ? 'healthy' : 'degraded';

    return {
      status: overallStatus,
      primaryProvider: AiProviderName.OLLAMA,
      routingOrder: [
        AiProviderName.OLLAMA,
        AiProviderName.GEMINI,
        AiProviderName.GROQ,
        AiProviderName.OPENROUTER,
        AiProviderName.CLOUDFLARE,
        AiProviderName.HUGGINGFACE,
        AiProviderName.OPENAI,
      ],
      ollama,
      cloudProviders: {
        gemini: { configured: Boolean(geminiKey) },
        groq: { configured: Boolean(groqKey) },
        openrouter: { configured: Boolean(openrouterKey) },
        cloudflare: { configured: Boolean(cloudflareToken && cloudflareAccount) },
        huggingface: { configured: Boolean(huggingfaceKey) },
        openai: { configured: Boolean(openaiKey) },
      },
      telemetry,
      timestamp: new Date().toISOString(),
    };
  }
}
