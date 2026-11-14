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

const DEFAULT_HF_MODEL = 'meta-llama/Llama-3.2-3B-Instruct';

export class HuggingFaceAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.HUGGINGFACE;
  public readonly isPaid = false; // Operated strictly under Hugging Face free serverless tier

  isConfigured(): boolean {
    return Boolean(
      dotEnvConfig.HUGGINGFACE_API_KEY ||
        process.env.HUGGINGFACE_API_KEY ||
        process.env.HUGGING_FACE_API_KEY,
    );
  }

  async discoverFreeModels(): Promise<AiModelInfo[]> {
    const key =
      (await resolveRuntimeSecret('huggingface_api_key')) ||
      dotEnvConfig.HUGGINGFACE_API_KEY;
    if (!key) return [];

    try {
      const res = await fetch('https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=8', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as Array<{ id?: string; description?: string }>;

      return (body ?? []).filter((m) => Boolean(m.id)).map((m) => ({
        id: m.id!,
        name: m.id!.split('/').pop() || m.id!,
        provider: AiProviderName.HUGGINGFACE,
        eligibility: ModelEligibilityStatus.FREE_VERIFIED,
        isFree: true,
        pricing: { promptUsdPerMillion: 0, completionUsdPerMillion: 0 },
        contextWindow: 16384,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        description: 'Hugging Face serverless free community inference.',
        verifiedFreeAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey =
      (await resolveRuntimeSecret('huggingface_api_key')) ||
      dotEnvConfig.HUGGINGFACE_API_KEY;

    if (!apiKey) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'HUGGINGFACE_API_KEY is not configured. Add it in Settings or .env.',
      );
    }

    const model = req.model || dotEnvConfig.HUGGINGFACE_MODEL || DEFAULT_HF_MODEL;
    const started = Date.now();

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
            })),
          ]
        : [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ];

    // Hugging Face provides an OpenAI-compatible Serverless Router endpoint
    const url = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: req.maxOutputTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
          ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: req.signal,
      });
    } catch (err: unknown) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Hugging Face connection failed: ${err instanceof Error ? err.message : String(err)}`,
        { category: 'UNAVAILABLE' },
      );
    }

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'Hugging Face serverless rate limit reached. Backing off.',
        { category: 'RATE_LIMIT', retryAfterMs: 20000, statusCode: 429 },
      );
    }

    if (res.status === 503) {
      // Model loading / cold start on Hugging Face free tier
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        'Hugging Face free model is currently loading or warming up. Trying next free provider.',
        { category: 'UNAVAILABLE', retryAfterMs: 10000, statusCode: 503 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Hugging Face returned status ${res.status}: ${errText.slice(0, 200)}`,
        { category: 'PROVIDER_ERROR', statusCode: res.status },
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
        finish_reason?: 'stop' | 'tool_calls' | 'length';
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = json.choices?.[0];
    const content = choice?.message?.content || '';

    let toolCalls: AiToolCall[] | undefined;
    const rawTools = choice?.message?.tool_calls;
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
          id: t.id || `hf_call_${Date.now()}_${idx}`,
          name: t.function?.name || 'tool',
          arguments: args,
        };
      });
    }

    if (req.onToken && content) {
      req.onToken(content);
    }

    return {
      provider: this.name,
      model,
      content,
      toolCalls,
      finishReason: choice?.finish_reason,
      inputTokens: json.usage?.prompt_tokens ?? Math.ceil(req.userPrompt.length / 4),
      outputTokens: json.usage?.completion_tokens ?? Math.ceil(content.length / 4),
      estimatedCostUsd: 0, // $0 Free Tier
      latencyMs,
    };
  }
}
