import { BaseLLMProvider } from './base';
import { LLMResponse, StreamChunk, GenerateParams, LLMModel, ConnectionTestResult } from '../../types/llm';

export class DeepseekProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'https://api.deepseek.com/v1');
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      const isR1Model = params.model?.includes('r1');
      const apiEndpoint = isR1Model 
        ? `${this.baseUrl}/r1/chat/completions`
        : `${this.baseUrl}/chat/completions`;

      console.log('发送请求到:', apiEndpoint);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
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
        console.error('API 响应错误:', error);
        return {
          content: '',
          error: error.error?.message || `请求失败: ${response.statusText}`,
        };
      }

      const data = await response.json();
      console.log('API 响应:', data);
      return {
        content: data.choices[0]?.message?.content || '',
        error: undefined,
      };
    } catch (error) {
      console.error('生成推荐失败:', error);
      return {
        content: '',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async *generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const isR1Model = params.model?.includes('r1');
      const apiEndpoint = isR1Model 
        ? `${this.baseUrl}/r1/chat/completions`
        : `${this.baseUrl}/chat/completions`;

      console.log('发送流式请求到:', apiEndpoint, '参数:', {
        model: params.model,
        systemPrompt: params.systemPrompt ? '已设置' : '未设置',
        userPrompt: params.userPrompt,
        temperature: params.temperature,
        maxTokens: params.maxTokens
      });

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
          'User-Agent': 'Smart-Search-Assistant/1.0'
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
        const errorText = await response.text();
        console.error('API 响应错误:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        let errorMessage = `请求失败: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // 如果解析失败，使用原始错误文本
          errorMessage = errorText;
        }
        yield {
          type: 'error',
          content: errorMessage,
          reasoning_content: ''
        };
        return;
      }

      if (!response.body) {
        console.error('响应体为空');
        yield {
          type: 'error',
          content: '响应体为空',
          reasoning_content: ''
        };
        return;
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
        reasoning_content: ''
      };
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // 1. 测试获取模型列表
      const models = await this.getAvailableModels();
      const latency = Date.now() - startTime;

      // 2. 测试生成能力
      const generationStartTime = Date.now();
      const testPrompt = "请用一句话介绍你自己。";
      const generationResult = await this.generateRecommendation({
        userPrompt: testPrompt,
        model: models[0]?.id,
        temperature: 0.7,
        maxTokens: 100
      });

      const generationTime = Date.now() - generationStartTime;

      // 3. 返回完整的测试结果
      return {
        success: true,
        latency,
        availableModels: models,
        modelCount: models.length,
        apiEndpoint: this.baseUrl,
        generationTest: {
          success: !generationResult.error,
          content: generationResult.content,
          generationTime,
          error: generationResult.error,
        }
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : '未知错误',
        apiEndpoint: this.baseUrl,
        generationTest: {
          success: false,
          generationTime: 0,
          error: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    console.log('[Deepseek Provider] 开始获取可用模型列表');
    try {
      this.validateApiKey();
      this.validateProviderApiKey('deepseek');
      console.log('[Deepseek Provider] API Key验证通过');
      
      console.log('[Deepseek Provider] 发起HTTP请求获取模型列表');
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
        },
      });

      console.log(`[Deepseek Provider] 收到响应 - 状态码: ${response.status}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '无法读取错误响应体');
        console.error(`[Deepseek Provider] 请求失败 - 状态码: ${response.status}, 状态文本: ${response.statusText}`);
        console.error('[Deepseek Provider] 错误响应体:', errorBody);
        
        // 针对特定错误进行处理
        if (response.status === 401) {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.type === 'authentication_error') {
            throw new Error(`API Key 认证失败: ${errorJson.error.message}`);
          }
        }
        
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}\n响应体: ${errorBody}`);
      }

      const data = await response.json();
      console.log('[Deepseek Provider] 成功解析响应数据:', data);
      return data.data;
    } catch (error) {
      console.error('[Deepseek Provider] 获取模型列表时发生错误:', error);
      if (error instanceof Error) {
        console.error('[Deepseek Provider] 错误堆栈:', error.stack);
      }
      throw error;
    }
  }

  protected extractContentFromChunk(chunk: any): string | null {
    return chunk.choices?.[0]?.delta?.content || null;
  }
} 