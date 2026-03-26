import type { BaseMessage } from "@langchain/core/messages";
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
  estimatedInputTokens: number;
}

export interface PromptInvocationMeta {
  promptId: string;
  promptVersion: string;
  taskType: TaskType;
  contextBlockIds: string[];
  estimatedInputTokens: number;
  repairUsed: boolean;
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

export interface PromptAsset<I, O, R = O> {
  id: string;
  version: string;
  taskType: TaskType;
  mode: PromptMode;
  language: PromptLanguage;
  contextPolicy: ContextPolicy;
  outputSchema?: ZodType<R>;
  render: (input: I, context: PromptRenderContext) => BaseMessage[];
  postValidate?: (output: R, input: I, context: PromptRenderContext) => O;
}

export function buildPromptAssetKey(asset: Pick<PromptAsset<unknown, unknown, unknown>, "id" | "version">): string {
  return `${asset.id}@${asset.version}`;
}
