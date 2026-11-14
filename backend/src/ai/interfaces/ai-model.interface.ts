import { AiProviderName, ModelEligibilityStatus } from '../../constant/enum.constant';

export interface ModelPricing {
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
  requestUsd?: number;
}

export interface AiModelInfo {
  id: string;
  name: string;
  provider: AiProviderName;
  eligibility: ModelEligibilityStatus;
  isFree: boolean;
  pricing: ModelPricing | null;
  contextWindow?: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;
  description?: string;
  verifiedFreeAt?: string;
}

export interface AiProviderConfig {
  provider: AiProviderName;
  displayName: string;
  isPaid: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  isLocal: boolean;
  priority: number;
  defaultModel: string;
  freeTierNotes: string;
  dailyQuotaLimit?: number;
  quotaInfoUnavailable?: boolean;
  endpoint?: string;
}

export interface AiGlobalSettings {
  freeOnlyMode: boolean;
  allowPaidProviders: boolean;
  autoFreeFallback: boolean;
  maxRetries: number;
  requestTimeoutMs: number;
  maxConcurrentRequests: number;
  dailyTokenLimit: number;
  providerPriority: AiProviderName[];
}

export interface AgentModelPreference {
  agentRole: string; // e.g. 'coding', 'research', 'seo', 'document', 'testing', 'backup'
  agentName: string;
  preferredProvider: AiProviderName;
  preferredModel: string;
  fallbackProvider?: AiProviderName;
  fallbackModel?: string;
  notes?: string;
}

export interface ProviderQuotaInfo {
  provider: AiProviderName;
  dailyRequestsUsed: number;
  dailyTokensUsed: number;
  dailyLimitTokens: number | null;
  dailyLimitRequests: number | null;
  quotaKnown: boolean;
  quotaStatus: 'OK' | 'WARNING' | 'EXHAUSTED' | 'UNAVAILABLE';
  resetTime?: string;
  detail: string;
}
