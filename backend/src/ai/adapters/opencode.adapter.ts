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

const DEFAULT_MODEL = 'deepseek-v4.1-flash-free';

export class OpenCodeAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.OPENCODE;
  public readonly isPaid = false;

  isConfigured(): boolean {
    return Boolean(
      dotEnvConfig.OPENCODE_API_KEY ||
        process.env.OPENCODE_API_KEY ||
        process.env.OPEN_CODE_API_KEY,
    );
  }

  async getBaseUrl(): Promise<string> {
    let customUrl = await resolveRuntimeSecret('opencode_base_url');
    if (customUrl && /api\.opencode\.ai/i.test(customUrl)) {
      customUrl = customUrl
        .replace(/api\.opencode\.ai\/v1/i, 'opencode.ai/zen/v1')
        .replace(/api\.opencode\.ai/i, 'opencode.ai/zen/v1');
    }
    const envUrl = (dotEnvConfig.OPENCODE_BASE_URL || '').replace(
      /api\.opencode\.ai\/v1/i,
      'opencode.ai/zen/v1',
    );
    return (customUrl || envUrl || 'https://opencode.ai/zen/v1').replace(/\/+$/, '');
  }

  async discoverFreeModels(apiKey?: string): Promise<AiModelInfo[]> {
    const key = apiKey || (await resolveRuntimeSecret('opencode_api_key'));
    const baseUrl = await this.getBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
      });

      if (!res.ok) return [];
      const body = (await res.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          description?: string;
          context_length?: number;
          pricing?: { prompt?: number; completion?: number };
        }>;
      };

      const rawList = body.data || [];
      // Prioritize verified $0 free models
      const freeModels = rawList.filter(
        (m) =>
          Boolean(m.id) &&
          (m.id!.includes('-free') || m.pricing?.prompt === 0),
      );

      const targetList = freeModels.length > 0 ? freeModels : rawList.slice(0, 8);

      return targetList.map((m) => ({
        id: m.id!,
        name: m.name || m.id!,
        provider: AiProviderName.OPENCODE,
        eligibility: ModelEligibilityStatus.FREE_VERIFIED,
        isFree: true,
        pricing: { promptUsdPerMillion: 0, completionUsdPerMillion: 0 },
        contextWindow: m.context_length || 65536,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        description:
          m.description || `OpenCode $0 Free model (${m.name || m.id})`,
        verifiedFreeAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = await resolveRuntimeSecret('opencode_api_key');
    const baseUrl = await this.getBaseUrl();
    const model = req.model || dotEnvConfig.OPENCODE_MODEL || DEFAULT_MODEL;

    const messages: Array<{ role: string; content: string; name?: string; tool_call_id?: string }> = [];

    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }

    if (req.messages && req.messages.length > 0) {
      for (const m of req.messages) {
        messages.push({
          role: m.role,
          content: m.content,
          ...(m.name ? { name: m.name } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        });
      }
    } else {
      messages.push({ role: 'user', content: req.userPrompt });
    }

    const payload: Record<string, unknown> = {
      model,
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxOutputTokens ?? 4096,
    };

    if (req.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const started = Date.now();
    let res: Response;

    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: req.signal,
      });
    } catch (err: any) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `OpenCode connection failed: ${err?.message || err}`,
      );
    }

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      throw new AiProviderError(this.name, 'RATE_LIMITED', 'OpenCode rate limit exceeded.');
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `OpenCode returned HTTP ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    const body = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };

    const choice = body.choices?.[0];
    const rawContent = choice?.message?.content || '';

    let toolCalls: AiToolCall[] | undefined;
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        };
      });
    }

    const inputTokens = body.usage?.prompt_tokens ?? Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4);
    const outputTokens = body.usage?.completion_tokens ?? Math.ceil(rawContent.length / 4);

    return {
      provider: this.name,
      model,
      content: rawContent,
      toolCalls,
      finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
      latencyMs,
    };
  }
}
