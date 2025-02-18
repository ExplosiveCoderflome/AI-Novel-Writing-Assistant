import { BaseLLM } from './base';
import { LLMModel, StreamChunk, GenerateParams, LLMResponse } from '../../app/types/llm';

export class SiliconFlowLLM extends BaseLLM {
  private defaultModel = 'silicon-copilot-v1';
  private customModel: string | null = null;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.baseUrl = 'https://api.siliconflow.cn/v1';
    if (model) {
      this.customModel = model;
    }
  }

  private async getModelToUse(): Promise<string> {
    try {
      console.log('开始获取可用模型...');
      const models = await this.getAvailableModels();
      console.log('获取到的模型列表:', models);
      
      // 过滤出聊天和指令类模型
      const chatModels = models.filter(model => {
        const modelId = model.id.toLowerCase();
        return (
          modelId.includes('chat') ||
          modelId.includes('instruct') ||
          modelId.includes('yi') ||
          modelId.includes('glm') ||
          modelId.includes('qwen') ||
          modelId.includes('flux') ||
          modelId.includes('telechat') ||
          modelId.includes('deepseek')
        ) && !modelId.includes('embedding') 
          && !modelId.includes('reranker')
          && !modelId.includes('stable-diffusion')
          && !modelId.includes('vl')
          && !modelId.includes('video')
          && !modelId.includes('speech')
          && !modelId.includes('voice');
      });
      
      console.log('过滤后的聊天模型:', chatModels);
      
      // 如果指定了自定义模型，检查是否可用
      if (this.customModel) {
        console.log('检查自定义模型:', this.customModel);
        const isCustomModelAvailable = chatModels.some(model => model.id === this.customModel);
        if (isCustomModelAvailable) {
          console.log('自定义模型可用');
          return this.customModel;
        }
        console.warn(`自定义模型 ${this.customModel} 不可用，将尝试使用其他模型`);
      }
      
      // 按优先级尝试不同的模型
      const modelPriority = [
        'Qwen/Qwen2.5-7B-Instruct',     // 通义千问2.5 7B
        'Qwen/Qwen2-7B-Instruct',       // 通义千问2.0 7B
        'THUDM/chatglm3-6b',            // ChatGLM3 6B
        '01-ai/Yi-1.5-6B-Chat',         // Yi 1.5 6B
        'internlm/internlm2_5-7b-chat', // InternLM2 7B
        'black-forest-labs/FLUX.1-dev',  // FLUX 开发版
      ];
      
      console.log('尝试按优先级选择模型...');
      for (const modelId of modelPriority) {
        console.log('检查模型:', modelId);
        if (chatModels.some(model => model.id === modelId)) {
          console.log('找到可用模型:', modelId);
          return modelId;
        }
      }
      
      // 如果找不到预定义的模型，使用第一个可用的聊天模型
      if (chatModels.length > 0) {
        console.log('使用第一个可用的聊天模型:', chatModels[0].id);
        return chatModels[0].id;
      }
      
      throw new Error('未找到可用的聊天模型');
    } catch (error) {
      console.error('获取模型失败:', error);
      // 如果获取模型失败，使用默认模型
      console.log('使用默认模型:', this.defaultModel);
      return this.defaultModel;
    }
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      console.log('开始生成推荐...');
      const modelId = await this.getModelToUse();
      console.log('使用模型:', modelId);

      const requestBody = {
        model: modelId,
        messages: [
          ...(params.systemPrompt ? [{
            role: 'system',
            content: params.systemPrompt,
          }] : []),
          {
            role: 'user',
            content: params.userPrompt,
          },
        ],
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 1000,
      };

      console.log('发送请求:', {
        url: `${this.baseUrl}/chat/completions`,
        body: requestBody,
      });

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('API 响应错误:', error);
        throw new Error(error.message || '请求失败');
      }

      const data = await response.json();
      console.log('收到响应:', data);
      
      return {
        content: data.choices[0].message.content,
        error: undefined,
      };
    } catch (error) {
      console.error('硅基流动 API 错误:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('开始流式生成...');
      const modelId = await this.getModelToUse();
      console.log('使用模型:', modelId);

      const requestBody = {
        model: modelId,
        messages: [
          ...(params.systemPrompt ? [{
            role: 'system',
            content: params.systemPrompt,
          }] : []),
          {
            role: 'user',
            content: params.userPrompt,
          },
        ],
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 1000,
        stream: true,
      };

      console.log('发送流式请求:', {
        url: `${this.baseUrl}/chat/completions`,
        body: requestBody,
      });

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('API 流式响应错误:', error);
        
        // 特殊处理余额不足的情况
        if (error.code === 30011) {
          yield {
            type: 'error',
            content: '该模型需要付费使用，当前账户余额不足。请充值后重试。',
            reasoning_content: `错误代码: ${error.code}\n具体信息: ${error.message}`
          };
          return;
        }
        
        throw new Error(error.message || '请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法创建响应流读取器');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('流读取完成');
            break;
          }

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log('收到结束标记');
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                
                if (content) {
                  yield {
                    type: 'content',
                    content,
                    reasoning_content: ''
                  };
                }
              } catch (e) {
                console.error('解析数据块失败:', e);
                console.error('原始数据:', data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('硅基流动 API 流式生成错误:', error);
      if (error instanceof Error) {
        console.error('错误详情:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('测试连接...');
      const models = await this.getAvailableModels();
      const hasModels = models.length > 0;
      console.log('连接测试结果:', hasModels ? '成功' : '失败');
      return hasModels;
    } catch (error) {
      console.error('连接测试失败:', error);
      return false;
    }
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      console.log('获取可用模型列表...');
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('获取模型列表失败:', error);
        throw new Error(error.message || '获取模型列表失败');
      }

      const data = await response.json();
      console.log('获取到的模型数据:', data);
      return data.data || [];
    } catch (error) {
      console.error('获取模型列表失败:', error);
      throw error;
    }
  }
} 