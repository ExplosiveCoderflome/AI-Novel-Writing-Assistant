import { LLMProviderConfig } from '../../types/llm';

export type LLMProviderId =
  | 'deepseek'
  | 'siliconflow'
  | 'openai'
  | 'anthropic'
  | 'cohere'
  | 'volc';

export type LLMErrorCode =
  | 'LLM_CONFIG_MISSING'
  | 'LLM_PROVIDER_UNSUPPORTED'
  | 'LLM_PROVIDER_NOT_CONFIGURED'
  | 'LLM_API_KEY_MISSING'
  | 'LLM_API_KEY_INVALID'
  | 'LLM_INTERNAL_ERROR';

export interface UnifiedLLMResponse {
  content?: string;
  error?: string;
  errorCode?: LLMErrorCode;
  provider?: string;
}

export interface UnifiedStreamChunk {
  type: 'content' | 'error';
  content: string;
  reasoning_content?: string;
  errorCode?: LLMErrorCode;
  provider?: string;
}

export interface NormalizedProviderConfig extends LLMProviderConfig {
  provider: LLMProviderId;
}

export interface NormalizedLLMConfig {
  defaultProvider: LLMProviderId;
  providers: Partial<Record<LLMProviderId, NormalizedProviderConfig>>;
}

export interface LLMInstanceConfig {
  provider: string;
  apiKey?: string;
  model?: string;
}
