import { BaseLLM } from './base';
import { LLMResponse } from '../types/llm';

export class DeepseekLLM extends BaseLLM {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';

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
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: params.prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
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
      console.error('Deepseek API error:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
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