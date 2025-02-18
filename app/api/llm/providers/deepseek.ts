import { LLMProvider, LLMRequest, LLMResponse } from '../types';
import axios from 'axios';

class DeepseekProvider {
  private config: LLMProvider;

  constructor(config: LLMProvider) {
    this.config = config;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/v1/chat/completions`,
        {
          model: 'deepseek-reasoner',
          messages: [
            {
              role: 'user',
              content: request.prompt,
            },
          ],
          max_tokens: request.maxTokens || 1000,
          temperature: request.temperature || 0.7,
          stream: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        content: response.data.choices[0].message.content,
      };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

export default DeepseekProvider; 