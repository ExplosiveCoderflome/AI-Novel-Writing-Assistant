/*
 * @LastEditors: biz
 */
import { LLMProviderInterface } from './base';
import { SiliconFlowProvider } from './siliconflow';
import { DeepseekProvider } from './deepseek';

export type LLMProviderType = 'siliconflow' | 'deepseek';

export class LLMProviderFactory {
  private static instance: LLMProviderFactory;
  private providers: Map<LLMProviderType, new (apiKey: string) => LLMProviderInterface>;

  private constructor() {
    this.providers = new Map();
    this.registerProviders();
  }

  static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory();
    }
    return LLMProviderFactory.instance;
  }

  private registerProviders() {
    this.providers.set('siliconflow', SiliconFlowProvider);
    this.providers.set('deepseek', DeepseekProvider);
  }

  createProvider(type: LLMProviderType, apiKey: string): LLMProviderInterface {
    const Provider = this.providers.get(type);
    if (!Provider) {
      throw new Error(`不支持的 LLM 提供商类型: ${type}`);
    }
    return new Provider(apiKey);
  }

  getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }
} 