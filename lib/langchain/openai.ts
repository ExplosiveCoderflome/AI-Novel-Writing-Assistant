import { LangChainBaseLLM } from './base';
import { LLMModel } from '../../app/types/llm';
import { LangChainFactoryConfig } from './types';
import { ChatOpenAI } from '@langchain/openai';

/**
 * OpenAI模型的LangChain实现
 */
export class OpenAILangChain extends LangChainBaseLLM {
  private modelList: LLMModel[] = [];
  
  constructor(apiKey: string, modelName: string = '') {
    super(apiKey, modelName);
    
    // 基础URL，可选配置项
    this.baseUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    
    // 初始化默认可用模型列表
    this.modelList = this.getDefaultModels();
  }
  
  /**
   * 获取默认模型
   */
  protected getDefaultModelName(): string {
    return 'gpt-3.5-turbo';
  }
  
  /**
   * 获取默认模型列表
   */
  private getDefaultModels(): LLMModel[] {
    const now = Date.now();
    return [
      {
        id: 'gpt-4-turbo',
        object: 'model',
        created: now,
        owned_by: 'openai'
      },
      {
        id: 'gpt-4',
        object: 'model',
        created: now,
        owned_by: 'openai'
      },
      {
        id: 'gpt-3.5-turbo',
        object: 'model',
        created: now,
        owned_by: 'openai'
      }
    ];
  }
  
  /**
   * 初始化LangChain ChatOpenAI模型
   */
  protected async initializeModel() {
    console.log('初始化OpenAI LangChain模型:', {
      model: this.modelConfig.modelName,
      apiKey: this.apiKey ? '已设置' : '未设置',
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      throw new Error('OpenAI API密钥未设置');
    }
    
    try {
      const model = new ChatOpenAI({
        modelName: this.modelConfig.modelName,
        temperature: this.modelConfig.temperature,
        maxTokens: this.modelConfig.maxTokens,
        streaming: this.modelConfig.streaming,
        verbose: this.modelConfig.verbose,
        openAIApiKey: this.apiKey,
        configuration: {
          baseURL: this.baseUrl
        }
      });
      
      console.log('OpenAI LangChain模型初始化成功');
      return model;
    } catch (error) {
      console.error('OpenAI LangChain模型初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取可用模型列表
   */
  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      // 理想情况下应该从OpenAI API获取实际可用模型列表
      // 但这需要额外的API调用，这里我们返回预定义的列表
      return this.modelList;
    } catch (error) {
      console.error('获取OpenAI模型列表失败:', error);
      return this.getDefaultModels();
    }
  }
} 