import { BaseLLM } from './base';
import { LLMModel, StreamChunk, GenerateParams, LLMResponse } from '../../app/types/llm';

export class DeepseekLLM extends BaseLLM {
  private defaultModels = ['deepseek-chat', 'deepseek-reasoner'];
  private model: string | undefined;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.model = model;
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        console.warn('获取模型列表失败，使用默认模型列表');
        return this.getDefaultModels();
      }

      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) {
        return this.getDefaultModels();
      }

      return data.data.filter((model: any) => 
        this.defaultModels.includes(model.id)
      );
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): LLMModel[] {
    return this.defaultModels.map(modelId => ({
      id: modelId,
      object: 'model',
      created: Date.now(),
      owned_by: 'deepseek',
    }));
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      const requestBody = {
        model: this.model || params.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: params.systemPrompt || '',
          },
          {
            role: 'user',
            content: params.userPrompt,
          },
        ],
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 2000,
      };

      console.log('发送请求体:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('API 响应状态:', response.status);
      console.log('API 响应头:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API 错误响应:', errorText);
        let errorMessage = '请求失败';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || '请求失败';
        } catch (e) {
          console.error('解析错误响应失败:', e);
          errorMessage = errorText || '请求失败';
        }
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      console.log('API 响应内容:', responseText);

      if (!responseText.trim()) {
        throw new Error('API 返回了空响应');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('解析响应 JSON 失败:', e);
        console.error('原始响应内容:', responseText);
        throw new Error(`无法解析 API 响应: ${responseText.slice(0, 100)}...`);
      }

      if (!data.choices?.[0]?.message?.content) {
        console.error('响应数据格式不正确:', data);
        throw new Error('API 响应格式不正确');
      }

      return {
        content: data.choices[0].message.content,
        error: undefined,
      };
    } catch (error) {
      console.error('Deepseek API error:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('开始 Deepseek 流式生成，使用模型:', this.model || params.model || 'deepseek-chat');
      
      const requestBody = {
        model: this.model || params.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: params.systemPrompt || '',
          },
          {
            role: 'user',
            content: params.userPrompt,
          },
        ],
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 2000,
        stream: true,
      };
      
      console.log('发送请求体:', JSON.stringify(requestBody, null, 2));
      
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

      console.log('API 响应状态:', response.status);
      console.log('API 响应头:', Object.fromEntries(response.headers.entries()));

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法创建响应流读取器');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('流读取完成');
          break;
        }

        const chunk = decoder.decode(value);
        console.log('收到原始数据块:', chunk);
        
        const lines = chunk.split('\n');

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
              console.log('解析后的数据:', JSON.stringify(parsed, null, 2));
              
              const content = parsed.choices[0]?.delta?.content;
              const reasoningContent = parsed.choices[0]?.delta?.reasoning_content;

              console.log('提取的内容:', {
                content,
                reasoningContent,
                hasContent: !!content,
                hasReasoningContent: !!reasoningContent
              });

              if (content !== null || reasoningContent !== null) {
                yield {
                  type: 'content',
                  content: content || '',
                  reasoning_content: reasoningContent || ''
                };
              }
            } catch (e) {
              console.error('解析数据块失败:', e);
              console.error('原始数据:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error('Deepseek 流式生成错误:', error);
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
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Deepseek API test error:', error);
      return false;
    }
  }
} 