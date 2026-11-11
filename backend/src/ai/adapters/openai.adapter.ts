import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
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
    if (!dotEnvConfig.ALLOW_PAID_PROVIDERS) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'Paid AI providers are disabled by policy (ALLOW_PAID_PROVIDERS=false).',
      );
    }
    if (!this.isConfigured()) {
      throw new AiProviderError(this.name, 'NOT_CONFIGURED', 'OPENAI_API_KEY is not configured.');
    }

    const model = req.model || dotEnvConfig.OPENAI_MODEL;
    const started = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dotEnvConfig.OPENAI_API_KEY}`,
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
