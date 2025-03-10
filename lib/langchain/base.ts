import { LLMResponse, StreamChunk, LLMModel, GenerateParams } from '../../app/types/llm';
import { BaseLLM } from '../llm/base';
import { 
  LangChainModelConfig, 
  LangChainGenerateParams, 
  ChatMessage,
  ChatModelOptions
} from './types';
import { BaseLanguageModel } from 'langchain/dist/base_language';
import { ChatOpenAI } from '@langchain/openai';
import { 
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} from '@langchain/core/prompts';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * LangChain基础模型适配器
 * 扩展自现有的BaseLLM抽象类，实现与LangChain的集成
 */
export abstract class LangChainBaseLLM extends BaseLLM {
  protected model: BaseLanguageModel | null = null;
  protected modelConfig: LangChainModelConfig;
  
  constructor(apiKey: string, modelName: string = '') {
    super(apiKey);
    this.modelConfig = {
      modelName: modelName || this.getDefaultModelName(),
      temperature: 0.7,
      maxTokens: 2048,
      streaming: true,
      verbose: false
    };
  }

  /**
   * 获取默认模型名称
   */
  protected abstract getDefaultModelName(): string;

  /**
   * 初始化LangChain模型实例
   */
  protected abstract initializeModel(): Promise<BaseLanguageModel>;

  /**
   * 确保模型已初始化
   */
  protected async ensureModel(): Promise<BaseLanguageModel> {
    if (!this.model) {
      this.model = await this.initializeModel();
    }
    return this.model;
  }

  /**
   * 将消息历史转换为LangChain消息格式
   */
  protected convertMessagesToLangChainFormat(messages: ChatMessage[]) {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return new SystemMessage(msg.content);
      } else if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else {
        // 处理function/tool消息（如需要）
        return new AIMessage(msg.content);
      }
    });
  }

  /**
   * 生成完整响应
   */
  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      console.log('LangChain开始生成响应，参数:', {
        model: this.modelConfig.modelName,
        temperature: this.modelConfig.temperature,
        maxTokens: this.modelConfig.maxTokens
      });
      
      const model = await this.ensureModel();
      const systemPrompt = params.systemPrompt || '你是一个有用的AI助手。';
      const userPrompt = params.userPrompt;
      
      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(userPrompt)
      ]);
      
      const chain = prompt.pipe(model);
      const response = await chain.invoke({});
      
      console.log('LangChain生成完成');
      
      return {
        content: response.content
      };
    } catch (error) {
      console.error('LangChain生成错误:', error);
      return {
        error: error instanceof Error ? error.message : '生成过程中发生错误'
      };
    }
  }

  /**
   * 生成流式响应
   */
  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('LangChain开始流式生成，参数:', {
        model: this.modelConfig.modelName,
        streaming: true,
        temperature: this.modelConfig.temperature,
        maxTokens: this.modelConfig.maxTokens
      });
      
      const model = await this.ensureModel();
      const systemPrompt = params.systemPrompt || '你是一个有用的AI助手。';
      const userPrompt = params.userPrompt;
      
      // 确保模型支持流式输出
      if (model instanceof ChatOpenAI) {
        model.streaming = true;
      }
      
      let streamingContent = '';
      const callbacks = [{
        handleLLMNewToken(token: string) {
          streamingContent += token;
          return Promise.resolve();
        }
      }];
      
      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(userPrompt)
      ]);
      
      const chain = prompt.pipe(model.bind({ callbacks }));
      
      // 开始生成
      let streamStarted = false;
      
      try {
        await chain.invoke({});
        
        if (!streamStarted) {
          yield {
            type: 'content',
            content: streamingContent
          };
        }
      } catch (error) {
        console.error('LangChain流式生成错误:', error);
        yield {
          type: 'error',
          content: error instanceof Error ? error.message : '流式生成过程中发生错误'
        };
      }
      
      console.log('LangChain流式生成完成');
    } catch (error) {
      console.error('LangChain流式生成初始化错误:', error);
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : '流式生成初始化失败'
      };
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureModel();
      return true;
    } catch (error) {
      console.error('LangChain连接测试失败:', error);
      return false;
    }
  }

  /**
   * 获取可用模型列表
   */
  abstract getAvailableModels(): Promise<LLMModel[]>;
} 