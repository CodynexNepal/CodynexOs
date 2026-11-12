import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';

export class OpenAiAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.OPENAI;
  public readonly isPaid = true;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.OPENAI_API_KEY);
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = await resolveRuntimeSecret('openai_api_key');
    if (!apiKey) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'OPENAI_API_KEY is not configured. Add it in Settings or .env.',
      );
    }

    const model = req.model || dotEnvConfig.OPENAI_MODEL;
    const started = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens ?? 2048,
        ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    const latencyMs = Date.now() - started;
    if (res.status === 429) {
      throw new AiProviderError(this.name, 'RATE_LIMITED', 'OpenAI rate/quota limit reached.');
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        data.error?.message || `OpenAI HTTP ${res.status}`,
      );
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const estimatedCostUsd = Number(
      ((inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000).toFixed(6),
    );

    return {
      provider: this.name,
      model,
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      latencyMs,
    };
  }
}
