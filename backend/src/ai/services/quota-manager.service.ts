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
      AiProviderName.OPENCODE,
      AiProviderName.OPENAI,
    ];

    return allProviders.map((p) => {
      const usage = usageByProvider.get(p) || { requests: 0, tokens: 0 };

      if (p === AiProviderName.OLLAMA) {
        return {
          provider: p,
          displayName: 'Ollama (Local)',
          isLocal: true,
          isPaid: false,
          freeTierAllowance: 'Unlimited (On-Device)',
          requestsUsedToday: usage.requests,
          dailyRequestsUsed: usage.requests,
          tokensUsedToday: usage.tokens,
          dailyTokensUsed: usage.tokens,
          dailyLimitTokens: null,
          dailyLimitRequests: null,
          remainingAllowance: 'Unlimited',
          quotaKnown: true,
          quotaStatus: 'OK' as const,
          detail: 'Local on-device hardware inference. Zero external API quota limits.',
        };
      }

      if (p === AiProviderName.CLOUDFLARE) {
        const dailyLimitNeurons = 10000;
        const estimatedNeuronsUsed = Math.ceil(usage.tokens / 10);
        const isExhausted = estimatedNeuronsUsed >= dailyLimitNeurons;
        const remainingNeurons = Math.max(0, dailyLimitNeurons - estimatedNeuronsUsed);
        return {
          provider: p,
          displayName: 'Cloudflare Workers AI',
          isLocal: false,
          isPaid: false,
          freeTierAllowance: '10,000 Neurons / Day',
          requestsUsedToday: usage.requests,
          dailyRequestsUsed: usage.requests,
          tokensUsedToday: usage.tokens,
          dailyTokensUsed: usage.tokens,
          dailyLimitTokens: 100000,
          dailyLimitRequests: null,
          remainingAllowance: isExhausted
            ? '0 Neurons (Exhausted)'
            : `~${remainingNeurons} Neurons remaining`,
          quotaKnown: true,
          quotaStatus: (isExhausted ? 'EXHAUSTED' : 'OK') as 'OK' | 'EXHAUSTED',
          detail: `Cloudflare Workers AI free allowance: 10,000 Neurons/day (~${estimatedNeuronsUsed}/${dailyLimitNeurons} neurons consumed today).`,
        };
      }

      const displayNames: Record<string, string> = {
        gemini: 'Google Gemini',
        groq: 'Groq LPUs',
        openrouter: 'OpenRouter (Free Hub)',
        huggingface: 'Hugging Face Serverless',
        opencode: 'OpenCode API (Open Source)',
        openai: 'OpenAI (Paid Provider)',
      };

      const allowances: Record<string, string> = {
        gemini: '15 RPM / 1M TPM / 1,500 RPD',
        groq: '30 RPM / 6K TPM',
        openrouter: '20 RPM (18+ Free Models)',
        huggingface: 'Community Serverless Rate',
        opencode: 'OpenCode Standard / Custom Endpoint Rate',
        openai: 'Commercial Paid API Only',
      };

      const isPaid = p === AiProviderName.OPENAI;

      return {
        provider: p,
        displayName: displayNames[p] || p,
        isLocal: false,
        isPaid,
        freeTierAllowance: allowances[p] || 'Free Tier Rate',
        requestsUsedToday: usage.requests,
        dailyRequestsUsed: usage.requests,
        tokensUsedToday: usage.tokens,
        dailyTokensUsed: usage.tokens,
        dailyLimitTokens: null,
        dailyLimitRequests: null,
        remainingAllowance: isPaid ? 'Pay-as-you-go' : undefined,
        quotaUnavailableReason: isPaid
          ? undefined
          : 'Quota information unavailable from provider API headers',
        quotaKnown: false,
        quotaStatus: 'UNAVAILABLE' as const,
        detail:
          'Quota information unavailable from provider API headers. Local tracking records daily consumption.',
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
      AiProviderName.OPENCODE,
      AiProviderName.OPENAI,
    ];

    return allProviders.map((p) => {
      if (p === AiProviderName.OLLAMA) {
        return {
          provider: p,
          displayName: 'Ollama (Local)',
          isLocal: true,
          isPaid: false,
          freeTierAllowance: 'Unlimited (On-Device)',
          requestsUsedToday: 0,
          dailyRequestsUsed: 0,
          tokensUsedToday: 0,
          dailyTokensUsed: 0,
          dailyLimitTokens: null,
          dailyLimitRequests: null,
          remainingAllowance: 'Unlimited',
          quotaKnown: true,
          quotaStatus: 'OK' as const,
          detail: 'Local on-device hardware inference. Zero external API quota limits.',
        };
      }

      if (p === AiProviderName.CLOUDFLARE) {
        return {
          provider: p,
          displayName: 'Cloudflare Workers AI',
          isLocal: false,
          isPaid: false,
          freeTierAllowance: '10,000 Neurons / Day',
          requestsUsedToday: 0,
          dailyRequestsUsed: 0,
          tokensUsedToday: 0,
          dailyTokensUsed: 0,
          dailyLimitTokens: 100000,
          dailyLimitRequests: null,
          remainingAllowance: '~10,000 Neurons remaining',
          quotaKnown: true,
          quotaStatus: 'OK' as const,
          detail: 'Cloudflare Workers AI free allowance: 10,000 Neurons/day.',
        };
      }

      const displayNames: Record<string, string> = {
        gemini: 'Google Gemini',
        groq: 'Groq LPUs',
        openrouter: 'OpenRouter (Free Hub)',
        huggingface: 'Hugging Face Serverless',
        opencode: 'OpenCode API (Open Source)',
        openai: 'OpenAI (Paid Provider)',
      };

      const allowances: Record<string, string> = {
        gemini: '15 RPM / 1M TPM / 1,500 RPD',
        groq: '30 RPM / 6K TPM',
        openrouter: '20 RPM (18+ Free Models)',
        huggingface: 'Community Serverless Rate',
        opencode: 'OpenCode Standard / Custom Endpoint Rate',
        openai: 'Commercial Paid API Only',
      };

      const isPaid = p === AiProviderName.OPENAI;

      return {
        provider: p,
        displayName: displayNames[p] || p,
        isLocal: false,
        isPaid,
        freeTierAllowance: allowances[p] || 'Free Tier Rate',
        requestsUsedToday: 0,
        dailyRequestsUsed: 0,
        tokensUsedToday: 0,
        dailyTokensUsed: 0,
        dailyLimitTokens: null,
        dailyLimitRequests: null,
        remainingAllowance: isPaid ? 'Pay-as-you-go' : undefined,
        quotaUnavailableReason: isPaid
          ? undefined
          : 'Quota information unavailable from provider API headers',
        quotaKnown: false,
        quotaStatus: 'UNAVAILABLE' as const,
        detail:
          'Quota information unavailable from provider API headers. Local tracking records daily consumption.',
      };
    });
  }
}
