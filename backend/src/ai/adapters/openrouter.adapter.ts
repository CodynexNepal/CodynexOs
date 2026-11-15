import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName, ModelEligibilityStatus } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import {
  AiChatMessage,
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
  AiToolCall,
} from '../ai-provider.interface';
import { AiModelInfo } from '../interfaces/ai-model.interface';

const DEFAULT_FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

export class OpenRouterAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.OPENROUTER;
  public readonly isPaid = false; // Operated in free-only mode

  isConfigured(): boolean {
    return Boolean(
      dotEnvConfig.OPENROUTER_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.OPEN_ROUTER_API_KEY,
    );
  }

  /**
   * Discovers available models from OpenRouter and filters for verified $0 free models.
   */
  async discoverFreeModels(apiKey?: string): Promise<AiModelInfo[]> {
    const key = apiKey || (await resolveRuntimeSecret('openrouter_api_key'));
    if (!key) return [];

    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://codynex.local',
          'X-Title': 'CodyNex OS',
        },
      });

      if (!res.ok) return [];
      const body = (await res.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          description?: string;
          context_length?: number;
          pricing?: {
            prompt?: string | number;
            completion?: string | number;
            request?: string | number;
          };
        }>;
      };

      const models: AiModelInfo[] = [];
      for (const item of body.data ?? []) {
        if (!item.id) continue;
        const promptPrice = Number(item.pricing?.prompt ?? 0);
        const compPrice = Number(item.pricing?.completion ?? 0);
        const reqPrice = Number(item.pricing?.request ?? 0);

        const isExplicitFree = promptPrice === 0 && compPrice === 0 && reqPrice === 0;
        const hasFreeSuffix = item.id.endsWith(':free') || item.id === 'openrouter/free';
        const isFree = isExplicitFree || hasFreeSuffix;

        if (isFree) {
          models.push({
            id: item.id,
            name: item.name || item.id,
            provider: AiProviderName.OPENROUTER,
            eligibility: ModelEligibilityStatus.FREE_VERIFIED,
            isFree: true,
            pricing: {
              promptUsdPerMillion: promptPrice * 1_000_000,
              completionUsdPerMillion: compPrice * 1_000_000,
              requestUsd: reqPrice,
            },
            contextWindow: item.context_length || 32768,
            supportsTools: true,
            supportsStreaming: true,
            supportsJson: true,
            description: item.description || 'Verified free OpenRouter community model ($0/M tokens).',
            verifiedFreeAt: new Date().toISOString(),
          });
        }
      }

      return models;
    } catch {
      return [];
    }
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = await resolveRuntimeSecret('openrouter_api_key');
    if (!apiKey) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'OPENROUTER_API_KEY is not configured. Add it in Settings or .env.',
      );
    }

    let model = req.model || dotEnvConfig.OPENROUTER_MODEL || DEFAULT_FREE_MODEL;
    // Guarantee that in free mode, an unadorned model defaults to its :free variant if available
    if (!model.endsWith(':free') && model !== 'openrouter/free' && !model.includes('/')) {
      model = `meta-llama/${model}:free`;
    }

    const started = Date.now();
    const useTools = Boolean(req.tools && req.tools.length > 0);
    const useJson = req.responseFormat === 'json' && !useTools;

    const messages =
      req.messages && req.messages.length > 0
        ? [
            ...(req.messages.some((m) => m.role === 'system')
              ? []
              : [{ role: 'system', content: req.systemPrompt }]),
            ...req.messages.map((m: AiChatMessage) => ({
              role: m.role,
              content: m.content,
              ...(m.name ? { name: m.name } : {}),
              ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            })),
          ]
        : [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ];

    const bodyPayload: Record<string, unknown> = {
      model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxOutputTokens ?? 2048,
      messages,
      ...(useJson ? { response_format: { type: 'json_object' } } : {}),
      ...(useTools
        ? {
            tools: req.tools!.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          }
        : {}),
    };

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://codynex.local',
          'X-Title': 'CodyNex OS Free AI Hub',
        },
        body: JSON.stringify(bodyPayload),
        signal: req.signal,
      });
    } catch (err: unknown) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `OpenRouter connection failed: ${err instanceof Error ? err.message : String(err)}`,
        { category: 'UNAVAILABLE' },
      );
    }

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 15000;
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'OpenRouter free-tier rate limit reached. Backing off.',
        { category: 'RATE_LIMIT', retryAfterMs, statusCode: 429 },
      );
    }

    if (res.status === 402) {
      throw new AiProviderError(
        this.name,
        'QUOTA_EXHAUSTED',
        'OpenRouter free credits or requested model requires payment. Operation safely rejected.',
        { category: 'QUOTA', statusCode: 402 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `OpenRouter returned status ${res.status}: ${errText.slice(0, 200)}`,
        { category: 'PROVIDER_ERROR', statusCode: res.status },
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: 'stop' | 'tool_calls' | 'length';
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const choice = json.choices?.[0];
    const content = choice?.message?.content || '';
    const rawTools = choice?.message?.tool_calls;
    let toolCalls: AiToolCall[] | undefined;

    if (Array.isArray(rawTools) && rawTools.length > 0) {
      toolCalls = rawTools.map((t, idx) => {
        let args: Record<string, unknown> = {};
        if (typeof t.function?.arguments === 'string') {
          try {
            args = JSON.parse(t.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
        }
        return {
          id: t.id || `openrouter_call_${Date.now()}_${idx}`,
          name: t.function?.name || 'unknown_tool',
          arguments: args,
        };
      });
    }

    if (req.onToken && content) {
      req.onToken(content);
    }

    return {
      provider: this.name,
      model: json.model || model,
      content,
      toolCalls,
      finishReason: choice?.finish_reason,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      estimatedCostUsd: 0, // 100% verified free tier
      latencyMs,
    };
  }
}
