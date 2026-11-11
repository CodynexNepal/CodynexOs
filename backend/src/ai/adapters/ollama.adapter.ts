import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';

export class OllamaAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.OLLAMA;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(dotEnvConfig.OLLAMA_BASE_URL) && dotEnvConfig.NODE_ENV !== 'production';
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const model = req.model || dotEnvConfig.OLLAMA_MODEL;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          ...(req.responseFormat === 'json' ? { format: 'json' } : {}),
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        }),
      });
    } catch (err) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        `Ollama local server unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', `Ollama HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      provider: this.name,
      model,
      content: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }
}
