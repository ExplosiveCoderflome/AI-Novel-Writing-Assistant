import { BaseLLM } from './base';
import { LLMResponse, StreamChunk, GenerateParams, LLMModel } from '../types/llm';

export class DeepseekLLM extends BaseLLM {
  private defaultModels = ['deepseek-chat', 'deepseek-reasoner'];
  private model: string | undefined;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.model = model;
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model || this.defaultModels[0],
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
          max_tokens: params.maxTokens || 2000,
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
      console.error('Deepseek API 错误:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: this.model || this.defaultModels[0],
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
          max_tokens: params.maxTokens || 2000,
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
      console.error('Deepseek API 流式生成错误:', error);
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