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

// 提供从数据库加载配置的默认配置对象
export const llmConfigFromDB: LLMDBConfig = {
  defaultProvider: 'deepseek',
  deepseek: {
    getApiKey: async () => null,
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2000,
  },
  openai: {
    getApiKey: async () => null,
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
  },
  anthropic: {
    getApiKey: async () => null,
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 2000,
  },
  cohere: {
    getApiKey: async () => null,
    model: 'command',
    temperature: 0.7,
    maxTokens: 2000,
  },
  volc: {
    getApiKey: async () => null,
    model: 'bali-basic',
    temperature: 0.7,
    maxTokens: 2000,
  },
  siliconflow: {
    getApiKey: async () => null,
    model: 'silicon-copilot-v1',
    temperature: 0.7,
    maxTokens: 2000,
  },
}; 