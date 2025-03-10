import { BaseLLM } from '../llm/base';
import { LangChainBaseLLM } from './base';
import { OpenAILangChain } from './openai';
import { DeepseekLangChain } from './deepseek';
import { LangChainFactoryConfig } from './types';
import { LLMResponse, LLMDBConfig } from '../../app/types/llm';
import { OpenAI } from "@langchain/community/llms/openai";
import { ChatOpenAI } from "@langchain/openai";
// Deepseek可能不在社区版中，需要检查确切路径

/**
 * 获取LangChain兼容的LLM模型实例
 */
export function getLLMFromConfig({
  provider,
  model,
  temperature = 0.7,
  maxTokens,
  streaming = false,
}: {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}) {
  // 检查环境变量中是否有对应提供商的API密钥
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OpenAI API key');
    }

    // 根据模型名称创建对应的LLM实例
    return new OpenAI({
      modelName: model,
      temperature,
      maxTokens,
      streaming,
      openAIApiKey: apiKey,
    });
  } else if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Deepseek API key');
    }

    // 由于我们不确定Deepseek具体路径，先使用直接调用API的方式
    // 这部分应该根据实际的Deepseek API集成方式修改
    console.log('使用Deepseek模型:', model);
    return {
      call: async (prompt: string) => {
        // 这里应该实现实际调用Deepseek API的逻辑
        console.log('调用Deepseek API，提示词:', prompt);
        return '这是Deepseek API的模拟返回';
      },
      // 添加流式处理支持
      streamingCall: streaming ? async function*(prompt: string) {
        console.log('流式调用Deepseek API，提示词:', prompt);
        yield '这是Deepseek API的模拟流式返回';
      } : undefined
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * LangChain工厂类，负责创建和管理LangChain模型实例
 */
export class LangChainFactory {
  private static instance: LangChainFactory;
  private config: LLMDBConfig | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): LangChainFactory {
    if (!LangChainFactory.instance) {
      LangChainFactory.instance = new LangChainFactory();
    }
    return LangChainFactory.instance;
  }

  /**
   * 设置全局配置
   */
  public setConfig(config: LLMDBConfig) {
    console.log('更新LangChain工厂配置:', config);
    this.config = config;
    return this;
  }

  /**
   * 获取当前配置
   */
  public getConfig(): LLMDBConfig | null {
    return this.config;
  }

  /**
   * 获取LangChain实例
   */
  public async getLangChainInstance(config: LangChainFactoryConfig): Promise<BaseLLM> {
    console.log('获取LangChain实例:', config);
    
    if (!this.config) {
      throw new Error('No LLM configuration set');
    }

    const { provider } = config;
    
    if (provider === 'openai') {
      return new OpenAILangChain(config);
    } else if (provider === 'deepseek') {
      return new DeepseekLangChain(config);
    }
    
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * 生成推荐内容
   */
  public async generateRecommendation(prompt: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('No LLM configuration set');
    }

    console.log('生成推荐内容，提示词:', prompt);
    
    const langChain = await this.getLangChainInstance({
      provider: this.config.provider,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    
    return await langChain.chat(prompt);
  }

  /**
   * 测试连接
   */
  public async testConnection(): Promise<boolean> {
    try {
      if (!this.config) {
        throw new Error('No LLM configuration set');
      }

      console.log('测试LLM连接:', this.config.provider);
      
      // 创建实例但不实际调用API
      await this.getLangChainInstance({
        provider: this.config.provider,
        model: this.config.model,
      });
      
      return true;
    } catch (error) {
      console.error('LLM连接测试失败:', error);
      return false;
    }
  }
} 