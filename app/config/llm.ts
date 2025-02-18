/*
 * @LastEditors: biz
 */
import { getApiKey } from '../../lib/api-key';

export interface LLMConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  deepseekApiKey?: string;
  cohereApiKey?: string;
  volcApiKey?: string;
  siliconflowApiKey?: string;
}

export interface LLMProviderConfig {
  getApiKey: () => Promise<string | null>;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMDBConfig {
  openai: LLMProviderConfig;
  anthropic: LLMProviderConfig;
  deepseek: LLMProviderConfig;
  cohere: LLMProviderConfig;
  volc: LLMProviderConfig;
  siliconflow: LLMProviderConfig;
  defaultProvider: string;
}

export const llmConfig: LLMConfig = {
  openaiApiKey: undefined,
  anthropicApiKey: undefined,
  deepseekApiKey: undefined,
  cohereApiKey: undefined,
  volcApiKey: undefined,
  siliconflowApiKey: undefined,
};

export const llmConfigFromDB: LLMDBConfig = {
  openai: {
    getApiKey: () => getApiKey('openai'),
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
  },
  anthropic: {
    getApiKey: () => getApiKey('anthropic'),
    model: 'claude-2',
    temperature: 0.7,
    maxTokens: 2000,
  },
  deepseek: {
    getApiKey: () => getApiKey('deepseek'),
    model: 'deepseek-reasoner',
    temperature: 0.7,
    maxTokens: 2000,
  },
  cohere: {
    getApiKey: () => getApiKey('cohere'),
    model: 'command',
    temperature: 0.7,
    maxTokens: 2000,
  },
  volc: {
    getApiKey: () => getApiKey('volc'),
    model: 'volc-1',
    temperature: 0.7,
    maxTokens: 2000,
  },
  siliconflow: {
    getApiKey: () => getApiKey('siliconflow'),
    model: 'sf-plus-001',
    temperature: 0.7,
    maxTokens: 1000,
  },
  defaultProvider: 'volc',
}; 