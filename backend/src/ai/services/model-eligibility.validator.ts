import { AiProviderName, ModelEligibilityStatus } from '../../constant/enum.constant';
import { VERIFIED_FREE_MODELS } from '../config/free-models.config';
import { AiModelInfo } from '../interfaces/ai-model.interface';
import { AiProviderError } from '../ai-provider.interface';

export interface ModelValidationResult {
  eligible: boolean;
  status: ModelEligibilityStatus;
  model: string;
  provider: AiProviderName;
  reason: string;
}

export class ModelEligibilityValidator {
  /**
   * Validates whether a model is eligible for execution under the current FREE_ONLY mode.
   * If freeOnly is true, only FREE_VERIFIED models can execute.
   */
  public static validate(
    provider: AiProviderName,
    modelName: string,
    options: {
      freeOnlyMode: boolean;
      allowPaidProviders?: boolean;
      discoveredModels?: AiModelInfo[];
      isQuotaExhausted?: boolean;
      isUnavailable?: boolean;
    },
  ): ModelValidationResult {
    const { freeOnlyMode, allowPaidProviders = false, discoveredModels = [], isQuotaExhausted = false, isUnavailable = false } = options;

    if (isUnavailable) {
      return {
        eligible: false,
        status: ModelEligibilityStatus.UNAVAILABLE,
        model: modelName,
        provider,
        reason: `Provider ${provider} is currently offline or unreachable.`,
      };
    }

    if (isQuotaExhausted) {
      return {
        eligible: false,
        status: ModelEligibilityStatus.QUOTA_EXHAUSTED,
        model: modelName,
        provider,
        reason: `Daily free quota for provider ${provider} has been fully exhausted.`,
      };
    }

    // Local Ollama models are ALWAYS 100% free offline execution
    if (provider === AiProviderName.OLLAMA) {
      return {
        eligible: true,
        status: ModelEligibilityStatus.FREE_VERIFIED,
        model: modelName,
        provider,
        reason: 'Local Ollama model: 100% free on-device inference with zero cloud cost.',
      };
    }

    // OpenAI is strictly a paid cloud provider with no free API tier
    if (provider === AiProviderName.OPENAI) {
      if (freeOnlyMode || !allowPaidProviders) {
        return {
          eligible: false,
          status: ModelEligibilityStatus.PAID,
          model: modelName,
          provider,
          reason: `OpenAI model '${modelName}' is a PAID model ($0.15 - $10.00/1M tokens). Blocked by strict FREE-ONLY mode.`,
        };
      }
      return {
        eligible: true,
        status: ModelEligibilityStatus.PAID,
        model: modelName,
        provider,
        reason: 'OpenAI model allowed: allowPaidProviders is explicitly enabled.',
      };
    }

    // Check OpenRouter free model naming conventions (:free suffix or openrouter/free)
    if (provider === AiProviderName.OPENROUTER) {
      const isOpenRouterFree = modelName.endsWith(':free') || modelName === 'openrouter/free';
      if (isOpenRouterFree) {
        return {
          eligible: true,
          status: ModelEligibilityStatus.FREE_VERIFIED,
          model: modelName,
          provider,
          reason: `OpenRouter model '${modelName}' is verified as 100% free ($0 prompt & $0 completion).`,
        };
      }

      // Check dynamic discovered models list for verified 0 pricing
      const matched = discoveredModels.find((m) => m.id === modelName);
      if (matched) {
        if (matched.isFree && matched.pricing && matched.pricing.promptUsdPerMillion === 0 && matched.pricing.completionUsdPerMillion === 0) {
          return {
            eligible: true,
            status: ModelEligibilityStatus.FREE_VERIFIED,
            model: modelName,
            provider,
            reason: `Discovered model '${modelName}' pricing verified at $0.00.`,
          };
        }
        if (matched.pricing && (matched.pricing.promptUsdPerMillion > 0 || matched.pricing.completionUsdPerMillion > 0)) {
          if (freeOnlyMode) {
            return {
              eligible: false,
              status: ModelEligibilityStatus.PAID,
              model: modelName,
              provider,
              reason: `OpenRouter model '${modelName}' is a paid model. Blocked by FREE-ONLY mode.`,
            };
          }
        }
      }

      // If pricing cannot be verified, reject under FREE-ONLY mode
      if (freeOnlyMode) {
        return {
          eligible: false,
          status: ModelEligibilityStatus.UNKNOWN,
          model: modelName,
          provider,
          reason: `Model '${modelName}' does not have verified $0 pricing on OpenRouter. Only verified ':free' models are permitted in FREE-ONLY mode.`,
        };
      }
    }

    // Check curated registry of verified free models
    const registry = VERIFIED_FREE_MODELS[provider] || [];
    const inRegistry = registry.find(
      (m) => m.id.toLowerCase() === modelName.toLowerCase() || modelName.toLowerCase().includes(m.id.toLowerCase()),
    );

    if (inRegistry) {
      if (inRegistry.eligibility === ModelEligibilityStatus.FREE_VERIFIED) {
        return {
          eligible: true,
          status: ModelEligibilityStatus.FREE_VERIFIED,
          model: modelName,
          provider,
          reason: `Model '${modelName}' is verified in Codynex free-tier registry.`,
        };
      }
      if (inRegistry.eligibility === ModelEligibilityStatus.PAID && freeOnlyMode) {
        return {
          eligible: false,
          status: ModelEligibilityStatus.PAID,
          model: modelName,
          provider,
          reason: `Model '${modelName}' is registered as PAID. Blocked by FREE-ONLY mode.`,
        };
      }
    }

    // Check dynamically discovered models list
    const dynamicallyDiscovered = discoveredModels.find(
      (m) => m.id.toLowerCase() === modelName.toLowerCase() && m.provider === provider,
    );
    if (dynamicallyDiscovered) {
      if (dynamicallyDiscovered.eligibility === ModelEligibilityStatus.FREE_VERIFIED) {
        return {
          eligible: true,
          status: ModelEligibilityStatus.FREE_VERIFIED,
          model: modelName,
          provider,
          reason: `Discovered model '${modelName}' verified as free.`,
        };
      }
      if (dynamicallyDiscovered.eligibility === ModelEligibilityStatus.PAID && freeOnlyMode) {
        return {
          eligible: false,
          status: ModelEligibilityStatus.PAID,
          model: modelName,
          provider,
          reason: `Discovered model '${modelName}' has non-zero pricing. Blocked by FREE-ONLY mode.`,
        };
      }
    }

    // Default for free-tier cloud providers (Gemini, Groq, Cloudflare, Hugging Face)
    if (
      provider === AiProviderName.GEMINI ||
      provider === AiProviderName.GROQ ||
      provider === AiProviderName.CLOUDFLARE ||
      provider === AiProviderName.HUGGINGFACE
    ) {
      // If free-only mode is active and the model is not in the verified list, mark as UNKNOWN and reject safely
      if (freeOnlyMode && !inRegistry && !dynamicallyDiscovered) {
        return {
          eligible: false,
          status: ModelEligibilityStatus.UNKNOWN,
          model: modelName,
          provider,
          reason: `Model '${modelName}' has UNKNOWN pricing on ${provider} (cannot be verified as $0 free). Safely rejected under strict FREE-ONLY mode.`,
        };
      }

      return {
        eligible: true,
        status: ModelEligibilityStatus.FREE_VERIFIED,
        model: modelName,
        provider,
        reason: `Model '${modelName}' runs under ${provider} free developer allowance.`,
      };
    }

    // Unknown provider or model
    if (freeOnlyMode) {
      return {
        eligible: false,
        status: ModelEligibilityStatus.UNKNOWN,
        model: modelName,
        provider,
        reason: `Model '${modelName}' on provider '${provider}' has UNKNOWN pricing. Rejected by strict FREE-ONLY mode.`,
      };
    }

    return {
      eligible: true,
      status: ModelEligibilityStatus.UNKNOWN,
      model: modelName,
      provider,
      reason: 'Allowed because FREE-ONLY mode is disabled.',
    };
  }

  /**
   * Asserts that a model is eligible to execute. Throws an AiProviderError if rejected.
   */
  public static assertEligible(
    provider: AiProviderName,
    modelName: string,
    options: {
      freeOnlyMode: boolean;
      allowPaidProviders?: boolean;
      discoveredModels?: AiModelInfo[];
      isQuotaExhausted?: boolean;
      isUnavailable?: boolean;
    },
  ): void {
    const result = this.validate(provider, modelName, options);
    if (!result.eligible) {
      throw new AiProviderError(
        provider,
        result.status === ModelEligibilityStatus.QUOTA_EXHAUSTED ? 'QUOTA_EXHAUSTED' : 'PROVIDER_ERROR',
        `[Strict FREE-ONLY Policy] Blocked execution of ${provider} model '${modelName}': ${result.reason}`,
        { category: 'INVALID_REQUEST' },
      );
    }
  }
}
