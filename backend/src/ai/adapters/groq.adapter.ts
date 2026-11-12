import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import {
  AiChatMessage,
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
  AiToolCall,
} from '../ai-provider.interface';

const GROQ_FALLBACK_MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b'];

export class GroqAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.GROQ;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.GROQ_API_KEY);
  }

  private async discoverChatModel(apiKey: string): Promise<string | null> {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: Array<{ id?: string; active?: boolean }>;
      };
      const usable = (body.data ?? []).filter(
        (m) =>
          m.id &&
          m.active !== false &&
          !/whisper|guard|tts|playai|vision|distil|gpt-oss/i.test(m.id),
      );
      const preferred = usable.find((m) => /llama-3\.1|llama-3\.3|qwen|mixtral/i.test(m.id!));
      return preferred?.id || usable[0]?.id || null;
    } catch {
      return null;
    }
  }

  private async invokeModel(
    apiKey: string,
    model: string,
    req: AiCompletionRequest,
  ): Promise<AiCompletionResponse> {
    const started = Date.now();
    const useTools = Boolean(req.tools && req.tools.length > 0);
    const messages =
      req.messages && req.messages.length > 0
        ? [
            ...(req.messages.some((m) => m.role === 'system')
              ? []
              : [{ role: 'system', content: req.systemPrompt }]),
            ...req.messages.map((m: AiChatMessage) => ({
              role: m.role,
              content: m.content,
              ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
              ...(m.toolCalls?.length
                ? {
                    tool_calls: m.toolCalls.map((tc) => ({
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments),
                      },
                    })),
                  }
                : {}),
            })),
          ]
        : [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: req.signal,
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens ?? 2048,
        ...(req.responseFormat === 'json' && !useTools
          ? { response_format: { type: 'json_object' } }
          : {}),
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
              tool_choice: 'auto',
            }
          : {}),
        messages,
      }),
    });

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      const retryAfterRaw = res.headers?.get('retry-after');
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : undefined;
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'Groq free-tier rate limit reached (HTTP 429).',
        { category: 'RATE_LIMIT', retryAfterMs, statusCode: 429 },
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Groq authentication error (HTTP ${res.status}).`,
        { category: 'AUTH', statusCode: res.status },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = data.error?.message || `Groq HTTP ${res.status}`;
      if (/quota|rate limit/i.test(msg)) {
        throw new AiProviderError(this.name, 'QUOTA_EXHAUSTED', msg, {
          category: 'QUOTA',
          statusCode: res.status,
        });
      }
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', msg, {
        category: 'PROVIDER_ERROR',
        statusCode: res.status,
      });
    }

    const rawToolCalls = data.choices?.[0]?.message?.tool_calls;
    const toolCalls: AiToolCall[] | undefined =
      Array.isArray(rawToolCalls) && rawToolCalls.length > 0
        ? rawToolCalls
            .filter((tc) => tc.function?.name)
            .map((tc, idx) => {
              let parsedArgs: Record<string, unknown> = {};
              if (tc.function?.arguments) {
                try {
                  parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                } catch {
                  parsedArgs = {};
                }
              }
              return {
                id: tc.id || `groq_call_${Date.now()}_${idx}`,
                name: tc.function!.name!,
                arguments: parsedArgs,
              };
            })
        : undefined;

    return {
      provider: this.name,
      model,
      content: data.choices?.[0]?.message?.content ?? '',
      toolCalls,
      finishReason: toolCalls?.length ? 'tool_calls' : 'stop',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = await resolveRuntimeSecret('groq_api_key');
    if (!apiKey) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'GROQ_API_KEY is not configured. Add a free-tier Groq key in Settings or .env.',
      );
    }

    const candidates = Array.from(
      new Set([req.model || dotEnvConfig.GROQ_MODEL, ...GROQ_FALLBACK_MODELS].filter(Boolean)),
    );

    let lastErr: AiProviderError | null = null;
    for (const model of candidates) {
      try {
        return await this.invokeModel(apiKey, model, req);
      } catch (err) {
        if (err instanceof AiProviderError) {
          lastErr = err;
          if (
            err.code === 'PROVIDER_ERROR' &&
            /does not exist|not have access|decommissioned|not_found|tool choice|called a tool|tool_use_failed|does not support/i.test(
              err.message,
            )
          ) {
            continue;
          }
          throw err;
        }
        throw err;
      }
    }

    const discovered = await this.discoverChatModel(apiKey);
    if (discovered && !candidates.includes(discovered)) {
      return this.invokeModel(apiKey, discovered, req);
    }

    throw (
      lastErr || new AiProviderError(this.name, 'PROVIDER_ERROR', 'No compatible Groq model found.')
    );
  }
}
