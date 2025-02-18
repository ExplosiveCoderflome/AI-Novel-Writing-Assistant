export interface LLMProvider {
  name: string;
  apiKey: string;
  baseUrl: string;
}

export interface LLMResponse {
  content: string | undefined;
  error: string | undefined;
}

export interface LLMRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMConfig {
  providers: {
    openai?: LLMProvider;
    anthropic?: LLMProvider;
    cohere?: LLMProvider;
  };
  defaultProvider: string;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
} 