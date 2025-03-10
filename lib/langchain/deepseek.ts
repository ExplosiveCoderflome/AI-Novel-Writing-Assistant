import { LangChainBaseLLM } from './base';
import { LLMModel, StreamChunk } from '../../app/types/llm';
import { LangChainFactoryConfig } from './types';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Deepseek模型的LangChain实现
 * 注意：由于 @langchain/community 包中的 Deepseek 集成可能未更新或不可用
 * 这里使用 ChatOpenAI 类并配置为与 Deepseek API 兼容
 */
export class DeepseekLangChain extends LangChainBaseLLM {
  private modelList: LLMModel[] = [];
  
  constructor(apiKey: string, modelName: string = '') {
    super(apiKey, modelName);
    
    // 基础URL，可选配置项
    this.baseUrl = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
    
    // 初始化默认可用模型列表
    this.modelList = this.getDefaultModels();
  }
  
  /**
   * 获取默认模型
   * 使用gpt-3.5-turbo作为内部映射模型，但实际调用Deepseek API
   */
  protected getDefaultModelName(): string {
    return 'gpt-3.5-turbo'; // 使用OpenAI已知模型来避免token计算错误
  }
  
  /**
   * 获取实际Deepseek模型名称
   * 这是我们实际发送给Deepseek API的模型名称
   */
  private getActualModelName(): string {
    // 如果用户明确指定了模型名称，则使用用户指定的
    if (this.modelConfig.modelName && 
        this.modelConfig.modelName !== 'gpt-3.5-turbo' && 
        !this.modelConfig.modelName.startsWith('gpt-')) {
      return this.modelConfig.modelName;
    }
    
    // 否则返回默认的Deepseek模型
    return 'deepseek-chat';
  }
  
  /**
   * 获取默认模型列表
   */
  private getDefaultModels(): LLMModel[] {
    const now = Date.now();
    return [
      {
        id: 'deepseek-chat',
        object: 'model',
        created: now,
        owned_by: 'deepseek'
      },
      {
        id: 'deepseek-coder',
        object: 'model',
        created: now,
        owned_by: 'deepseek'
      },
      {
        id: 'deepseek-reasoner',
        object: 'model',
        created: now,
        owned_by: 'deepseek'
      }
    ];
  }
  
  /**
   * 初始化LangChain Deepseek模型
   * 使用ChatOpenAI类但配置为Deepseek API兼容
   */
  protected async initializeModel() {
    const actualModelName = this.getActualModelName();
    
    console.log('初始化Deepseek LangChain模型:', {
      modelNameForTokenCounting: this.modelConfig.modelName, // 用于token计算的模型名称
      actualModelNameForAPI: actualModelName, // 实际发送给API的模型名称
      apiKey: this.apiKey ? '已设置' : '未设置',
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      throw new Error('Deepseek API密钥未设置');
    }
    
    try {
      // 使用ChatOpenAI但配置为Deepseek API兼容
      const model = new ChatOpenAI({
        modelName: this.modelConfig.modelName, // 对内使用OpenAI模型名称以支持token计算
        temperature: this.modelConfig.temperature,
        maxTokens: this.modelConfig.maxTokens,
        streaming: this.modelConfig.streaming,
        verbose: this.modelConfig.verbose,
        openAIApiKey: this.apiKey,
        configuration: {
          baseURL: this.baseUrl,
          defaultHeaders: {
            // 添加自定义头，在请求时覆盖model参数
            'X-DeepSeek-Model-Override': actualModelName
          }
        }
      });
      
      // 覆盖model名称，确保发送给Deepseek API的是正确的模型名称
      // 注意：这是一个hack，由于LangChain类型限制，我们使用any类型
      const modelAny = model as any;
      if (modelAny._prepareRequest) {
        const originalPrepare = modelAny._prepareRequest.bind(modelAny);
        modelAny._prepareRequest = (params: any, options: any) => {
          if (params && params.model === this.modelConfig.modelName) {
            params.model = actualModelName;
          }
          return originalPrepare(params, options);
        };
      }
      
      console.log('Deepseek LangChain模型初始化成功');
      return model;
    } catch (error) {
      console.error('Deepseek LangChain模型初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 重写流式生成方法，以适配Deepseek API
   */
  async *generateRecommendationStream(params: any): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('Deepseek流式生成开始，参数:', {
        modelName: this.modelConfig.modelName,
        actualModel: this.getActualModelName(),
        promptLength: params.userPrompt?.length || 0
      });
      
      const model = await this.ensureModel();
      if (!(model instanceof ChatOpenAI)) {
        throw new Error('模型初始化失败或类型不匹配');
      }
      
      // 确保流式模式开启
      model.streaming = true;
      
      // 系统提示和用户提示
      const systemPrompt = params.systemPrompt || '你是一个有用的AI助手。';
      const userPrompt = params.userPrompt;
      
      // 直接使用原始API进行流式调用，绕过LangChain的token计算
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.getActualModelName(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: this.modelConfig.temperature || 0.7,
          max_tokens: this.modelConfig.maxTokens || 2048,
          stream: true
        })
      }).catch(error => {
        // 友好的网络错误处理
        console.error('Deepseek API网络请求失败:', error);
        
        // 根据不同错误类型提供更具体的错误信息
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接或API状态');
        } else if (error.message.includes('Failed to fetch')) {
          throw new Error('无法连接到Deepseek API，请检查网络连接和API地址是否正确');
        } else {
          throw new Error(`连接Deepseek API失败: ${error.message}`);
        }
      });
      
      if (!response) {
        throw new Error('没有收到Deepseek API响应');
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepseek API返回错误:', response.status, errorText);
        
        // 根据状态码提供更具体的错误描述
        let errorMessage = `Deepseek API返回错误: ${response.status}`;
        if (response.status === 401) {
          errorMessage = 'API密钥无效或已过期，请更新您的Deepseek API密钥';
        } else if (response.status === 404) {
          errorMessage = `找不到请求的模型: ${this.getActualModelName()}，请检查模型名称是否正确`;
        } else if (response.status === 429) {
          errorMessage = 'API请求频率超限或额度已用完，请稍后再试';
        } else if (response.status >= 500) {
          errorMessage = 'Deepseek API服务器错误，请稍后再试';
        }
        
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error && errorJson.error.message) {
              errorMessage += `: ${errorJson.error.message}`;
            }
          } catch (e) {
            // 如果不是JSON格式，直接添加原始错误文本
            errorMessage += `: ${errorText}`;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      if (!response.body) {
        throw new Error('响应没有返回数据流');
      }
      
      // 处理SSE流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamContent = '';
      let chunkIndex = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk
          .split('\n')
          .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
        
        for (const line of lines) {
          try {
            if (!line.startsWith('data: ')) continue;
            
            const jsonData = line.slice(6); // 移除 "data: " 前缀
            if (jsonData.trim() === '[DONE]') continue;
            
            const data = JSON.parse(jsonData);
            const content = data.choices?.[0]?.delta?.content || '';
            
            if (content) {
              chunkIndex++;
              streamContent += content;
              
              console.log(`接收到Deepseek流数据块 #${chunkIndex}:`, {
                contentLength: content.length,
                totalLength: streamContent.length
              });
              
              // 如果内容块较大，拆分成更小的块发送，以优化前端显示效果
              if (content.length > 10) {
                // 为汉字内容和标点符号优化拆分
                const chunks = this.splitContentIntoChunks(content);
                for (const smallChunk of chunks) {
                  yield {
                    type: 'content',
                    content: smallChunk
                  };
                  // 小延迟，确保前端有时间渲染
                  await new Promise(resolve => setTimeout(resolve, 5));
                }
              } else {
                // 返回原始内容块
                yield {
                  type: 'content',
                  content: content
                };
              }
            }
          } catch (parseError) {
            console.error('解析Deepseek流数据失败:', parseError, '原始数据:', line);
          }
        }
      }
      
      if (streamContent === '') {
        // 如果没有内容返回，至少返回一个空块
        yield {
          type: 'content',
          content: ''
        };
      }
      
      console.log('Deepseek流式生成完成，总共生成内容长度:', streamContent.length);
    } catch (error) {
      console.error('Deepseek流式生成错误:', error);
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 将长内容拆分成小块，优化前端显示
   * 尽量在标点符号处断开，或者按照字符数
   */
  private splitContentIntoChunks(content: string): string[] {
    // 标点符号和空格等分隔符
    const delimiters = new Set(['，', '。', '；', '：', '！', '？', '\n', ' ', ',', '.', ';', ':', '!', '?']);
    const chunks: string[] = [];
    let currentChunk = '';
    
    // 逐字符处理
    for (let i = 0; i < content.length; i++) {
      currentChunk += content[i];
      
      // 当达到5-10个字符，且当前字符是分隔符，或达到最大长度(15个字符)时，生成一个chunk
      if ((currentChunk.length >= 5 && delimiters.has(content[i])) || 
          currentChunk.length >= 15) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    
    // 处理最后可能剩余的内容
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  /**
   * 获取可用模型列表
   */
  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      // 理想情况下应该从Deepseek API获取实际可用模型列表
      // 但这需要额外的API调用，这里我们返回预定义的列表
      return this.modelList;
    } catch (error) {
      console.error('获取Deepseek模型列表失败:', error);
      return this.getDefaultModels();
    }
  }
} 