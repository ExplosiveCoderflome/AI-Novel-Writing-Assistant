/*
 * @LastEditors: biz
 */
export interface LLMResponse {
  content?: string;
  error?: string;
}

export interface StreamChunk {
  type: 'content' | 'error';
  content: string;
  reasoning_content?: string;
}

export interface GenerateParams {
  userPrompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface SpeedTestResult {
  success: boolean;
  data: {
    duration: number;
    response: string;
    model: string;
    error?: string;
  };
}

export interface ConnectionTestResult {
  success: boolean;
  latency: number;
  error?: string;
  availableModels?: LLMModel[];
  modelCount?: number;
  apiEndpoint?: string;
  generationTest?: {
    success: boolean;
    content?: string;
    generationTime: number;
    tokensGenerated?: number;
    tokensPerSecond?: number;
    error?: string;
  };
}

export interface LLMProviderConfig {
  getApiKey: () => Promise<string | null>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMDBConfig {
  [key: string]: LLMProviderConfig | string;
  defaultProvider: string;
} 