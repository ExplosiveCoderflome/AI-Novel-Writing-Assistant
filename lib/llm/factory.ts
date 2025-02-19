/*
 * @LastEditors: biz
 */
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

  async generateCharacterTemplate(genreName: string, genreDescription: string, provider?: string): Promise<any> {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const selectedProvider = provider || this.config.defaultProvider;
    if (!selectedProvider) {
      throw new Error('未指定 LLM 提供商');
    }

    const apiKey = await this.getApiKey(selectedProvider);
    const llm = await this.getLLMInstance({ provider: selectedProvider, apiKey });
    
    const prompt = `为${genreName}类型的小说生成一个详细的角色模板。
    类型描述：${genreDescription}
    
    请生成一个包含以下主要类别的角色模板，每个类别下包含相关的具体字段。返回格式必须是JSON，包含以下结构：
    {
      "categories": [
        {
          "name": "基本信息",
          "fields": [
            {
              "name": "姓名",
              "type": "string",
              "description": "角色的名字，需符合${genreName}类型的特点"
            },
            // ... 其他字段
          ]
        },
        // ... 其他类别
      ]
    }

    必须包含的类别和字段示例：
    1. 基本信息
       - 姓名、年龄、性别、外貌、身份/地位
    2. 能力特征
       - 主要能力、技能特长、战斗方式、特殊天赋
    3. 性格特征
       - 性格描述、优点、缺点、行为习惯
    4. 背景设定
       - 出身背景、重要经历、家族历史、身世之谜
    5. 社交关系
       - 师门关系、朋友/敌人、情感羁绊
    6. 目标动机
       - 主要目标、行动动机、内心追求

    注意：
    1. 所有字段必须符合${genreName}类型的特点
    2. 每个字段都要有详细的描述说明
    3. 确保生成的内容符合主流价值观
    4. 字段类型必须是：string、number、boolean 或 string[] 之一`;

    const response = await llm.generateRecommendation({ userPrompt: prompt });
    
    try {
      if (!response.content) {
        throw new Error('生成的角色模板内容为空');
      }
      
      const cleanContent = response.content
        .replace(/```json\n?/, '')
        .replace(/```/, '')
        .trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      throw new Error('生成的角色模板格式不正确');
    }
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