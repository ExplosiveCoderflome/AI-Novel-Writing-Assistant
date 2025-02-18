import { BaseLLM } from './base';
import { LLMResponse } from './types';

export class SiliconFlowLLM extends BaseLLM {
  private apiKey: string;
  private baseUrl: string = 'https://api.siliconflow.cn/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generateRecommendation(params: { prompt: string }): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'silicon-copilot-v1',
          messages: [
            {
              role: 'user',
              content: params.prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 0.95,
          frequency_penalty: 0,
          presence_penalty: 0,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '请求失败');
      }

      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        error: undefined,
      };
    } catch (error) {
      console.error('硅基流动 API 调用失败:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.generateRecommendation({
        prompt: '这是一个API连通性测试。请回复：连接成功。',
      });
      return response.content?.includes('连接成功') || false;
    } catch (error) {
      return false;
    }
  }
} 