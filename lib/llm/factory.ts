import { LLMFactory as AppLLMFactory } from '../../app/llm/factory';
import { LLMResponse } from '../../app/types/llm';

interface LLMConfig {
  provider: string;
  apiKey?: string;
  model?: string;
}

export class LLMFactory {
  private static instance: LLMFactory;
  private core = AppLLMFactory.getInstance();

  private constructor() {}

  public static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  public setConfig(config: unknown) {
    this.core.setConfig(config);
  }

  public async getLLMInstance(config: LLMConfig) {
    return this.core.getLLMInstance(config);
  }

  public async generateRecommendation(
    params: { prompt: string },
    provider?: string
  ): Promise<LLMResponse> {
    return this.core.generateRecommendation(
      {
        userPrompt: params.prompt,
      },
      provider
    );
  }

  public async generateCharacterTemplate(
    genreName: string,
    genreDescription: string,
    provider?: string
  ): Promise<unknown> {
    const prompt = `请为"${genreName}"类型小说生成角色模板。\n类型描述：${genreDescription}\n请仅返回 JSON。`;
    const response = await this.core.generateRecommendation(
      {
        userPrompt: prompt,
      },
      provider
    );

    if (response.error || !response.content) {
      throw new Error(response.error || 'Empty template response');
    }

    const cleanContent = response.content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/, '')
      .trim();

    return JSON.parse(cleanContent);
  }

  public async testConnection(provider: string): Promise<boolean> {
    const result = await this.core.testConnection(provider);
    return result.success;
  }

  public static create(provider: string, model?: string) {
    return {
      generate: async (prompt: string) => {
        const factory = LLMFactory.getInstance();
        const llm = await factory.getLLMInstance({ provider, model });
        const response = await llm.generateRecommendation({
          userPrompt: prompt,
          model,
        });

        if (response.error || !response.content) {
          throw new Error(response.error || 'LLM returned empty response');
        }

        return response.content;
      },
    };
  }
}
