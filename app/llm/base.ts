import { LLMResponse } from '../types/llm';

export abstract class BaseLLM {
  abstract generateRecommendation(params: { prompt: string }): Promise<LLMResponse>;
  abstract testConnection(): Promise<boolean>;
} 