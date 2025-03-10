/*
 * @LastEditors: biz
 */
import { LLMResponse, GenerateParams, StreamChunk } from '../../app/types/llm';
import { BaseLLM } from '../llm/base';

// LangChain特有的流响应类型
export interface LangChainStreamChunk extends StreamChunk {
  isToolCall?: boolean;
  toolCallId?: string;
  toolName?: string;
  toolParams?: Record<string, any>;
  toolResults?: string;
}

// LangChain模型配置接口
export interface LangChainModelConfig {
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  verbose?: boolean;
  callbacks?: any[];
}

// LangChain请求参数
export interface LangChainGenerateParams extends GenerateParams {
  tools?: any[];
  toolChoice?: string | { type: string; function?: { name: string } };
  responseFormat?: { type: string };
}

// 对话历史消息
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
  name?: string;
  toolCallId?: string;
  toolName?: string;
  toolResults?: string;
}

// 对话模型选项
export interface ChatModelOptions {
  history?: ChatMessage[];
  streaming?: boolean;
  tools?: any[];
  toolChoice?: string | object;
  responseFormat?: { type: string };
}

// LangChain工厂配置
export interface LangChainFactoryConfig {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
} 