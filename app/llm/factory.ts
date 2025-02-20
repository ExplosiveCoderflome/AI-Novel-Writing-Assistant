import { LLMConfig, LLMDBConfig, LLMProviderConfig } from '../config/llm';
import { validateApiKey, getApiKey, APIKeyError } from '../../lib/api-key';
import { LLMResponse, StreamChunk, GenerateParams, ConnectionTestResult, SpeedTestResult } from '../types/llm';
import { LLMProviderFactory, LLMProviderType } from './providers/factory';

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

export class LLMFactory {
  private static instance: LLMFactory;
  private config: LLMDBConfig | null = null;
  private providerFactory: LLMProviderFactory;

  private constructor() {
    this.providerFactory = LLMProviderFactory.getInstance();
  }

  static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  setConfig(config: LLMDBConfig) {
    this.config = config;
  }

  private async getApiKey(provider: string): Promise<string> {
    if (!this.config) {
      throw new Error('LLM 配置未初始化');
    }

    const providerConfig = this.config[provider as LLMProvider];
    if (!providerConfig || !('getApiKey' in providerConfig)) {
      throw new Error(`未找到 ${provider} 的配置`);
    }

    const apiKey = await providerConfig.getApiKey();
    if (!apiKey) {
      throw new Error(`未找到 ${provider} 的 API Key`);
    }

    return apiKey;
  }

  private async getLLMProvider(provider: string) {
    const apiKey = await this.getApiKey(provider);
    return this.providerFactory.createProvider(provider as LLMProviderType, apiKey);
  }

  async generateRecommendation(params: GenerateParams, provider?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const selectedProvider = provider || this.config.defaultProvider;
    const llm = await this.getLLMProvider(selectedProvider);
    return llm.generateRecommendation(params);
  }

  async *generateRecommendationStream(
    params: GenerateParams,
    provider: LLMProviderType = 'deepseek'
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      if (!this.config) {
        throw new Error('LLM 配置未初始化');
      }

      const llm = await this.getLLMProvider(provider);
      yield* llm.generateRecommendationStream(params);
    } catch (error) {
      console.error('生成推荐失败:', error);
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async testConnection(provider: string): Promise<ConnectionTestResult> {
    try {
      const llm = await this.getLLMProvider(provider);
      return llm.testConnection();
    } catch (error) {
      return {
        success: false,
        latency: 0,
        error: error instanceof Error ? error.message : '未知错误',
        apiEndpoint: '',
      };
    }
  }

  async testSpeed(provider: string, model: string): Promise<SpeedTestResult> {
    try {
      const llm = await this.getLLMProvider(provider);
      return llm.testSpeed(model);
    } catch (error) {
      return {
        success: false,
        data: {
          duration: 0,
          response: '',
          model,
          error: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  async getAvailableModels(provider: string) {
    if (!this.config) {
      throw new Error('LLM 配置未初始化');
    }

    const llm = await this.getLLMProvider(provider);
    return llm.getAvailableModels();
  }

  getSupportedProviders(): string[] {
    return this.providerFactory.getSupportedProviders();
  }
} 