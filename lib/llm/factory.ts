import { BaseLLM } from './base';
import { SiliconFlowLLM } from './siliconflow';
import { DeepseekLLM } from './deepseek';
import { LLMDBConfig, LLMResponse } from '../types/llm';

interface LLMConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

export class LLMFactory {
  private static instance: LLMFactory;
  private config: LLMDBConfig | null = null;

  private constructor() {}

  public static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  public setConfig(config: LLMDBConfig) {
    this.config = config;
  }

  private async getApiKey(provider: string): Promise<string> {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const providerConfig = this.config.providers[provider];
    if (!providerConfig) {
      throw new Error(`未找到${provider}的配置信息`);
    }

    const apiKey = await providerConfig.getApiKey();
    if (!apiKey) {
      throw new Error(`未找到${provider}的API密钥`);
    }

    return apiKey;
  }

  async getLLMInstance(config: LLMConfig): Promise<BaseLLM> {
    const apiKey = config.apiKey || await this.getApiKey(config.provider);
    
    switch (config.provider) {
      case 'siliconflow':
        return new SiliconFlowLLM(apiKey, config.model);
      case 'deepseek':
        return new DeepseekLLM(apiKey, config.model);
      default:
        throw new Error(`不支持的 LLM 提供商: ${config.provider}`);
    }
  }

  async generateRecommendation(params: { prompt: string }, provider?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const selectedProvider = provider || this.config.defaultProvider;
    const apiKey = await this.getApiKey(selectedProvider);
    const llm = await this.getLLMInstance({ provider: selectedProvider, apiKey });
    
    return llm.generateRecommendation({ userPrompt: params.prompt });
  }

  async testConnection(provider: string): Promise<boolean> {
    try {
      const apiKey = await this.getApiKey(provider);
      const llm = await this.getLLMInstance({ provider, apiKey });
      return await llm.testConnection();
    } catch (error) {
      console.error(`测试${provider}连接失败:`, error);
      return false;
    }
  }
} 