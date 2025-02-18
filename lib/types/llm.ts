export interface LLMResponse {
  content?: string;
  error?: string;
}

export interface LLMDBConfig {
  providers: {
    [key: string]: {
      getApiKey: () => Promise<string | null>;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
  defaultProvider: string;
}

export interface LLMModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
} 