import { LLMResponse, StreamChunk, GenerateParams, LLMModel } from '../../app/types/llm';

export abstract class BaseLLM {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = '';
  }

  abstract generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  abstract generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown>;
  abstract testConnection(): Promise<boolean>;
  abstract getAvailableModels(): Promise<LLMModel[]>;
} 