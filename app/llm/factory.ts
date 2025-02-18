import { LLMConfig, LLMDBConfig, llmConfig, llmConfigFromDB, LLMProviderConfig } from '../config/llm';
import { validateApiKey, getApiKey, APIKeyError } from '../../lib/api-key';
import { log } from 'console';
import { BaseLLM } from './base';
import { SiliconFlowLLM } from './siliconflow';
import { DeepseekLLM } from './deepseek';
import { LLMResponse } from '../types/llm';

interface GenerateResponse {
  content?: any;
  error: null | string;
  stream?: ReadableStream<string>;
}

interface GenerateErrorResponse {
  error: string;
  details?: unknown;
  content?: undefined;
  stream?: undefined;
}

type GenerateResult = GenerateResponse | GenerateErrorResponse;

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

export class LLMFactory {
  private static instance: LLMFactory;
  private config: LLMDBConfig | null = null;

  private constructor() {}

  static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  setConfig(config: LLMDBConfig) {
    this.config = config;
  }

  private async getApiKey(provider: string): Promise<string> {
    if (!this.config) {
      throw new Error('LLM 配置未初始化');
    }

    const providerConfig = this.config[provider as LLMProvider];
    if (!providerConfig || !('getApiKey' in providerConfig)) {
      throw new Error(`未找到 ${provider} 的配置`);
    }

    const apiKey = await providerConfig.getApiKey();
    if (!apiKey) {
      throw new Error(`未找到 ${provider} 的 API Key`);
    }

    return apiKey;
  }

  private async getLLMInstance(provider: string): Promise<BaseLLM> {
    if (!this.config) {
      throw new Error('LLM 配置未初始化');
    }

    const apiKey = await this.getApiKey(provider);
    const providerConfig = this.config[provider as LLMProvider] as LLMProviderConfig;

    switch (provider) {
      case 'siliconflow':
        return new SiliconFlowLLM(apiKey, providerConfig.model);
      case 'deepseek':
        return new DeepseekLLM(apiKey);
      default:
        throw new Error(`不支持的 LLM 提供商: ${provider}`);
    }
  }

  async generateRecommendation(params: { 
    prompt: string;
    model?: string;
  }, provider?: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const selectedProvider = provider || this.config.defaultProvider;
    console.log('LLM API 请求参数:', {
      provider: selectedProvider,
      model: params.model,
      prompt: params.prompt,
      config: this.config[selectedProvider as LLMProvider]
    });

    const apiKey = await this.getApiKey(selectedProvider);
    console.log('API Key 状态:', {
      provider: selectedProvider,
      hasKey: !!apiKey,
      keyLength: apiKey?.length
    });

    if (selectedProvider === 'deepseek') {
      const response = await this.callDeepseekAPI(params.prompt, apiKey, params.model);
      return {
        content: response.content,
        error: response.error
      };
    }

    const llm = await this.getLLMInstance(selectedProvider);
    return llm.generateRecommendation({ 
      prompt: params.prompt,
      model: params.model
    });
  }

  async testConnection(provider: string): Promise<boolean> {
    const llm = await this.getLLMInstance(provider);
    return llm.testConnection();
  }

  public async *generateRecommendationStream(
    params: { prompt: string },
    provider: 'openai' | 'anthropic' | 'deepseek' | 'cohere' = 'deepseek'
  ): AsyncGenerator<string, void, unknown> {
    try {
      let apiKey: string;

      try {
        apiKey = await getApiKey(provider);
        this.validateApiKey(apiKey, provider);
      } catch (error) {
        if (error instanceof APIKeyError) {
          throw new Error(error.message);
        }
        throw error;
      }

      const stream = await this.streamDeepseekAPI(params.prompt, apiKey);
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('生成推荐失败:', error);
      throw new Error(error instanceof Error ? error.message : '未知错误');
    }
  }

  private validateApiKey(apiKey: string | undefined, provider: string): void {
    if (!apiKey) {
      throw new Error(`未配置 ${provider} API 密钥，请在设置页面配置相应的 API 密钥`);
    }
  }

  private async callDeepseekAPI(prompt: string, apiKey: string, model?: string) {
    try {
      const requestBody = {
        model: model || this.config?.deepseek?.model || 'deepseek-chat',
        messages: [
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: this.config?.deepseek?.temperature ?? 0.7,
        max_tokens: this.config?.deepseek?.maxTokens ?? 2000,
        stream: false
      };
      
      console.log('Deepseek API 请求配置:', {
        model: requestBody.model,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        messageCount: requestBody.messages.length,
        promptLength: prompt.length,
        hasValidKey: apiKey.startsWith('sk-')
      });

      const isR1Model = requestBody.model.includes('r1');
      const apiEndpoint = isR1Model 
        ? 'https://api.deepseek.com/v1/r1/chat/completions'
        : 'https://api.deepseek.com/v1/chat/completions';

      console.log('Deepseek API 请求体:', {
        ...requestBody,
        apiEndpoint,
        isR1Model
      });
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
        },
        body: JSON.stringify(requestBody),
      });
      console.log('Deepseek API 响应状态:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepseek API 错误响应:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          headers: Object.fromEntries(response.headers.entries())
        });

        let errorMessage = `Deepseek API 错误: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch (parseError) {
          console.error('解析错误响应失败:', {
            parseError,
            originalText: errorText
          });
          errorMessage = errorText;
        }

        return {
          error: errorMessage,
          details: {
            status: response.status,
            statusText: response.statusText,
            errorText
          }
        };
      }

      const data = await response.json();
      console.log('Deepseek API 响应数据:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        firstChoice: data.choices?.[0]?.message?.content?.slice(0, 50) + '...'
      });

      return {
        content: data.choices[0]?.message?.content || null,
        error: null,
      };
    } catch (error) {
      console.error('Deepseek API 调用失败:', {
        error,
        type: typeof error,
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : undefined,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return {
        error: error instanceof Error ? error.message : 'Deepseek API 调用失败',
        details: error
      };
    }
  }

  private async callOpenAIAPI(prompt: string, apiKey: string) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.openai.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: this.config.openai.temperature,
          max_tokens: this.config.openai.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `OpenAI API 调用失败: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || null,
        error: null,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'OpenAI API 调用失败');
    }
  }

  private async callAnthropicAPI(prompt: string, apiKey: string) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: this.config.anthropic.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.config.anthropic.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `Anthropic API 调用失败: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.content || null,
        error: null,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Anthropic API 调用失败');
    }
  }

  private async callCohereAPI(prompt: string, apiKey: string) {
    try {
      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.cohere.model,
          prompt: prompt,
          max_tokens: this.config.cohere.maxTokens,
          temperature: this.config.cohere.temperature,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `Cohere API 调用失败: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.generations[0]?.text || null,
        error: null,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Cohere API 调用失败');
    }
  }

  private streamDeepseekAPI(
    prompt: string,
    apiKey: string
  ): ReadableStream<string> {
    const startTime = Date.now();
    console.log('[Deepseek] 开始流式请求');
    const config = this.config;

    return new ReadableStream({
      async start(controller) {
        const TIMEOUT_MS = 3000000;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);

        try {
          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'text/event-stream',
              'Connection': 'keep-alive'
            },
            body: JSON.stringify({
              model: config.deepseek.model || 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: config.deepseek.temperature || 0.7,
              max_tokens: config.deepseek.maxTokens || 2000,
              stream: true,
            }),
            signal: abortController.signal,
          });

          clearTimeout(timeoutId);
          console.log('[Deepseek] 请求已发送，等待响应...');
          
          if (!response.ok) {
            throw new Error(`Deepseek API 请求失败: ${response.status} ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('Deepseek API 返回空响应');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let hasReceivedContent = false;

          while (true) {
            const { done, value } = await reader.read();
            console.log('[Deepseek] 收到数据:', {
              done,
              value
            });

            if (done) {
              console.log('[Deepseek] 流式响应完成');
              if (!hasReceivedContent) {
                controller.error(new Error('未收到任何有效内容'));
              }
              break;
            }

            const chunk = decoder.decode(value);
            buffer += chunk;
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || trimmedLine.startsWith(':')) continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    hasReceivedContent = true;
                    controller.enqueue(content);
                  }
                } catch (e) {
                  console.error('[Deepseek] 解析数据块失败:', {
                    error: e,
                    data,
                    line
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error('[Deepseek] 流式请求失败:', error);
          controller.error(error);
        } finally {
          clearTimeout(timeoutId);
          controller.close();
          console.log('[Deepseek] 流式请求结束，总耗时:', Date.now() - startTime, 'ms');
        }
      }
    });
  }

  private async *streamOpenAIAPI(prompt: string, apiKey: string): AsyncGenerator<string, void, unknown> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.openai.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: this.config.openai.temperature,
          max_tokens: this.config.openai.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `OpenAI API 调用失败: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('API 返回的响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              console.error('解析流数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'OpenAI API 调用失败');
    }
  }

  private async *streamAnthropicAPI(prompt: string, apiKey: string): AsyncGenerator<string, void, unknown> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.anthropic.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.config.anthropic.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `Anthropic API 调用失败: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('API 返回的响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.delta?.text;
              if (content) {
                yield content;
              }
            } catch (e) {
              console.error('解析流数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Anthropic API 调用失败');
    }
  }

  private async *streamCohereAPI(prompt: string, apiKey: string): AsyncGenerator<string, void, unknown> {
    try {
      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: this.config.cohere.model,
          prompt: prompt,
          max_tokens: this.config.cohere.maxTokens,
          temperature: this.config.cohere.temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `Cohere API 调用失败: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('API 返回的响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.text;
              if (content) {
                yield content;
              }
            } catch (e) {
              console.error('解析流数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Cohere API 调用失败');
    }
  }

  private async fetchDeepseekModels(apiKey: string): Promise<{ id: string; object: string; owned_by: string; }[]> {
    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Deepseek 可用模型列表:', data.data);
      
      return data.data;
    } catch (error) {
      console.error('获取 Deepseek 模型列表失败:', error);
      throw error;
    }
  }

  async getAvailableModels(provider: string): Promise<{ id: string; object: string; owned_by: string; }[]> {
    if (!this.config) {
      throw new Error('LLM 配置未初始化');
    }

    const apiKey = await this.getApiKey(provider);

    switch (provider) {
      case 'deepseek':
        return this.fetchDeepseekModels(apiKey);
      default:
        throw new Error(`不支持的 LLM 提供商: ${provider}`);
    }
  }
} 