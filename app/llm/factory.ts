import {
  ConnectionTestResult,
  GenerateParams,
  LLMModel,
  LLMResponse,
  SpeedTestResult,
  StreamChunk,
} from '../types/llm';
import {
  isProviderImplementedInCore,
  knownProviders,
  normalizeLLMConfig,
  toProviderId,
} from './core/config';
import {
  generateWithLangChain,
  generateWithLangChainStream,
} from './core/langchain-client';
import {
  LLMCoreError,
  toUnifiedErrorResponse,
} from './core/errors';
import { LLMInstanceConfig, LLMProviderId, NormalizedLLMConfig } from './core/types';
import { LLMProviderFactory, LLMProviderType } from './providers/factory';

interface LLMRuntimeProvider {
  generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  generateRecommendationStream(
    params: GenerateParams
  ): AsyncGenerator<StreamChunk, void, unknown>;
  testConnection(): Promise<ConnectionTestResult>;
  getAvailableModels(): Promise<LLMModel[]>;
  testSpeed(model: string): Promise<SpeedTestResult>;
}

export class LLMFactory {
  private static instance: LLMFactory;
  private config: NormalizedLLMConfig | null = null;
  private providerFactory: LLMProviderFactory;

  private constructor() {
    this.providerFactory = LLMProviderFactory.getInstance();
  }

  static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  setConfig(config: unknown) {
    this.config = normalizeLLMConfig(config);
  }

  private ensureConfig(): NormalizedLLMConfig {
    if (!this.config) {
      throw new LLMCoreError(
        'LLM_CONFIG_MISSING',
        'LLM config is not initialized'
      );
    }
    return this.config;
  }

  private resolveProviderId(provider?: string): LLMProviderId {
    const config = this.ensureConfig();
    const selected = provider || config.defaultProvider;
    const providerId = toProviderId(selected);

    if (!providerId) {
      throw new LLMCoreError(
        'LLM_PROVIDER_UNSUPPORTED',
        `Unsupported provider: ${selected}`,
        selected
      );
    }

    return providerId;
  }

  private async getRuntimeProvider(
    provider: string,
    apiKeyOverride?: string
  ): Promise<{ providerId: LLMProviderId; provider: LLMRuntimeProvider }> {
    const { providerId, apiKey } = await this.resolveProviderContext(
      provider,
      apiKeyOverride
    );

    if (!isProviderImplementedInCore(providerId)) {
      throw new LLMCoreError(
        'LLM_PROVIDER_UNSUPPORTED',
        `Provider is not implemented in compatibility runtime provider: ${providerId}`,
        providerId
      );
    }

    const runtimeProvider = this.providerFactory.createProvider(
      providerId as LLMProviderType,
      apiKey
    ) as unknown as LLMRuntimeProvider;

    return {
      providerId,
      provider: runtimeProvider,
    };
  }

  private async resolveProviderContext(
    provider?: string,
    apiKeyOverride?: string
  ): Promise<{
    providerId: LLMProviderId;
    apiKey: string;
    model?: string;
  }> {
    const providerId = this.resolveProviderId(provider);
    const config = this.ensureConfig();
    const providerConfig = config.providers[providerId];
    if (!providerConfig) {
      throw new LLMCoreError(
        'LLM_PROVIDER_NOT_CONFIGURED',
        `Provider is not configured: ${providerId}`,
        providerId
      );
    }

    const apiKey = apiKeyOverride || (await providerConfig.getApiKey());
    if (!apiKey) {
      throw new LLMCoreError(
        'LLM_API_KEY_MISSING',
        `Missing API key for provider: ${providerId}`,
        providerId
      );
    }

    return {
      providerId,
      apiKey,
      model: providerConfig.model,
    };
  }

  async getLLMInstance(config: LLMInstanceConfig): Promise<LLMRuntimeProvider> {
    const context = await this.resolveProviderContext(
      config.provider,
      config.apiKey
    );
    const model = config.model || context.model;
    const runtimeProvider = isProviderImplementedInCore(context.providerId)
      ? (await this.getRuntimeProvider(
          context.providerId,
          context.apiKey
        )).provider
      : null;

    return {
      generateRecommendation: (params: GenerateParams) =>
        generateWithLangChain(context.providerId, context.apiKey, {
          ...params,
          model: params.model || model,
        }),
      generateRecommendationStream: (params: GenerateParams) =>
        generateWithLangChainStream(context.providerId, context.apiKey, {
          ...params,
          model: params.model || model,
        }),
      testConnection: async () => {
        const startTime = Date.now();
        const response = await generateWithLangChain(
          context.providerId,
          context.apiKey,
          {
            userPrompt: 'Return "ok".',
            model,
            maxTokens: 16,
          }
        );
        const latency = Date.now() - startTime;
        return {
          success: !response.error,
          latency,
          error: response.error,
          apiEndpoint: 'langchain',
        };
      },
      getAvailableModels: () =>
        runtimeProvider ? runtimeProvider.getAvailableModels() : Promise.resolve([]),
      testSpeed: async (runtimeModel: string) => {
        const startTime = Date.now();
        const response = await generateWithLangChain(
          context.providerId,
          context.apiKey,
          {
            userPrompt: '请用一句话介绍你自己',
            model: runtimeModel || model,
            maxTokens: 100,
          }
        );
        const duration = Date.now() - startTime;
        return {
          success: !response.error,
          data: {
            duration,
            response: response.content || '',
            model: runtimeModel || model || '',
            error: response.error,
          },
        };
      },
    };
  }

  async generateRecommendation(
    params: GenerateParams,
    provider?: string
  ): Promise<LLMResponse> {
    try {
      const context = await this.resolveProviderContext(provider);
      return await generateWithLangChain(context.providerId, context.apiKey, {
        ...params,
        model: params.model || context.model,
      });
    } catch (error) {
      return toUnifiedErrorResponse(error, provider);
    }
  }

  async *generateRecommendationStream(
    params: GenerateParams,
    provider = 'deepseek'
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const context = await this.resolveProviderContext(provider);
      yield* generateWithLangChainStream(context.providerId, context.apiKey, {
        ...params,
        model: params.model || context.model,
      });
    } catch (error) {
      const wrapped = toUnifiedErrorResponse(error, provider);
      yield {
        type: 'error',
        content: wrapped.error || 'Unknown LLM error',
        reasoning_content: '',
      };
    }
  }

  async testConnection(provider: string): Promise<ConnectionTestResult> {
    try {
      const startTime = Date.now();
      const context = await this.resolveProviderContext(provider);
      const response = await generateWithLangChain(context.providerId, context.apiKey, {
        userPrompt: 'Return "ok".',
        model: context.model,
        maxTokens: 16,
      });
      const latency = Date.now() - startTime;

      return {
        success: !response.error,
        latency,
        error: response.error,
        apiEndpoint: 'langchain',
        generationTest: {
          success: !response.error,
          content: response.content,
          generationTime: latency,
          error: response.error,
        },
      };
    } catch (error) {
      const wrapped = toUnifiedErrorResponse(error, provider);
      return {
        success: false,
        latency: 0,
        error: wrapped.error || 'Unknown LLM error',
        apiEndpoint: '',
      };
    }
  }

  async testSpeed(provider: string, model: string): Promise<SpeedTestResult> {
    try {
      const startTime = Date.now();
      const context = await this.resolveProviderContext(provider);
      const response = await generateWithLangChain(context.providerId, context.apiKey, {
        userPrompt: '请用一句话介绍你自己',
        model,
        maxTokens: 100,
      });
      const duration = Date.now() - startTime;

      return {
        success: !response.error,
        data: {
          duration,
          response: response.content || '',
          model,
          error: response.error,
        },
      };
    } catch (error) {
      const wrapped = toUnifiedErrorResponse(error, provider);
      return {
        success: false,
        data: {
          duration: 0,
          response: '',
          model,
          error: wrapped.error || 'Unknown LLM error',
        },
      };
    }
  }

  async getAvailableModels(provider: string): Promise<LLMModel[]> {
    try {
      const llm = await this.getLLMInstance({ provider });
      return await llm.getAvailableModels();
    } catch {
      return [];
    }
  }

  getSupportedProviders(): string[] {
    return knownProviders();
  }
}
