import { LLMFactory as CoreLLMFactory } from '../../llm/factory';
import { LLMResponse } from '../../types/llm';

interface RecommendationRequest {
  prompt: string;
}

interface RecommendationResponse {
  content?: string;
  error?: string;
  stream?: ReadableStream;
}

export interface LLMDBConfig {
  providers: {
    [key: string]: {
      apiKey: string;
      isActive: boolean;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
  defaultProvider: string;
}

function normalizeLegacyConfig(config: LLMDBConfig) {
  const providers: Record<string, unknown> = {};

  for (const [provider, providerConfig] of Object.entries(config.providers || {})) {
    if (!providerConfig?.isActive) {
      continue;
    }

    providers[provider] = {
      getApiKey: async () => providerConfig.apiKey || null,
      model: providerConfig.model,
      temperature: providerConfig.temperature,
      maxTokens: providerConfig.maxTokens,
    };
  }

  return {
    defaultProvider: config.defaultProvider,
    providers,
  };
}

export default class LLMFactory {
  private static instance: LLMFactory;
  private core = CoreLLMFactory.getInstance();

  private constructor() {}

  public static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  public setConfig(config: LLMDBConfig | unknown) {
    if (
      config &&
      typeof config === 'object' &&
      'providers' in (config as Record<string, unknown>)
    ) {
      this.core.setConfig(normalizeLegacyConfig(config as LLMDBConfig));
      return;
    }

    this.core.setConfig(config);
  }

  public async generateRecommendation(
    request: RecommendationRequest,
    llmType: string
  ): Promise<RecommendationResponse> {
    if (llmType === 'deepseek') {
      const stream = new ReadableStream({
        start: async (controller) => {
          const encoder = new TextEncoder();
          try {
            const generator = this.core.generateRecommendationStream(
              { userPrompt: request.prompt },
              llmType
            );

            for await (const chunk of generator) {
              const payload = {
                choices: [
                  {
                    delta: { content: chunk.content || '' },
                    index: 0,
                    finish_reason: chunk.type === 'error' ? 'error' : null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const payload = {
              error: error instanceof Error ? error.message : 'LLM stream failed',
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            controller.close();
          }
        },
      });

      return { stream };
    }

    const response = await this.core.generateRecommendation(
      { userPrompt: request.prompt },
      llmType
    );

    return {
      content: response.content,
      error: response.error,
    };
  }

  public async *generateRecommendationStream(
    request: RecommendationRequest,
    llmType: string
  ): AsyncGenerator<string, void, unknown> {
    const stream = this.core.generateRecommendationStream(
      { userPrompt: request.prompt },
      llmType
    );

    for await (const chunk of stream) {
      if (chunk.type === 'error') {
        throw new Error(chunk.content);
      }
      yield chunk.content;
    }
  }

  public async testConnection(provider: string): Promise<boolean> {
    const result = await this.core.testConnection(provider);
    return result.success;
  }
}
