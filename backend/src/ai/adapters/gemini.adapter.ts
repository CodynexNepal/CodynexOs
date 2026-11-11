import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';

const GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

export class GeminiAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.GEMINI;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.GEMINI_API_KEY);
  }

  private async discoverFlashModel(apiKey: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      const match = (body.models ?? []).find(
        (m) =>
          m.name &&
          /flash/i.test(m.name) &&
          !/lite|8b/i.test(m.name) &&
          m.supportedGenerationMethods?.includes('generateContent'),
      );
      const fallback = (body.models ?? []).find(
        (m) => m.name && m.supportedGenerationMethods?.includes('generateContent'),
      );
      const chosen = match?.name || fallback?.name;
      return chosen ? chosen.replace(/^models\//, '') : null;
    } catch {
      return null;
    }
  }

  private async invokeModel(
    apiKey: string,
    model: string,
    req: AiCompletionRequest,
  ): Promise<AiCompletionResponse> {
    const cleanModel = model.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
      model: cleanModel,
      content,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = await resolveRuntimeSecret('gemini_api_key');
    if (!apiKey) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'GEMINI_API_KEY is not configured. Add a free-tier Google AI Studio key in Settings or .env.',
      );
    }

    const candidates = Array.from(
      new Set([req.model || dotEnvConfig.GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean)),
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
            /no longer available|not found|not supported|404/i.test(err.message)
          ) {
            continue;
          }
          throw err;
        }
        throw err;
      }
    }

    const discovered = await this.discoverFlashModel(apiKey);
    if (discovered && !candidates.includes(discovered)) {
      return this.invokeModel(apiKey, discovered, req);
    }

    throw (
      lastErr ||
      new AiProviderError(this.name, 'PROVIDER_ERROR', 'No compatible Gemini model available.')
    );
  }
}
