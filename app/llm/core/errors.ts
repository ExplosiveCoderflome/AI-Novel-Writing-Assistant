import { StreamChunk } from '../../types/llm';
import { LLMErrorCode, UnifiedLLMResponse, UnifiedStreamChunk } from './types';

export class LLMCoreError extends Error {
  code: LLMErrorCode;
  provider?: string;

  constructor(code: LLMErrorCode, message: string, provider?: string) {
    super(message);
    this.name = 'LLMCoreError';
    this.code = code;
    this.provider = provider;
  }
}

export function toUnifiedErrorResponse(
  error: unknown,
  provider?: string
): UnifiedLLMResponse {
  if (error instanceof LLMCoreError) {
    return {
      content: undefined,
      error: error.message,
      errorCode: error.code,
      provider: error.provider || provider,
    };
  }

  return {
    content: undefined,
    error: error instanceof Error ? error.message : 'Unknown LLM error',
    errorCode: 'LLM_INTERNAL_ERROR',
    provider,
  };
}

export function toUnifiedErrorChunk(
  error: unknown,
  provider?: string
): UnifiedStreamChunk {
  if (error instanceof LLMCoreError) {
    return {
      type: 'error',
      content: error.message,
      errorCode: error.code,
      provider: error.provider || provider,
    };
  }

  return {
    type: 'error',
    content: error instanceof Error ? error.message : 'Unknown LLM error',
    errorCode: 'LLM_INTERNAL_ERROR',
    provider,
  };
}

export function toLegacyErrorChunk(chunk: UnifiedStreamChunk): StreamChunk {
  return {
    type: 'error',
    content: chunk.content,
    reasoning_content: chunk.reasoning_content || '',
  };
}
