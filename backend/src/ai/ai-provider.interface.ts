import { AiProviderName } from '../constant/enum.constant';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AiToolCall[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  messages?: AiChatMessage[];
  tools?: AiToolDefinition[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
  stream?: boolean;
  onToken?: (chunk: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiCompletionResponse {
  provider: AiProviderName;
  model: string;
  content: string;
  toolCalls?: AiToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length';
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export type AiErrorCategory =
  | 'RATE_LIMIT'
  | 'QUOTA'
  | 'AUTH'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'MODEL_NOT_FOUND'
  | 'TOOL_ERROR'
  | 'PROVIDER_ERROR';

export type AiProviderErrorCode =
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_ERROR';

export class AiProviderError extends Error {
  public readonly code: AiProviderErrorCode;
  public readonly provider: AiProviderName;
  public readonly category: AiErrorCategory;
  public readonly retryAfterMs?: number;
  public readonly statusCode?: number;

  constructor(
    provider: AiProviderName,
    code: AiProviderErrorCode,
    message: string,
    options?: {
      category?: AiErrorCategory;
      retryAfterMs?: number;
      statusCode?: number;
    },
  ) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.category =
      options?.category ??
      (code === 'RATE_LIMITED'
        ? 'RATE_LIMIT'
        : code === 'QUOTA_EXHAUSTED'
          ? 'QUOTA'
          : code === 'NOT_CONFIGURED'
            ? 'UNAVAILABLE'
            : 'PROVIDER_ERROR');
    this.retryAfterMs = options?.retryAfterMs;
    this.statusCode = options?.statusCode;
    Object.setPrototypeOf(this, AiProviderError.prototype);
  }
}

export interface AiProviderAdapter {
  readonly name: AiProviderName;
  readonly isPaid: boolean;
  isConfigured(): boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
}
