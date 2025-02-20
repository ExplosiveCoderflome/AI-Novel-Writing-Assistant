/*
 * @LastEditors: biz
 */
import { getApiKey } from '../../lib/api-key';
import { LLMProviderConfig } from '../types/llm';

export interface LLMConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  deepseekApiKey?: string;
  cohereApiKey?: string;
  volcApiKey?: string;
  siliconflowApiKey?: string;
}

export interface LLMDBConfig {
  defaultProvider: string;
  [provider: string]: LLMProviderConfig | string | undefined;
}

export const llmConfig: LLMDBConfig = {
  defaultProvider: 'deepseek',
  deepseek: {
    getApiKey: async () => process.env.DEEPSEEK_API_KEY || null,
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2000,
  },
  siliconflow: {
    getApiKey: async () => process.env.SILICONFLOW_API_KEY || null,
    model: 'silicon-copilot-v1',
    temperature: 0.7,
    maxTokens: 2000,
  },
}; 