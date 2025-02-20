import { BaseLLM } from './base';
import { LLMResponse, StreamChunk, GenerateParams, LLMModel } from '../types/llm';

interface SiliconFlowModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

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
      const models = await this.getAvailableModels();
      
      // 如果有自定义模型，先检查是否在可用列表中
      if (this.customModel) {
        const isCustomModelAvailable = models.some(model => model.id === this.customModel);
        if (isCustomModelAvailable) {
          return this.customModel;
        }
        console.warn(`自定义模型 ${this.customModel} 不可用，将使用默认模型`);
      }
      
      // 获取第一个可用的聊天模型或使用默认模型
      const chatModel = models.find(model => model.id.includes('chat'));
      return chatModel?.id || this.defaultModel;
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return this.customModel || this.defaultModel;
    }
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      const model = await this.getModelToUse();
      if (!model) {
        throw new Error('未找到可用的聊天模型');
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '请求失败');
      }

      const data = await response.json();
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
      const model = await this.getModelToUse();
      if (!model) {
        throw new Error('未找到可用的聊天模型');
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model,
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
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
            break;
          }

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                
                if (content) {
                  yield {
                    type: 'content',
                    content,
                    reasoning_content: '',
                  };
                }
              } catch (e) {
                console.error('解析数据块失败:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('硅基流动 API 流式生成错误:', error);
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const models = await this.getAvailableModels();
      return models.length > 0;
    } catch (error) {
      console.error('连接测试失败:', error);
      return false;
    }
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('获取模型列表失败');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return [];
    }
  }
} 