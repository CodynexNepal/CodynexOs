import { AiProviderName } from '../../constant/enum.constant';
import { ModelEligibilityValidator } from './model-eligibility.validator';

export interface FallbackCandidate {
  provider: AiProviderName;
  model?: string;
}

export class FallbackService {
  /**
   * Filters and orders candidates to ensure only eligible free providers are attempted.
   */
  public static filterEligibleCandidates(
    candidates: FallbackCandidate[],
    options: {
      freeOnlyMode: boolean;
      allowPaidProviders?: boolean;
      isCircuitOpen: (provider: AiProviderName) => boolean;
      isCloudQuotaExhausted: boolean;
    },
  ): FallbackCandidate[] {
    const filtered: FallbackCandidate[] = [];

    for (const c of candidates) {
      if (options.isCircuitOpen(c.provider)) continue;
      if (c.provider !== AiProviderName.OLLAMA && options.isCloudQuotaExhausted) continue;

      const validation = ModelEligibilityValidator.validate(c.provider, c.model || 'default', {
        freeOnlyMode: options.freeOnlyMode,
        allowPaidProviders: options.allowPaidProviders,
      });

      if (validation.eligible) {
        filtered.push(c);
      }
    }

    return filtered;
  }
}
