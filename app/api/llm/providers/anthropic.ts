import { LLMProvider, LLMRequest, LLMResponse } from '../types';
import axios from 'axios';

class AnthropicProvider {
  private config: LLMProvider;

  constructor(config: LLMProvider) {
    this.config = config;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/v1/complete`,
        {
          prompt: request.prompt,
          max_tokens_to_sample: request.maxTokens || 1000,
          temperature: request.temperature || 0.7,
          model: 'claude-2',
        },
        {
          headers: {
            'X-API-Key': this.config.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        content: response.data.completion,
      };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

export default AnthropicProvider; 