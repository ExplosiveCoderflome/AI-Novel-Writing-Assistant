import { BaseLLMProvider } from './base';
import { LLMResponse, StreamChunk, GenerateParams, LLMModel } from '../../types/llm';

export class SiliconFlowProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'https://api.siliconflow.com/v1');
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
          model: params.model,
          messages: [
            ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
            { role: 'user', content: params.userPrompt }
          ],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          content: '',
          error: error.error?.message || `请求失败: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || '',
        error: undefined,
      };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      console.log('开始流式生成请求...');
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
            { role: 'user', content: params.userPrompt }
          ],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API 响应错误:', errorData);
        throw new Error(errorData.error?.message || `请求失败: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('流读取完成');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                console.log('收到内容块:', content);
                yield {
                  type: 'content',
                  content,
                  reasoning_content: ''
                };
              }
            } catch (e) {
              console.error('解析数据块失败:', e, '原始数据:', data);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('流式生成失败:', error);
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    console.log('[SiliconFlow Provider] 开始获取可用模型列表');
    try {
      this.validateApiKey();
      this.validateProviderApiKey('siliconflow');
      console.log('[SiliconFlow Provider] API Key验证通过');
      
      console.log('[SiliconFlow Provider] 发起HTTP请求获取模型列表');
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      console.log(`[SiliconFlow Provider] 收到响应 - 状态码: ${response.status}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '无法读取错误响应体');
        console.error(`[SiliconFlow Provider] 请求失败 - 状态码: ${response.status}, 状态文本: ${response.statusText}`);
        console.error('[SiliconFlow Provider] 错误响应体:', errorBody);
        
        // 针对特定错误进行处理
        if (response.status === 401) {
          if (errorBody.includes('invalid')) {
            throw new Error('API Key 无效，请检查格式是否正确');
          }
        }
        
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}\n响应体: ${errorBody}`);
      }

      const data = await response.json();
      console.log('[SiliconFlow Provider] 成功解析响应数据:', data);
      return data.data;
    } catch (error) {
      console.error('[SiliconFlow Provider] 获取模型列表时发生错误:', error);
      if (error instanceof Error) {
        console.error('[SiliconFlow Provider] 错误堆栈:', error.stack);
      }
      throw error;
    }
  }

  protected extractContentFromChunk(chunk: any): string | null {
    return chunk.choices?.[0]?.delta?.content || null;
  }
} 