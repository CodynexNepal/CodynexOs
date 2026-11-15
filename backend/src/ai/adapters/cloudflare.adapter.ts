import { dotEnvConfig } from '../../configs/envConfig';
import { AiProviderName, ModelEligibilityStatus } from '../../constant/enum.constant';
import { resolveRuntimeSecret } from '../../services/runtime-secrets.service';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
  AiProviderError,
} from '../ai-provider.interface';
import { AiModelInfo } from '../interfaces/ai-model.interface';

const DEFAULT_CF_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export class CloudflareAdapter implements AiProviderAdapter {
  public readonly name = AiProviderName.CLOUDFLARE;
  public readonly isPaid = false; // Operated under Cloudflare Workers AI free allowance (10,000 neurons/day)
  private cachedAccountId: string | null = null;

  isConfigured(): boolean {
    return Boolean(
      dotEnvConfig.CLOUDFLARE_API_TOKEN ||
        process.env.CLOUDFLARE_API_TOKEN ||
        process.env.CLOUDFLARE_API_KEY ||
        process.env.CLOUDFARE_API_KEY,
    );
  }

  private async resolveAccountId(token: string): Promise<string> {
    const explicitId =
      (await resolveRuntimeSecret('cloudflare_account_id')) ||
      dotEnvConfig.CLOUDFLARE_ACCOUNT_ID;
    if (explicitId && explicitId.trim().length > 0) {
      return explicitId.trim();
    }
    if (this.cachedAccountId) {
      return this.cachedAccountId;
    }

    try {
      const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const body = (await res.json()) as {
          result?: Array<{ id?: string }>;
          success?: boolean;
        };
        const accountId = body.result?.[0]?.id;
        if (body.success && accountId) {
          this.cachedAccountId = accountId;
          return this.cachedAccountId;
        }
      }
    } catch {
      // Account resolution fallback
    }
    return '';
  }

  async discoverFreeModels(): Promise<AiModelInfo[]> {
    const token =
      (await resolveRuntimeSecret('cloudflare_api_token')) ||
      dotEnvConfig.CLOUDFLARE_API_TOKEN;

    if (!token) return [];
    const accountId = await this.resolveAccountId(token);
    if (!accountId) return [];

    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?task=Text%20Generation`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) return [];
      const body = (await res.json()) as {
        result?: Array<{ id?: string; name?: string; description?: string }>;
        success?: boolean;
      };

      if (!body.success || !Array.isArray(body.result)) return [];

      return body.result.slice(0, 10).map((m) => ({
        id: m.id || m.name || '',
        name: m.name || m.id || '',
        provider: AiProviderName.CLOUDFLARE,
        eligibility: ModelEligibilityStatus.FREE_VERIFIED,
        isFree: true,
        pricing: { promptUsdPerMillion: 0, completionUsdPerMillion: 0 },
        contextWindow: 8192,
        supportsTools: false,
        supportsStreaming: true,
        supportsJson: true,
        description: m.description || 'Cloudflare Workers AI edge model (10,000 daily free neurons).',
        verifiedFreeAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const token =
      (await resolveRuntimeSecret('cloudflare_api_token')) ||
      dotEnvConfig.CLOUDFLARE_API_TOKEN;

    if (!token) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'Cloudflare Workers AI requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. Configure in Settings or .env.',
      );
    }

    const accountId = await this.resolveAccountId(token);

    if (!accountId) {
      throw new AiProviderError(
        this.name,
        'NOT_CONFIGURED',
        'Cloudflare Workers AI requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. Configure in Settings or .env.',
      );
    }

    const model = req.model || dotEnvConfig.CLOUDFLARE_MODEL || DEFAULT_CF_MODEL;
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model.startsWith('@') ? model : `@cf/${model}`}`;

    const started = Date.now();
    const messages =
      req.messages && req.messages.length > 0
        ? [
            ...(req.messages.some((m) => m.role === 'system')
              ? []
              : [{ role: 'system', content: req.systemPrompt }]),
            ...req.messages.map((m) => ({ role: m.role, content: m.content })),
          ]
        : [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ];

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          max_tokens: req.maxOutputTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
        }),
        signal: req.signal,
      });
    } catch (err: unknown) {
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Cloudflare Workers AI connection failed: ${err instanceof Error ? err.message : String(err)}`,
        { category: 'UNAVAILABLE' },
      );
    }

    const latencyMs = Date.now() - started;

    if (res.status === 429) {
      throw new AiProviderError(
        this.name,
        'RATE_LIMITED',
        'Cloudflare Workers AI daily free allowance or rate limit reached (10,000 neurons cap).',
        { category: 'RATE_LIMIT', retryAfterMs: 30000, statusCode: 429 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Cloudflare Workers AI returned status ${res.status}: ${errText.slice(0, 200)}`,
        { category: 'PROVIDER_ERROR', statusCode: res.status },
      );
    }

    const json = (await res.json()) as {
      result?: { response?: string };
      success?: boolean;
      errors?: Array<{ message?: string }>;
    };

    if (!json.success || !json.result) {
      const errorMsg = json.errors?.[0]?.message || 'Unknown Workers AI execution error';
      throw new AiProviderError(
        this.name,
        'PROVIDER_ERROR',
        `Cloudflare Workers AI execution failed: ${errorMsg}`,
      );
    }

    const content = json.result.response || '';
    if (req.onToken && content) {
      req.onToken(content);
    }

    // Estimate tokens conservatively based on character count (~4 chars per token)
    const approxInputTokens = Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4);
    const approxOutputTokens = Math.ceil(content.length / 4);

    return {
      provider: this.name,
      model,
      content,
      finishReason: 'stop',
      inputTokens: approxInputTokens,
      outputTokens: approxOutputTokens,
      estimatedCostUsd: 0, // $0 Free Tier
      latencyMs,
    };
  }
}
