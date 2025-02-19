/*
 * @LastEditors: biz
 */
import { LLMDBConfig, llmConfigFromDB } from '../../config/llm';
import { validateApiKey, getApiKey, APIKeyError } from '../../../lib/api-key';
import { BaseLLM } from './base';
import { SiliconFlowLLM } from './siliconflow';
import { LLMResponse } from './types';

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
    };
  };
  defaultProvider: string;
}

export default class LLMFactory {
  private static instance: LLMFactory;
  private config: LLMDBConfig | null = null;

  private constructor() {}

  public static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  public setConfig(config: LLMDBConfig) {
    this.config = config;
  }

  private getLLMInstance(provider: string): BaseLLM {
    if (!this.config) {
      throw new Error('LLM配置未初始化');
    }

    const providerConfig = this.config.providers[provider];
    if (!providerConfig || !providerConfig.isActive) {
      throw new Error(`提供商 ${provider} 未配置或未激活`);
    }

    switch (provider) {
      case 'siliconflow':
        return new SiliconFlowLLM(providerConfig.apiKey);
      default:
        throw new Error(`不支持的提供商: ${provider}`);
    }
  }

  public async generateRecommendation(
    params: { prompt: string },
    provider?: string
  ): Promise<LLMResponse> {
    try {
      const selectedProvider = provider || this.config?.defaultProvider;
      if (!selectedProvider) {
        throw new Error('未指定 LLM 提供商');
      }

      const llm = this.getLLMInstance(selectedProvider);
      return await llm.generateRecommendation(params);
    } catch (error) {
      console.error('生成推荐失败:', error);
      return {
        content: undefined,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  public async testConnection(provider: string): Promise<boolean> {
    try {
      const llm = this.getLLMInstance(provider);
      return await llm.testConnection();
    } catch (error) {
      return false;
    }
  }

  private async validateApiKeyFromDB(provider: string): Promise<string> {
    try {
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        throw new Error(`未配置 ${provider} API 密钥`);
      }
      
      // 验证 Deepseek API Key 格式
      if (provider === 'deepseek' && !apiKey.startsWith('sk-')) {
        throw new Error('Deepseek API Key 格式错误，必须以 sk- 开头');
      }
      
      return apiKey;
    } catch (error) {
      throw new Error(`获取 ${provider} API 密钥失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async callDeepseekAPI(prompt: string): Promise<RecommendationResponse> {
    try {
      const apiKey = await this.validateApiKeyFromDB('deepseek');
      console.log('开始调用 Deepseek API...');
      console.log('提示词内容:', prompt);
      
      // // 确保 API Key 格式正确
      // if (!apiKey.startsWith('sk-')) {
      //   console.error('API Key 格式错误:', { apiKey: apiKey.slice(0, 5) + '...' });
      //   return {
      //     error: 'Deepseek API Key 格式错误：API Key 必须以 sk- 开头'
      //   };
      // }

      const requestBody = {
        model: this.config.deepseek.model || 'deepseek-chat',
        messages: [
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: this.config.deepseek.temperature,
        max_tokens: this.config.deepseek.maxTokens,
        stream: false
      };
      
      console.log('请求配置:', {
        ...requestBody,
        auth_type: 'Bearer Token',
        api_key_format: apiKey.startsWith('sk-') ? '正确' : '错误'
      });
      
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Smart-Search-Assistant/1.0'
        },
        body: JSON.stringify(requestBody),
      });

      console.log('收到响应:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      // 获取原始响应文本
      const responseText = await response.text();
      console.log('响应原文:', responseText);

      if (!response.ok) {
        // 尝试解析错误响应
        let errorMessage = responseText;
        
        // 特殊处理认证失败的情况
        if (response.status === 401) {
          if (responseText.includes('Authentication Fails') || 
              responseText.includes('auth header format should be Bearer')) {
            return {
              error: '认证失败：API Key 格式不正确。请确保：\n' +
                    '1. API Key 以 sk- 开头\n' +
                    '2. API Key 完整且有效\n' +
                    '3. API Key 已正确保存在数据库中'
            };
          }
          return {
            error: `认证失败: ${errorMessage}`
          };
        }
        
        // 尝试解析 JSON 格式的错误信息
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          console.error('解析错误响应失败:', e);
          // 如果不是 JSON 格式，使用原始错误文本
        }
        
        return {
          error: `API 调用失败 (${response.status}): ${errorMessage}`
        };
      }

      // 尝试解析成功响应
      try {
        const data = JSON.parse(responseText);
        console.log('API 响应数据:', data);
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          return {
            error: 'Deepseek API 返回的数据格式无效'
          };
        }

        const content = data.choices[0]?.message?.content;
        if (!content) {
          return {
            error: 'Deepseek API 返回的响应内容为空'
          };
        }

        return { content };
      } catch (e) {
        console.error('解析响应数据失败:', e);
        return {
          error: '解析 API 响应失败：' + (e instanceof Error ? e.message : '未知错误')
        };
      }
    } catch (error) {
      console.error('Deepseek API error:', error);
      return { 
        error: error instanceof Error 
          ? error.message 
          : '调用 Deepseek API 失败'
      };
    }
  }

  private async callOpenAIAPI(prompt: string): Promise<RecommendationResponse> {
    try {
      const apiKey = await this.validateApiKeyFromDB('openai');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: this.config.openai.model,
          temperature: this.config.openai.temperature,
          max_tokens: this.config.openai.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `OpenAI API 返回错误: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('OpenAI API 返回的数据格式无效');
      }

      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI API 返回的响应内容为空');
      }

      return { content };
    } catch (error) {
      console.error('OpenAI API error:', error);
      return { 
        error: error instanceof Error 
          ? error.message 
          : '调用 OpenAI API 失败'
      };
    }
  }

  private async callAnthropicAPI(prompt: string): Promise<RecommendationResponse> {
    try {
      const apiKey = await this.validateApiKeyFromDB('anthropic');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: this.config.anthropic.model,
          max_tokens: this.config.anthropic.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Anthropic API 返回错误: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        throw new Error('Anthropic API 返回的数据格式无效');
      }

      const content = data.content[0]?.text;
      if (!content) {
        throw new Error('Anthropic API 返回的响应内容为空');
      }

      return { content };
    } catch (error) {
      console.error('Anthropic API error:', error);
      return { 
        error: error instanceof Error 
          ? error.message 
          : '调用 Anthropic API 失败'
      };
    }
  }

  private async callCohereAPI(prompt: string): Promise<RecommendationResponse> {
    try {
      const apiKey = await this.validateApiKeyFromDB('cohere');

      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          model: this.config.cohere.model,
          max_tokens: this.config.cohere.maxTokens,
          temperature: this.config.cohere.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Cohere API 返回错误: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.generations || !Array.isArray(data.generations) || data.generations.length === 0) {
        throw new Error('Cohere API 返回的数据格式无效');
      }

      const content = data.generations[0]?.text;
      if (!content) {
        throw new Error('Cohere API 返回的响应内容为空');
      }

      return { content };
    } catch (error) {
      console.error('Cohere API error:', error);
      return { 
        error: error instanceof Error 
          ? error.message 
          : '调用 Cohere API 失败'
      };
    }
  }

  private async callVolcAPI(prompt: string): Promise<RecommendationResponse> {
    try {
      const apiKey = await this.validateApiKeyFromDB('volc');

      const response = await fetch('/api/volc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'ep-20250207172005-m7t56',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP 错误: ${response.status} ${response.statusText}`;
        console.error('Volc API error details:', errorData);
        throw new Error(`Volc API 返回错误: ${errorMessage}`);
      }

      const data = await response.json();
      
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Volc API 返回的数据格式无效');
      }

      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Volc API 返回的响应内容为空');
      }

      return { content };
    } catch (error) {
      console.error('Volc API error:', error);
      return { 
        error: error instanceof Error 
          ? error.message 
          : '调用 Volc API 失败'
      };
    }
  }

  private async *streamDeepseekAPI(prompt: string): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    let chunkCount = 0;
    let totalBytes = 0;
    const TIMEOUT_MS = 1800000; // 30分钟超时
    const MAX_RETRIES = 3;    // 最大重试次数
    let retryCount = 0;
    
    try {
      const apiKey = await this.validateApiKeyFromDB('deepseek');
      console.log('[Deepseek Stream] 开始流式调用，时间:', new Date().toISOString());
      
      const requestBody = {
        model: this.config.deepseek.model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.deepseek.temperature,
        max_tokens: this.config.deepseek.maxTokens,
        stream: true
      };

      console.log('[Deepseek Stream] 请求配置:', {
        model: requestBody.model,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        stream: requestBody.stream,
        promptLength: prompt.length
      });

      while (retryCount < MAX_RETRIES) {
        try {
          console.log(`[Deepseek Stream] 尝试请求 #${retryCount + 1}`);
          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'text/event-stream',
              'User-Agent': 'Smart-Search-Assistant/1.0',
              'Connection': 'keep-alive'
            },
            body: JSON.stringify(requestBody),
          });

          console.log('[Deepseek Stream] 响应状态:', {
            status: response.status,
            statusText: response.statusText,
            type: response.type,
            bodyUsed: response.bodyUsed
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error('响应体为空');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let isFirstChunk = true;
          let lastChunkTime = Date.now();

          try {
            while (true) {
              // 检查是否超时
              if (Date.now() - lastChunkTime > TIMEOUT_MS) {
                throw new Error(`接收数据超时 (${TIMEOUT_MS}ms)`);
              }

              const { done, value } = await reader.read();
              
              if (done) {
                const duration = Date.now() - startTime;
                console.log('[Deepseek Stream] 流式响应统计:', {
                  totalChunks: chunkCount,
                  totalBytes: totalBytes,
                  averageChunkSize: totalBytes / (chunkCount || 1),
                  totalDurationMs: duration,
                  averageChunkTimeMs: duration / (chunkCount || 1)
                });
                break;
              }

              lastChunkTime = Date.now();
              chunkCount++;
              totalBytes += value?.length || 0;

              const chunk = decoder.decode(value);
              console.log(`[Deepseek Stream] 收到数据块 #${chunkCount}:`, {
                rawLength: chunk.length,
                rawContent: JSON.stringify(chunk),
                byteLength: value?.length,
                isKeepAlive: chunk.includes(': keep-alive'),
                timeSinceStart: Date.now() - startTime
              });
              
              // 跳过心跳消息
              if (chunk.includes(': keep-alive')) {
                console.log(`[Deepseek Stream] 跳过心跳消息 #${chunkCount}`);
                continue;
              }
              
              buffer += chunk;
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() === '') continue;
                
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  
                  if (!data || data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    
                    if (content) {
                      if (isFirstChunk) {
                        isFirstChunk = false;
                        yield content.trimStart();
                      } else {
                        yield content;
                      }
                    }
                  } catch (e) {
                    console.error('[Deepseek Stream] 解析失败:', {
                      error: e,
                      rawData: data
                    });
                  }
                }
              }
            }
            
            // 如果成功完成，跳出重试循环
            break;
            
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          console.error(`[Deepseek Stream] 请求失败 #${retryCount + 1}:`, error);
          retryCount++;
          
          if (retryCount >= MAX_RETRIES) {
            throw new Error(`达到最大重试次数 (${MAX_RETRIES}): ${error.message}`);
          }
          
          // 等待后重试
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          console.log(`[Deepseek Stream] 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (error) {
      console.error('[Deepseek Stream] 调用失败:', {
        error,
        retryCount,
        timeElapsed: Date.now() - startTime,
        chunksProcessed: chunkCount
      });
      throw error;
    }
  }

  public async generateRecommendation(
    request: RecommendationRequest,
    llmType: string
  ): Promise<RecommendationResponse> {
    if (!this.config) {
      return { error: '未设置 LLM 配置' };
    }

    console.log(`[generateRecommendation] 开始处理 ${llmType} 请求`);

    switch (llmType) {
      case 'volc':
        return this.callVolcAPI(request.prompt);
      case 'deepseek': {
        console.log('[Deepseek] 使用流式响应模式');
        try {
          const stream = new ReadableStream({
            async start(controller) {
              try {
                console.log('[Deepseek Stream] 开始创建流');
                const factory = LLMFactory.getInstance();
                let isFirstChunk = true;
                let accumulatedContent = '';

                for await (const chunk of factory.streamDeepseekAPI(request.prompt)) {
                  if (!chunk) continue;

                  accumulatedContent += chunk;
                  console.log('[Deepseek Stream] 收到数据块:', {
                    chunkLength: chunk.length,
                    totalLength: accumulatedContent.length,
                    preview: chunk.slice(0, 50)
                  });

                  // 构建标准的 SSE 消息格式
                  const message = {
                    choices: [{
                      delta: { content: chunk },
                      index: 0,
                      finish_reason: null
                    }]
                  };

                  if (isFirstChunk) {
                    console.log('[Deepseek Stream] 发送首个数据块');
                    isFirstChunk = false;
                  }

                  // 发送数据块
                  const messageStr = `data: ${JSON.stringify(message)}\n\n`;
                  controller.enqueue(new TextEncoder().encode(messageStr));
                }

                if (accumulatedContent) {
                  console.log('[Deepseek Stream] 数据发送完成，内容总长度:', accumulatedContent.length);
                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                } else {
                  console.warn('[Deepseek Stream] 未收到任何内容');
                  const errorMessage = {
                    error: '生成内容为空',
                    type: 'error',
                    details: '未能生成有效内容'
                  };
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
                }
                controller.close();
              } catch (error) {
                console.error('[Deepseek Stream] 流处理错误:', {
                  error,
                  message: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined
                });
                const errorMessage = {
                  error: error instanceof Error ? error.message : '流处理失败',
                  type: 'error',
                  details: error instanceof Error ? error.stack : undefined
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
                controller.close();
              }
            }
          });
          console.log('[Deepseek] 成功创建流，返回响应');
          return { stream };
        } catch (error) {
          console.error('[Deepseek] 创建流失败:', {
            error,
            message: error instanceof Error ? error.message : String(error)
          });
          return { error: error instanceof Error ? error.message : '调用 Deepseek API 失败' };
        }
      }
      case 'openai':
        return this.callOpenAIAPI(request.prompt);
      case 'anthropic':
        return this.callAnthropicAPI(request.prompt);
      case 'cohere':
        return this.callCohereAPI(request.prompt);
      default:
        return { error: '不支持的 LLM 类型' };
    }
  }

  public async *generateRecommendationStream(
    request: RecommendationRequest,
    llmType: string
  ): AsyncGenerator<string, void, unknown> {
    console.log(`[Stream] 开始处理 ${llmType} 流式请求`);
    
    if (!this.config) {
      throw new Error('未设置 LLM 配置');
    }

    try {
      console.log('[Stream] 调用 generateRecommendation');
      const response = await this.generateRecommendation(request, llmType);
      
      if (response.error) {
        console.error('[Stream] 收到错误响应:', response.error);
        throw new Error(response.error);
      }

      if (!response.stream) {
        console.log('[Stream] 非流式响应，直接返回内容');
        yield response.content || '';
        return;
      }

      console.log('[Stream] 开始处理流式响应');
      const reader = response.stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[Stream] 流式响应完成');
          break;
        }

        const chunk = decoder.decode(value);
        console.log('[Stream] 收到原始数据块:', chunk);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('[Stream] 收到结束标记');
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                console.log('[Stream] 解析出内容:', content);
                yield content;
              }
            } catch (e) {
              console.warn('[Stream] 解析数据块失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Stream] 流式处理发生错误:', error);
      throw error;
    }
  }
} 