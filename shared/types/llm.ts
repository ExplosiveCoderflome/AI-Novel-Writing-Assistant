export type LLMProvider = "deepseek" | "siliconflow" | "openai" | "anthropic" | "grok";

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  name: string;
  provider: LLMProvider;
  baseURL: string;
  defaultModel: string;
  models: string[];
  envKey: string;
}
