import { AiProviderName } from '../constant/enum.constant';

export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
}

export interface AiCompletionResponse {
  provider: AiProviderName;
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export class AiProviderError extends Error {
  public readonly code: 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'NOT_CONFIGURED' | 'PROVIDER_ERROR';
  public readonly provider: AiProviderName;

  constructor(
    provider: AiProviderName,
    code: 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'NOT_CONFIGURED' | 'PROVIDER_ERROR',
    message: string,
  ) {
    super(message);
    this.provider = provider;
    this.code = code;
    Object.setPrototypeOf(this, AiProviderError.prototype);
  }
}

export interface AiProviderAdapter {
  readonly name: AiProviderName;
  readonly isPaid: boolean;
  isConfigured(): boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
}
