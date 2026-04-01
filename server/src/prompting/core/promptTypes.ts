import type { BaseMessage, BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ZodType } from "zod";
import type { TaskType } from "../../llm/modelRouter";

export type PromptMode = "structured" | "text";
export type PromptLanguage = "zh" | "en";

export interface PromptContextBlock {
  id: string;
  group: string;
  priority: number;
  required: boolean;
  estimatedTokens: number;
  content: string;
  conflictGroup?: string;
  freshness?: number;
  allowSummary?: boolean;
}

export interface ContextPolicy {
  maxTokensBudget: number;
  requiredGroups?: string[];
  preferredGroups?: string[];
  dropOrder?: string[];
}

export interface PromptRenderContext {
  blocks: PromptContextBlock[];
  selectedBlockIds: string[];
  droppedBlockIds: string[];
  summarizedBlockIds: string[];
  estimatedInputTokens: number;
}

export interface PromptInvocationMeta {
  promptId: string;
  promptVersion: string;
  taskType: TaskType;
  contextBlockIds: string[];
  droppedContextBlockIds: string[];
  summarizedContextBlockIds: string[];
  estimatedInputTokens: number;
  repairUsed: boolean;
  repairAttempts: number;
  semanticRetryUsed: boolean;
  semanticRetryAttempts: number;
}

export interface PromptExecutionOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PromptExecutionMeta {
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  invocation: PromptInvocationMeta;
}

export interface PromptRunResult<T> {
  output: T;
  meta: PromptExecutionMeta;
  context: PromptRenderContext;
}

export interface PromptStreamRunResult<T> {
  stream: AsyncIterable<BaseMessageChunk>;
  complete: Promise<PromptRunResult<T>>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
}

export interface PromptRepairPolicy {
  maxAttempts: number;
}

export interface PromptSemanticRetryBuildInput<I, R> {
  promptId: string;
  promptVersion: string;
  attempt: number;
  promptInput: I;
  context: PromptRenderContext;
  baseMessages: BaseMessage[];
  parsedOutput: R;
  validationError: string;
}

export interface PromptSemanticRetryPolicy<I, R> {
  maxAttempts: number;
  buildMessages?: (input: PromptSemanticRetryBuildInput<I, R>) => BaseMessage[];
}

export type PromptStructuredOutputExampleBuilder<I, R> = (input: I, context: PromptRenderContext) => unknown;

export interface PromptStructuredOutputHint<I, R> {
  mode?: "auto" | "off";
  example?: unknown | PromptStructuredOutputExampleBuilder<I, R>;
  note?: string | ((input: I, context: PromptRenderContext) => string | undefined);
}

export interface PromptAsset<I, O, R = O> {
  id: string;
  version: string;
  taskType: TaskType;
  mode: PromptMode;
  language: PromptLanguage;
  contextPolicy: ContextPolicy;
  repairPolicy?: PromptRepairPolicy;
  semanticRetryPolicy?: PromptSemanticRetryPolicy<I, R>;
  outputSchema?: ZodType<R>;
  structuredOutputHint?: PromptStructuredOutputHint<I, R>;
  render: (input: I, context: PromptRenderContext) => BaseMessage[];
  postValidate?: (output: R, input: I, context: PromptRenderContext) => O;
}

export function buildPromptAssetKey(asset: Pick<PromptAsset<unknown, unknown, unknown>, "id" | "version">): string {
  return `${asset.id}@${asset.version}`;
}
