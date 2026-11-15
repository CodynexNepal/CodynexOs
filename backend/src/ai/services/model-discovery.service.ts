import { AiProviderName } from '../../constant/enum.constant';
import { AiModelInfo } from '../interfaces/ai-model.interface';
import { ProviderManagerService } from './provider-manager.service';
import { VERIFIED_FREE_MODELS } from '../config/free-models.config';

export class ModelDiscoveryService {
  constructor(private readonly providerManager: ProviderManagerService) {}

  /**
   * Discovers free models for a single provider.
   */
  async discoverForProvider(provider: AiProviderName): Promise<AiModelInfo[]> {
    return this.providerManager.getProviderModels(provider);
  }

  /**
   * Returns all verified free models across all registered providers.
   */
  async discoverAllFreeModels(): Promise<AiModelInfo[]> {
    return this.providerManager.getAllFreeModels();
  }

  /**
   * Returns curated free models registry.
   */
  getCuratedRegistry(): Record<AiProviderName, AiModelInfo[]> {
    return VERIFIED_FREE_MODELS;
  }
}
