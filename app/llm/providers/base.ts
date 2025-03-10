/*
 * @LastEditors: biz
 */
import { LLMResponse, StreamChunk, GenerateParams, LLMModel, ConnectionTestResult, SpeedTestResult } from '../../types/llm';

export interface LLMProviderInterface {
  generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown>;
  testConnection(): Promise<ConnectionTestResult>;
  testSpeed(model: string): Promise<SpeedTestResult>;
  getAvailableModels(): Promise<LLMModel[]>;
}

export abstract class BaseLLMProvider implements LLMProviderInterface {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    if (!apiKey) {
      throw new Error('API Key is required');
    }
    if (!baseUrl) {
      throw new Error('Base URL is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    console.log(`[Base Provider] 初始化Provider - API Key: ${apiKey ? '已设置' : '未设置'}, Base URL: ${baseUrl}`);
  }

  protected validateApiKey(): void {
    if (!this.apiKey) {
      throw new Error('API Key is not set');
    }
    
    // 检查API key是否只包含空白字符
    if (this.apiKey.trim().length === 0) {
      throw new Error('API Key cannot be empty');
    }

    // 检查API key是否包含非法字符
    if (/[\s<>{}[\]|\\\/]/.test(this.apiKey)) {
      throw new Error('API Key contains invalid characters');
    }

    // 检查API key的最小长度
    if (this.apiKey.length < 8) {
      throw new Error('API Key is too short');
    }
  }

  protected validateProviderApiKey(provider: string): void {
    // 针对不同的provider进行特定验证
    switch (provider) {
      case 'deepseek':
        if (!this.apiKey.startsWith('sk-')) {
          throw new Error('Deepseek API Key must start with "sk-"');
        }
        break;
      case 'siliconflow':
        if (!this.apiKey.startsWith('sf-')) {
          throw new Error('SiliconFlow API Key must start with "sf-"');
        }
        break;
    }
  }

  abstract generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  abstract generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown>;
  abstract getAvailableModels(): Promise<LLMModel[]>;

  protected validateGeneratedContent(content: string | undefined): boolean {
    if (!content) return false;
    // 检查内容是否为空或只包含空白字符
    if (content.trim().length === 0) return false;
    // 检查内容是否包含有意义的文本（至少包含一些中文字符）
    const hasChinese = /[\u4e00-\u9fa5]/.test(content);
    return hasChinese;
  }

  async testSpeed(model: string): Promise<SpeedTestResult> {
    const startTime = Date.now();
    try {
      console.log(`开始测试模型 ${model} 的生成速度...`);
      
      const testPrompt =`你是谁`;
      console.log(`发送测试提示: ${testPrompt}`);

      const result = await this.generateRecommendation({
        userPrompt: testPrompt,
        model: model,
        temperature: 0.7,
        maxTokens: 100
      });

      const duration = Date.now() - startTime;
      console.log(`收到响应，耗时: ${duration}ms`);
      console.log(`响应内容: ${result.content}`);

      // 验证生成的内容
      const isValidContent = this.validateGeneratedContent(result.content);
      console.log(`内容验证: ${isValidContent ? '有效' : '无效'}`);

      if (result.error || !isValidContent) {
        const errorMessage = result.error || '生成的内容无效';
        console.error(`测试失败: ${errorMessage}`);
        return {
          success: false,
          data: {
            duration,
            response: result.content || '',
            model,
            error: errorMessage
          }
        };
      }

      console.log('测试成功完成');
      return {
        success: true,
        data: {
          duration,
          response: result.content || '',
          model
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`测试发生错误:`, error);
      return {
        success: false,
        data: {
          duration,
          response: '',
          model,
          error: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // 1. 测试获取模型列表的延迟
      const models = await this.getAvailableModels();
      const latency = Date.now() - startTime;

      // 2. 测试生成速度
      const generationStartTime = Date.now();
      const testPrompt = "请用一句话介绍你自己。";
      const generationResult = await this.generateRecommendation({
        userPrompt: testPrompt,
        model: models[0]?.id, // 使用第一个可用的模型
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

  protected async handleStreamResponse(
    response: Response,
    onContent: (content: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API 错误: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorText;
      }
      onError(errorMessage);
      return;
    }

    if (!response.body) {
      onError('API 返回空响应');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = this.extractContentFromChunk(parsed);
              if (content) {
                onContent(content);
              }
            } catch (e) {
              console.error('解析数据块失败:', e);
            }
          }
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '未知错误');
    }
  }

  protected abstract extractContentFromChunk(chunk: any): string | null;
} 