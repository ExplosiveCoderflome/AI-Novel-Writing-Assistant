import { BaseLLMProvider } from './base';
import { LLMResponse, StreamChunk, GenerateParams, LLMModel, ConnectionTestResult } from '../../types/llm';

export class DeepseekProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'https://api.deepseek.com');
  }

  async generateRecommendation(params: GenerateParams): Promise<LLMResponse> {
    try {
      // 设置请求超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时
      
      const isR1Model = params.model?.includes('r1');
      const apiEndpoint = isR1Model 
        ? `${this.baseUrl}/v1/r1/chat/completions`
        : `${this.baseUrl}/v1/chat/completions`;
      
      // 构建请求体
      const { model, systemPrompt, userPrompt, temperature, maxTokens } = params;
      
      const requestBody = {
        model,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      };
      
      // 记录请求参数
      console.log('发送请求到:', apiEndpoint);
      console.log('请求参数:', {
        model: params.model,
        systemPrompt: '已设置',
        userPromptLength: params.userPrompt.length,
        temperature: params.temperature,
        maxTokens: params.maxTokens
      });
      
      console.log('请求体:', JSON.stringify(requestBody).substring(0, 200) + '...');
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      // 清除超时计时器
      clearTimeout(timeoutId);

      // 记录响应状态和头信息
      console.log('响应状态:', response.status, response.statusText);
      console.log('响应头:', JSON.stringify(Object.fromEntries(Array.from(response.headers.entries()))));

      // 如果响应不是 200，使用通用错误处理方法
      if (!response.ok) {
        const errorMessage = await this.parseErrorResponse(response, 'deepseek');
        console.error('DeepSeek API 错误:', errorMessage);
        return {
          content: '',
          error: errorMessage,
        };
      }

      // 读取响应文本
      const responseText = await response.text();
      console.log('API 原始响应长度:', responseText.length);
      
      // 检查响应是否为空
      if (!responseText || responseText.trim().length === 0) {
        console.error('API 返回了空响应内容');
        return {
          content: '',
          error: 'API返回了空响应。请尝试减小maxTokens参数或使用不同的模型。',
        };
      }

      // 尝试解析JSON
      try {
        // 记录原始响应的前200个字符，帮助调试
        console.log('API 原始响应前200个字符: \n' + responseText.substring(0, 200));
        
        const data = JSON.parse(responseText);
        
        // 记录API使用情况
        if (data.usage) {
          console.log('API 使用情况:', {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens
          });
        }
        
        // 提取内容
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          console.error('API响应中没有找到内容字段');
          console.log('完整响应:', JSON.stringify(data));
          return {
            content: '',
            error: 'API响应格式无效：未找到内容字段',
          };
        }
        
        console.log('原始响应内容:', content.substring(0, 200) + '...');
        
        return { content };
      } catch (parseError: unknown) {
        console.error('解析响应失败:', parseError);
        return {
          content: '',
          error: `解析API响应失败: ${parseError instanceof Error ? parseError.message : '未知错误'}。原始响应长度: ${responseText.length}`,
        };
      }
    } catch (error: unknown) {
      console.error('DeepSeek API请求失败:', error);
      
      // 处理中止错误
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          content: '',
          error: '请求超时。请尝试减小maxTokens参数或检查网络连接。',
        };
      }
      
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
        ? `${this.baseUrl}/v1/r1/chat/completions`
        : `${this.baseUrl}/v1/chat/completions`;

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
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Smart-Search-Assistant/1.0'
      },
    });

    if (!response.ok) {
      throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  protected extractContentFromChunk(chunk: any): string | null {
    return chunk.choices?.[0]?.delta?.content || null;
  }
} 