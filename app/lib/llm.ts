import { getRequiredEnvVar } from './env';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// LLM提供商类型
export type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'volc' | 'cohere' | 'siliconflow';

// 统一的LLM接口
export interface UnifiedLLM {
  chat: (params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    response_format?: { type: string };
  }) => Promise<any>;
}

/**
 * 创建LLM实例
 * @param provider LLM提供商
 * @returns 统一的LLM实例
 */
export function createLLMInstance(provider: LLMProvider): UnifiedLLM | null {
  switch (provider) {
    case 'openai': {
      const openai = new OpenAI({
        apiKey: getRequiredEnvVar('OPENAI_API_KEY'),
      });
      return {
        chat: (params) => openai.chat.completions.create(params)
      };
    }
    case 'anthropic': {
      const anthropic = new Anthropic({
        apiKey: getRequiredEnvVar('ANTHROPIC_API_KEY'),
      });
      return {
        chat: async (params) => {
          // 转换消息格式为Anthropic格式
          let systemPrompt = '';
          let userMessages = [];
          
          for (const msg of params.messages) {
            if (msg.role === 'system') {
              systemPrompt = msg.content;
            } else {
              userMessages.push(msg);
            }
          }
          
          // 构建Anthropic参数
          const anthropicParams: any = {
            model: params.model,
            max_tokens: params.max_tokens,
            temperature: params.temperature,
            stream: params.stream
          };
          
          if (systemPrompt) {
            anthropicParams.system = systemPrompt;
          }
          
          if (userMessages.length > 0) {
            anthropicParams.messages = userMessages;
          }
          
          // 调用Anthropic API
          return anthropic.messages.create(anthropicParams);
        }
      };
    }
    case 'deepseek': {
      const openai = new OpenAI({
        apiKey: getRequiredEnvVar('DEEPSEEK_API_KEY'),
        baseURL: 'https://api.deepseek.com/v1',
      });
      return {
        chat: (params) => openai.chat.completions.create(params)
      };
    }
    case 'volc': {
      const openai = new OpenAI({
        apiKey: getRequiredEnvVar('VOLC_API_KEY'),
        baseURL: 'https://api.volcengine.com/v1',
      });
      return {
        chat: (params) => openai.chat.completions.create(params)
      };
    }
    case 'cohere': {
      const openai = new OpenAI({
        apiKey: getRequiredEnvVar('COHERE_API_KEY'),
        baseURL: 'https://api.cohere.ai/v1',
      });
      return {
        chat: (params) => openai.chat.completions.create(params)
      };
    }
    case 'siliconflow': {
      const openai = new OpenAI({
        apiKey: getRequiredEnvVar('SILICONFLOW_API_KEY'),
        baseURL: 'https://api.siliconflow.cn/v1',
      });
      return {
        chat: (params) => openai.chat.completions.create(params)
      };
    }
    default:
      return null;
  }
} 