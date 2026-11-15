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
  id?: string;
  provider: AiProviderName;
  name?: string;
  displayName: string;
  isPaid: boolean;
  isConfigured: boolean;
  status?: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED' | 'RATE_LIMITED';
  isFreeEligible?: boolean;
  isEnabled: boolean;
  isLocal: boolean;
  priority: number;
  modelCount?: number;
  activeModel?: string;
  defaultModel: string;
  baseUrl?: string;
  endpoint?: string;
  description?: string;
  freeTierNotes: string;
  quotaDescription?: string;
  dailyQuotaLimit?: number;
  quotaInfoUnavailable?: boolean;
}

export interface ProviderQuotaInfo {
  provider: AiProviderName;
  displayName?: string;
  isLocal?: boolean;
  isPaid?: boolean;
  freeTierAllowance?: string;
  requestsUsedToday?: number;
  dailyRequestsUsed: number;
  tokensUsedToday?: number;
  dailyTokensUsed: number;
  dailyLimitTokens: number | null;
  dailyLimitRequests: number | null;
  remainingAllowance?: string;
  quotaUnavailableReason?: string;
  quotaKnown: boolean;
  quotaStatus: 'OK' | 'WARNING' | 'EXHAUSTED' | 'UNKNOWN' | 'UNAVAILABLE';
  resetTime?: string;
  detail: string;
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


