import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';

export class GroqAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.GROQ;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.GROQ_API_KEY);
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.isConfigured()) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'GROQ_API_KEY is not configured. Add a free-tier Groq key in Settings or .env.',
      );
    }

    const model = req.model || dotEnvConfig.GROQ_MODEL;
    const started = Date.now();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dotEnvConfig.GROQ_API_KEY}`,
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
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'Groq free-tier rate limit reached (HTTP 429).',
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = data.error?.message || `Groq HTTP ${res.status}`;
      if (/quota|limit/i.test(msg)) {
        throw new AiProviderError(this.name, 'QUOTA_EXHAUSTED', msg);
      }
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', msg);
    }

    return {
      provider: this.name,
      model,
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }
}
