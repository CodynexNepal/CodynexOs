import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName } from '../../constant/enum.constant';
import {
  AiChatMessage,
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
  AiToolCall,
} from '../ai-provider.interface';

interface OllamaToolCallRaw {
  function?: {
    name?: string;
    arguments?: Record<string, unknown> | string;
  };
}

interface OllamaChatChunk {
  model?: string;
  done?: boolean;
  done_reason?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
    tool_calls?: OllamaToolCallRaw[];
  };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

function stripThinkingTraces(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function normalizeToolCalls(raw?: OllamaToolCallRaw[]): AiToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const calls: AiToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const fn = raw[i]?.function;
    if (!fn?.name) continue;
    let parsedArgs: Record<string, unknown> = {};
    if (typeof fn.arguments === 'string') {
      try {
        parsedArgs = JSON.parse(fn.arguments) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }
    } else if (fn.arguments && typeof fn.arguments === 'object') {
      parsedArgs = fn.arguments;
    }
    calls.push({
      id: `ollama_call_${Date.now()}_${i}`,
      name: fn.name,
      arguments: parsedArgs,
    });
  }
  return calls.length > 0 ? calls : undefined;
}

function buildOllamaMessages(req: AiCompletionRequest) {
  if (req.messages && req.messages.length > 0) {
    const hasSystem = req.messages.some((m) => m.role === 'system');
    const formatted = req.messages.map((m: AiChatMessage) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((tc) => ({
              function: { name: tc.name, arguments: tc.arguments },
            })),
          }
        : {}),
    }));
    return hasSystem ? formatted : [{ role: 'system', content: req.systemPrompt }, ...formatted];
  }

  return [
    { role: 'system', content: req.systemPrompt },
    { role: 'user', content: req.userPrompt },
  ];
}

export class OllamaAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.OLLAMA;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return (
      dotEnvConfig.OLLAMA_ENABLED &&
      Boolean(dotEnvConfig.OLLAMA_BASE_URL) &&
      dotEnvConfig.NODE_ENV !== 'production'
    );
  }

  private async discoverInstalledModel(signal?: AbortSignal): Promise<string | null> {
    try {
      const res = await fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/tags`, { signal });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        models?: Array<{ name?: string }>;
      };
      const qwen = body.models?.find((m) => m.name && /qwen3/i.test(m.name));
      return qwen?.name ?? body.models?.find((m) => m.name)?.name ?? null;
    } catch {
      return null;
    }
  }

  private async invokeChat(
    model: string,
    req: AiCompletionRequest,
  ): Promise<{ res: Response; latencyMs: number }> {
    const started = Date.now();
    const timeoutMs = req.timeoutMs ?? dotEnvConfig.OLLAMA_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (req.signal) {
      if (req.signal.aborted) controller.abort();
      else req.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const useTools = Boolean(req.tools && req.tools.length > 0);
    const shouldStream = Boolean(req.stream && !useTools);

    try {
      const res = await fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: shouldStream,
          ...(req.responseFormat === 'json' && !useTools ? { format: 'json', think: false } : {}),
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
          options: {
            temperature: req.temperature ?? 0.2,
            ...(req.maxOutputTokens ? { num_predict: req.maxOutputTokens } : {}),
          },
          messages: buildOllamaMessages(req),
        }),
      });
      return { res, latencyMs: Date.now() - started };
    } catch (err) {
      if (timedOut) {
        throw new AiProviderError(
          this.name,
          'PROVIDER_ERROR',
          `Ollama request timed out after ${timeoutMs}ms.`,
          { category: 'TIMEOUT', statusCode: 504 },
        );
      }
      if (req.signal?.aborted) {
        throw new AiProviderError(this.name, 'PROVIDER_ERROR', 'Ollama request was cancelled.', {
          category: 'PROVIDER_ERROR',
        });
      }
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        `Ollama local server unavailable: ${err instanceof Error ? err.message : String(err)}`,
        { category: 'UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timer);
      if (req.signal) {
        req.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async readStreamResponse(
    res: Response,
    model: string,
    startedLatencyMs: number,
    onToken?: (chunk: string) => void,
  ): Promise<AiCompletionResponse> {
    if (!res.body) {
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', 'Ollama stream body was empty.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCalls: AiToolCall[] | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const chunk = JSON.parse(trimmed) as OllamaChatChunk;
        if (chunk.error) {
          throw new AiProviderError(this.name, 'PROVIDER_ERROR', chunk.error);
        }
        const delta = chunk.message?.content ?? '';
        if (delta) {
          content += delta;
          if (onToken && !/<think>/i.test(delta) && !/<\/think>/i.test(delta)) {
            onToken(delta);
          }
        }
        const normalizedCalls = normalizeToolCalls(chunk.message?.tool_calls);
        if (normalizedCalls) {
          toolCalls = normalizedCalls;
        }
        if (chunk.done) {
          inputTokens = chunk.prompt_eval_count ?? inputTokens;
          outputTokens = chunk.eval_count ?? outputTokens;
        }
      }
    }

    return {
      provider: this.name,
      model,
      content: stripThinkingTraces(content),
      toolCalls,
      finishReason: toolCalls?.length ? 'tool_calls' : 'stop',
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
      latencyMs: startedLatencyMs,
    };
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!dotEnvConfig.OLLAMA_ENABLED) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'Ollama provider is disabled (OLLAMA_ENABLED=false).',
        { category: 'UNAVAILABLE' },
      );
    }

    let model = req.model || dotEnvConfig.OLLAMA_MODEL;
    let { res, latencyMs } = await this.invokeChat(model, req);

    if (res.status === 404) {
      const installed = await this.discoverInstalledModel(req.signal);
      if (installed && installed !== model) {
        model = installed;
        ({ res, latencyMs } = await this.invokeChat(model, req));
      }
    }

    if (!res.ok) {
      let detail = `Ollama HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody.error) detail = errBody.error;
      } catch {
        // ignore parse errors
      }
      throw new AiProviderError(this.name, 'PROVIDER_ERROR', detail, {
        category: res.status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_ERROR',
        statusCode: res.status,
      });
    }

    if (req.stream && !req.tools?.length) {
      return this.readStreamResponse(res, model, latencyMs, req.onToken);
    }

    const data = (await res.json()) as OllamaChatChunk;
    const toolCalls = normalizeToolCalls(data.message?.tool_calls);
    const cleanedContent = stripThinkingTraces(data.message?.content ?? '');

    return {
      provider: this.name,
      model,
      content: cleanedContent,
      toolCalls,
      finishReason: toolCalls?.length ? 'tool_calls' : 'stop',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }
}
