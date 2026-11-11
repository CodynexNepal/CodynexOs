import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';

export class GeminiAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.GEMINI;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.GEMINI_API_KEY);
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.isConfigured()) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'GEMINI_API_KEY is not configured. Add a free-tier Google AI Studio key in Settings or .env.',
      );
    }

    const model = req.model || dotEnvConfig.GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(dotEnvConfig.GEMINI_API_KEY)}`;

    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxOutputTokens ?? 2048,
          ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'Gemini free-tier rate limit or daily quota reached (HTTP 429).',
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string; status?: string };
    };

    if (!res.ok) {
      const msg = data.error?.message || `Gemini HTTP ${res.status}`;
      if (/quota|exhausted|resource_exhausted/i.test(msg)) {
        throw new AiProviderError(this.name, 'QUOTA_EXHAUSTED', msg);
      }
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', msg);
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return {
      provider: this.name,
      model,
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }
}
