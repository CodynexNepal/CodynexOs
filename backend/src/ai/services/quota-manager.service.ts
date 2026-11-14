import { AiProviderName } from '../../constant/enum.constant';
import { AppDataSource } from '../../database/database-source';
import { AiUsageLogEntity } from '../../entities/ai-usage-log.entity';
import { ProviderQuotaInfo } from '../interfaces/ai-model.interface';

export class QuotaManagerService {
  /**
   * Retrieves aggregated usage and quota status for all providers.
   * If a provider does not provide programmatically queryable quotas,
   * it accurately reports "Quota information unavailable".
   */
  public async getQuotaStatus(): Promise<ProviderQuotaInfo[]> {
    if (!AppDataSource.isInitialized) {
      return this.getFallbackQuotaInfo();
    }

    const qb = AppDataSource.getRepository(AiUsageLogEntity)
      .createQueryBuilder('u')
      .select('u.provider', 'provider')
      .addSelect('COUNT(*)', 'requestCount')
      .addSelect('COALESCE(SUM(u.total_tokens), 0)', 'totalTokens')
      .where("u.created_at >= date_trunc('day', NOW())")
      .groupBy('u.provider');

    const rows = await qb.getRawMany<{
      provider: string;
      requestCount: string;
      totalTokens: string;
    }>();

    const usageByProvider = new Map<string, { requests: number; tokens: number }>();
    for (const r of rows) {
      usageByProvider.set(r.provider.toLowerCase(), {
        requests: parseInt(r.requestCount, 10) || 0,
        tokens: parseInt(r.totalTokens, 10) || 0,
      });
    }

    const allProviders: AiProviderName[] = [
      AiProviderName.OLLAMA,
      AiProviderName.GEMINI,
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.CLOUDFLARE,
      AiProviderName.HUGGINGFACE,
      AiProviderName.OPENAI,
    ];

    return allProviders.map((p) => {
      const usage = usageByProvider.get(p) || { requests: 0, tokens: 0 };

      if (p === AiProviderName.OLLAMA) {
        return {
          provider: p,
          dailyRequestsUsed: usage.requests,
          dailyTokensUsed: usage.tokens,
          dailyLimitTokens: null,
          dailyLimitRequests: null,
          quotaKnown: true,
          quotaStatus: 'OK',
          detail: 'Local on-device hardware inference. Zero external API quota limits.',
        };
      }

      if (p === AiProviderName.CLOUDFLARE) {
        const dailyLimitNeurons = 10000;
        // Approximation: ~1 neuron per 10 tokens on standard 8B models
        const estimatedNeuronsUsed = Math.ceil(usage.tokens / 10);
        const isExhausted = estimatedNeuronsUsed >= dailyLimitNeurons;
        return {
          provider: p,
          dailyRequestsUsed: usage.requests,
          dailyTokensUsed: usage.tokens,
          dailyLimitTokens: 100000, // 10k neurons equivalent
          dailyLimitRequests: null,
          quotaKnown: true,
          quotaStatus: isExhausted ? 'EXHAUSTED' : 'OK',
          detail: `Cloudflare Workers AI free allowance: 10,000 Neurons/day (~${estimatedNeuronsUsed}/${dailyLimitNeurons} neurons consumed today).`,
        };
      }

      // Gemini, Groq, OpenRouter, Hugging Face, OpenAI
      // Note: Provider APIs do not expose real-time remaining quota headers in a unified standard.
      // We strictly display "Quota information unavailable" to prevent misleading users with made-up numbers.
      return {
        provider: p,
        dailyRequestsUsed: usage.requests,
        dailyTokensUsed: usage.tokens,
        dailyLimitTokens: null,
        dailyLimitRequests: null,
        quotaKnown: false,
        quotaStatus: 'UNAVAILABLE',
        detail: 'Quota information unavailable from provider API headers. Local tracking records daily consumption.',
      };
    });
  }

  private getFallbackQuotaInfo(): ProviderQuotaInfo[] {
    const allProviders: AiProviderName[] = [
      AiProviderName.OLLAMA,
      AiProviderName.GEMINI,
      AiProviderName.GROQ,
      AiProviderName.OPENROUTER,
      AiProviderName.CLOUDFLARE,
      AiProviderName.HUGGINGFACE,
      AiProviderName.OPENAI,
    ];

    return allProviders.map((p) => {
      if (p === AiProviderName.OLLAMA) {
        return {
          provider: p,
          dailyRequestsUsed: 0,
          dailyTokensUsed: 0,
          dailyLimitTokens: null,
          dailyLimitRequests: null,
          quotaKnown: true,
          quotaStatus: 'OK',
          detail: 'Local on-device hardware inference. Zero external API quota limits.',
        };
      }

      if (p === AiProviderName.CLOUDFLARE) {
        return {
          provider: p,
          dailyRequestsUsed: 0,
          dailyTokensUsed: 0,
          dailyLimitTokens: 100000,
          dailyLimitRequests: null,
          quotaKnown: true,
          quotaStatus: 'OK',
          detail: 'Cloudflare Workers AI free allowance: 10,000 Neurons/day.',
        };
      }

      return {
        provider: p,
        dailyRequestsUsed: 0,
        dailyTokensUsed: 0,
        dailyLimitTokens: null,
        dailyLimitRequests: null,
        quotaKnown: false,
        quotaStatus: 'UNAVAILABLE',
        detail: 'Quota information unavailable from provider API headers. Local tracking records daily consumption.',
      };
    });
  }
}
