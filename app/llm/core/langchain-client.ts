import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { GenerateParams, LLMResponse, StreamChunk } from '../../types/llm';
import { LLMCoreError } from './errors';
import { LLMProviderId } from './types';

type LangChainSupportedProvider = 'deepseek' | 'siliconflow' | 'openai';

const DEFAULT_MODELS: Record<LangChainSupportedProvider, string> = {
  deepseek: 'deepseek-chat',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  openai: 'gpt-4o-mini',
};

function resolveBaseURL(provider: LangChainSupportedProvider): string | undefined {
  switch (provider) {
    case 'deepseek':
      return process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
    case 'siliconflow':
      return process.env.SILICONFLOW_API_BASE || 'https://api.siliconflow.cn/v1';
    case 'openai':
      return undefined;
    default:
      return undefined;
  }
}

function assertLangChainProvider(
  provider: LLMProviderId
): asserts provider is LangChainSupportedProvider {
  if (provider !== 'deepseek' && provider !== 'siliconflow' && provider !== 'openai') {
    throw new LLMCoreError(
      'LLM_PROVIDER_UNSUPPORTED',
      `Provider is not yet supported by LangChain adapter: ${provider}`,
      provider
    );
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

function buildModel(
  provider: LangChainSupportedProvider,
  apiKey: string,
  params: GenerateParams
): ChatOpenAI {
  const modelName = params.model || DEFAULT_MODELS[provider];
  const baseURL = resolveBaseURL(provider);

  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: params.temperature ?? 0.7,
    maxTokens: params.maxTokens ?? 2000,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

function buildMessages(params: GenerateParams): Array<SystemMessage | HumanMessage> {
  const messages: Array<SystemMessage | HumanMessage> = [];
  if (params.systemPrompt) {
    messages.push(new SystemMessage(params.systemPrompt));
  }
  messages.push(new HumanMessage(params.userPrompt));
  return messages;
}

export async function generateWithLangChain(
  provider: LLMProviderId,
  apiKey: string,
  params: GenerateParams
): Promise<LLMResponse> {
  assertLangChainProvider(provider);

  const model = buildModel(provider, apiKey, params);
  const response = await model.invoke(buildMessages(params));
  return {
    content: normalizeContent(response.content),
    error: undefined,
  };
}

export async function* generateWithLangChainStream(
  provider: LLMProviderId,
  apiKey: string,
  params: GenerateParams
): AsyncGenerator<StreamChunk, void, unknown> {
  assertLangChainProvider(provider);

  const model = buildModel(provider, apiKey, params);
  const stream = await model.stream(buildMessages(params));

  for await (const chunk of stream) {
    const content = normalizeContent(chunk.content);
    if (!content) {
      continue;
    }
    yield {
      type: 'content',
      content,
      reasoning_content: '',
    };
  }
}
