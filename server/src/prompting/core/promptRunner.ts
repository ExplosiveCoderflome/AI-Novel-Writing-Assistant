import { HumanMessage, type BaseMessage, type BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getLLM, getResolvedLLMClientOptionsFromInstance } from "../../llm/factory";
import {
  invokeStructuredLlmDetailed,
  parseStructuredLlmRawContentDetailed,
  type StructuredInvokeResult,
} from "../../llm/structuredInvoke";
import {
  buildStructuredResponseFormat,
  resolveStructuredOutputProfile,
  selectStructuredOutputStrategy,
} from "../../llm/structuredOutput";
import {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
  type LlmTokenUsageSnapshot,
} from "../../llm/usageTracking";
import { logMemoryUsage } from "../../runtime/memoryTelemetry";
import { toText } from "../../services/novel/novelP0Utils";
import { beginLlmLiveSession } from "../../platform/llm/live/llmLiveSession";
import { hasRegisteredPromptAsset } from "../registry";
import { CUSTOM_SLOT_CONTEXT_GROUP } from "../slots/slotResolution";
import { promptSlotOverrideService } from "../slots/PromptSlotOverrideService";
import { resolveAdvancedTextPromptMessages } from "../templates/templateRuntime";
import { selectContextBlocks } from "./contextSelection";
import {
  recordPromptQualityEvent,
  type PromptQualityFailureKind,
} from "./promptQualityTelemetry";
import { appendStructuredOutputHintMessages } from "./structuredOutputHint";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptInvocationMeta,
  PromptRenderContext,
  PromptRunResult,
  PromptStreamRunResult,
} from "./promptTypes";

type PromptRunnerLLMFactory = typeof getLLM;
type PromptRunnerStructuredInvoker = typeof invokeStructuredLlmDetailed;

let promptRunnerLLMFactory: PromptRunnerLLMFactory = getLLM;
let promptRunnerStructuredInvoker: PromptRunnerStructuredInvoker = invokeStructuredLlmDetailed;

function buildRenderContext(
  asset: PromptAsset<unknown, unknown, unknown>,
  rawBlocks: Parameters<typeof selectContextBlocks>[0],
  resolvedSlots?: import("../slots/slotTypes").ResolvedSlots,
): PromptRenderContext {
  const selection = selectContextBlocks(rawBlocks, asset.contextPolicy);
  return {
    blocks: selection.selectedBlocks,
    selectedBlockIds: selection.selectedBlocks.map((block) => block.id),
    droppedBlockIds: selection.droppedBlockIds,
    summarizedBlockIds: selection.summarizedBlockIds,
    estimatedInputTokens: selection.estimatedTokens,
    slots: resolvedSlots,
  };
}

function assertRegistered(asset: PromptAsset<unknown, unknown, unknown>): void {
  if (!hasRegisteredPromptAsset(asset.id, asset.version)) {
    throw new Error(`Prompt asset is not registered: ${asset.id}@${asset.version}`);
  }
}

function buildPromptInvocationMeta(
  asset: PromptAsset<unknown, unknown, unknown>,
  context: PromptRenderContext,
  repairUsed: boolean,
  repairAttempts: number,
  semanticRetryUsed: boolean,
  semanticRetryAttempts: number,
  options?: PromptExecutionOptions,
): PromptInvocationMeta {
  return {
    promptId: asset.id,
    promptVersion: asset.version,
    taskType: asset.taskType,
    novelId: options?.novelId,
    chapterId: options?.chapterId,
    volumeId: options?.volumeId,
    taskId: options?.taskId,
    stage: options?.stage,
    itemKey: options?.itemKey,
    scope: options?.scope,
    entrypoint: options?.entrypoint,
    sceneIndex: options?.sceneIndex,
    roundIndex: options?.roundIndex,
    triggerReason: options?.triggerReason,
    contextBlockIds: context.selectedBlockIds,
    droppedContextBlockIds: context.droppedBlockIds,
    summarizedContextBlockIds: context.summarizedBlockIds,
    customAddendumBlockIds: context.selectedBlockIds.filter((id) => id.startsWith(`${CUSTOM_SLOT_CONTEXT_GROUP}:`)),
    estimatedInputTokens: context.estimatedInputTokens,
    repairUsed,
    repairAttempts,
    semanticRetryUsed,
    semanticRetryAttempts,
  };
}

async function resolvePromptOverlaysForAsset(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<{
  blocks: Parameters<typeof selectContextBlocks>[0];
  resolvedSlots?: import("../slots/slotTypes").ResolvedSlots;
}> {
  const baseBlocks = input.contextBlocks ?? [];
  const slotDefs = input.asset.slots;
  if (!slotDefs || slotDefs.length === 0) {
    return { blocks: baseBlocks };
  }

  const overlays = await promptSlotOverrideService.resolveForRuntime({
    promptId: input.asset.id,
    novelId: input.options?.novelId,
  });

  const allBlocks = overlays.appendBlocks.length > 0
    ? [...baseBlocks, ...overlays.appendBlocks]
    : baseBlocks;

  return { blocks: allBlocks, resolvedSlots: overlays.inlineSlots };
}

function resolveStructuredRepairAttempts(asset: PromptAsset<unknown, unknown, unknown>): number {
  return Math.max(0, asset.repairPolicy?.maxAttempts ?? 1);
}

function resolveStructuredSemanticRetryAttempts(asset: PromptAsset<unknown, unknown, unknown>): number {
  return Math.max(0, asset.semanticRetryPolicy?.maxAttempts ?? 0);
}

function stringifyPromptError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return String(error);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function buildPromptCallOptions(options?: PromptExecutionOptions): Record<string, unknown> {
  const callOptions: Record<string, unknown> = {};
  if (options?.signal) {
    callOptions.signal = options.signal;
  }
  return callOptions;
}

function estimateRenderedPromptChars(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + toText(message.content).length, 0);
}

function estimateOutputChars(output: unknown): number {
  if (typeof output === "string") {
    return output.length;
  }
  return safeJsonStringify(output).length;
}

function isPromptOutputEmpty(output: unknown): boolean {
  return typeof output === "string" && output.trim().length === 0;
}

function markPromptQualityFailure(error: unknown, failureKind: PromptQualityFailureKind): unknown {
  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, "promptQualityFailureKind", {
        value: failureKind,
        configurable: true,
      });
    } catch {
      // Ignore non-extensible errors.
    }
  }
  return error;
}

function classifyPromptQualityFailure(error: unknown): PromptQualityFailureKind {
  const marked = error as { promptQualityFailureKind?: unknown };
  if (
    marked
    && typeof marked === "object"
    && (
      marked.promptQualityFailureKind === "llm_error"
      || marked.promptQualityFailureKind === "schema_repair_failed"
      || marked.promptQualityFailureKind === "post_validate_failed"
      || marked.promptQualityFailureKind === "empty_output"
      || marked.promptQualityFailureKind === "unknown"
    )
  ) {
    return marked.promptQualityFailureKind;
  }
  const message = stringifyPromptError(error).toLowerCase();
  if (message.includes("schema") || message.includes("json") || message.includes("zod") || message.includes("structured")) {
    return "schema_repair_failed";
  }
  if (message.includes("postvalidate") || message.includes("semantic")) {
    return "post_validate_failed";
  }
  return "llm_error";
}

function buildDefaultSemanticRetryMessages<I, R>(input: {
  baseMessages: BaseMessage[];
  attempt: number;
  parsedOutput: R;
  validationError: string;
}): BaseMessage[] {
  return [
    ...input.baseMessages,
    new HumanMessage([
      `上一次输出虽然通过了 JSON 结构校验，但没有通过业务校验。这是第 ${input.attempt} 次语义重试。`,
      `失败原因：${input.validationError}`,
      "",
      "上一次的 JSON 输出：",
      safeJsonStringify(input.parsedOutput),
      "",
      "请基于同一任务重新生成完整 JSON 对象。",
      "硬要求：",
      "1. 只输出最终 JSON 对象。",
      "2. 不要输出 Markdown、解释、注释或额外文本。",
      "3. 必须修正上面的业务校验失败点。",
    ].join("\n")),
  ];
}

function buildSemanticRetryMessages<I, O, R>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  baseMessages: BaseMessage[];
  parsedOutput: R;
  validationError: string;
  attempt: number;
}): BaseMessage[] {
  return input.asset.semanticRetryPolicy?.buildMessages?.({
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    attempt: input.attempt,
    promptInput: input.promptInput,
    context: input.context,
    baseMessages: input.baseMessages,
    parsedOutput: input.parsedOutput,
    validationError: input.validationError,
  }) ?? buildDefaultSemanticRetryMessages(input);
}

export function preparePromptExecution<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
  resolvedSlots?: import("../slots/slotTypes").ResolvedSlots;
}): {
  messages: ReturnType<PromptAsset<I, O, R>["render"]>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
} {
  assertRegistered(input.asset as PromptAsset<unknown, unknown, unknown>);
  const context = buildRenderContext(
    input.asset as PromptAsset<unknown, unknown, unknown>,
    input.contextBlocks ?? [],
    input.resolvedSlots,
  );
  const renderedMessages = input.asset.render(input.promptInput, context);
  return {
    messages: appendStructuredOutputHintMessages({
      asset: input.asset,
      promptInput: input.promptInput,
      context,
      messages: renderedMessages,
    }),
    context,
    invocation: buildPromptInvocationMeta(
      input.asset as PromptAsset<unknown, unknown, unknown>,
      context,
      false,
      0,
      false,
      0,
      input.options,
    ),
  };
}

function logPromptCompletion(input: {
  meta: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
}): void {
  console.info(
    [
      "[prompt.runner]",
      `promptId=${input.meta.promptId}`,
      `promptVersion=${input.meta.promptVersion}`,
      `taskType=${input.meta.taskType}`,
      input.meta.novelId ? `novelId=${input.meta.novelId}` : "",
      input.meta.chapterId ? `chapterId=${input.meta.chapterId}` : "",
      input.meta.stage ? `stage=${input.meta.stage}` : "",
      typeof input.meta.sceneIndex === "number" ? `sceneIndex=${input.meta.sceneIndex}` : "",
      typeof input.meta.roundIndex === "number" ? `roundIndex=${input.meta.roundIndex}` : "",
      input.meta.triggerReason ? `triggerReason=${JSON.stringify(input.meta.triggerReason)}` : "",
      `contextBlockIds=${input.meta.contextBlockIds.join(",") || "none"}`,
      `droppedContextBlockIds=${input.meta.droppedContextBlockIds.join(",") || "none"}`,
      `summarizedContextBlockIds=${input.meta.summarizedContextBlockIds.join(",") || "none"}`,
      `estimatedInputTokens=${input.meta.estimatedInputTokens}`,
      `repairUsed=${input.meta.repairUsed}`,
      `repairAttempts=${input.meta.repairAttempts}`,
      `semanticRetryUsed=${input.meta.semanticRetryUsed}`,
      `semanticRetryAttempts=${input.meta.semanticRetryAttempts}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      `latencyMs=${input.latencyMs}`,
    ].join(" "),
  );
}

function logPromptEvent(input: {
  event: string;
  asset: PromptAsset<unknown, unknown, unknown>;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  attempt?: number;
  validationError?: string;
}): void {
  console.info(
    [
      "[prompt.runner]",
      `event=${input.event}`,
      `promptId=${input.asset.id}`,
      `promptVersion=${input.asset.version}`,
      `taskType=${input.asset.taskType}`,
      `contextBlockIds=${input.context.selectedBlockIds.join(",") || "none"}`,
      `estimatedInputTokens=${input.context.estimatedInputTokens}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      typeof input.attempt === "number" ? `attempt=${input.attempt}` : "",
      input.validationError ? `validationError=${JSON.stringify(input.validationError.slice(0, 240))}` : "",
    ].filter(Boolean).join(" "),
  );
}

function recordPromptCompletion(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  output: unknown;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  renderedPromptChars?: number;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  postValidateFailureRecovered?: boolean;
}): void {
  recordPromptQualityEvent({
    event: "completed",
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    mode: input.asset.mode,
    provider: input.provider,
    model: input.model,
    stage: input.invocation.stage,
    entrypoint: input.invocation.entrypoint,
    latencyMs: input.latencyMs,
    estimatedInputTokens: input.context.estimatedInputTokens,
    renderedPromptChars: input.renderedPromptChars,
    outputChars: estimateOutputChars(input.output),
    repairUsed: input.invocation.repairUsed,
    repairAttempts: input.invocation.repairAttempts,
    semanticRetryUsed: input.invocation.semanticRetryUsed,
    semanticRetryAttempts: input.invocation.semanticRetryAttempts,
    postValidateFailureRecovered: input.postValidateFailureRecovered,
    emptyOutput: isPromptOutputEmpty(input.output),
    tokenUsage: input.tokenUsage,
  });
}

function recordPromptFailure(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  renderedPromptChars?: number;
  error: unknown;
}): void {
  recordPromptQualityEvent({
    event: "failed",
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    mode: input.asset.mode,
    provider: input.provider,
    model: input.model,
    stage: input.invocation.stage,
    entrypoint: input.invocation.entrypoint,
    latencyMs: input.latencyMs,
    estimatedInputTokens: input.context.estimatedInputTokens,
    renderedPromptChars: input.renderedPromptChars,
    repairUsed: input.invocation.repairUsed,
    repairAttempts: input.invocation.repairAttempts,
    semanticRetryUsed: input.invocation.semanticRetryUsed,
    semanticRetryAttempts: input.invocation.semanticRetryAttempts,
    failureKind: classifyPromptQualityFailure(input.error),
  });
}

function captureStreamOutput(
  rawStream: AsyncIterable<BaseMessageChunk>,
  onChunk?: (content: string) => void,
): {
  stream: AsyncIterable<BaseMessageChunk>;
  completedText: Promise<string>;
  completedUsage: Promise<LlmTokenUsageSnapshot | null>;
} {
  let resolveText!: (value: string) => void;
  let rejectText!: (reason?: unknown) => void;
  let resolveUsage!: (value: LlmTokenUsageSnapshot | null) => void;
  let rejectUsage!: (reason?: unknown) => void;
  const completedText = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });
  const completedUsage = new Promise<LlmTokenUsageSnapshot | null>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  const stream = {
    async *[Symbol.asyncIterator]() {
      const chunks: string[] = [];
      let usage: LlmTokenUsageSnapshot | null = null;
      try {
        for await (const chunk of rawStream) {
          const content = toText(chunk.content);
          chunks.push(content);
          onChunk?.(content);
          usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
          yield chunk;
        }
        resolveText(chunks.join(""));
        resolveUsage(usage);
      } catch (error) {
        rejectText(error);
        rejectUsage(error);
        throw error;
      }
    },
  };

  return {
    stream,
    completedText,
    completedUsage,
  };
}

function buildPromptRunResult<T>(input: {
  asset: PromptAsset<unknown, unknown, unknown>;
  output: T;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  invocation: PromptInvocationMeta;
  renderedPromptChars?: number;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  postValidateFailureRecovered?: boolean;
}): PromptRunResult<T> {
  const meta = {
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    invocation: input.invocation,
    tokenUsage: input.tokenUsage ?? null,
  };
  logPromptCompletion({
    meta: input.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
  });
  recordPromptCompletion({
    asset: input.asset,
    output: input.output,
    context: input.context,
    invocation: input.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
    renderedPromptChars: input.renderedPromptChars,
    tokenUsage: input.tokenUsage,
    postValidateFailureRecovered: input.postValidateFailureRecovered,
  });
  return {
    output: input.output,
    meta,
    context: input.context,
  };
}

function applyPromptPostValidate<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  rawOutput: R;
}): O {
  return input.asset.postValidate
    ? input.asset.postValidate(input.rawOutput, input.promptInput, input.context)
    : input.rawOutput as unknown as O;
}

async function resolveStructuredOutput<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  baseMessages: BaseMessage[];
  outputSchema: NonNullable<PromptAsset<I, O, R>["outputSchema"]>;
  initialResult: StructuredInvokeResult<R>;
  options?: PromptExecutionOptions;
}): Promise<{
  output: O;
  invocation: PromptInvocationMeta;
  postValidateFailureRecovered: boolean;
}> {
  const asset = input.asset as PromptAsset<unknown, unknown, unknown>;
  let currentMessages = input.baseMessages;
  let currentResult = input.initialResult;
  let totalRepairAttempts = currentResult.repairAttempts;
  let repairUsed = currentResult.repairUsed;
  let semanticRetryAttempts = 0;
  const maxSemanticRetryAttempts = resolveStructuredSemanticRetryAttempts(asset);

  while (true) {
    try {
      const output = applyPromptPostValidate({
        asset: input.asset,
        promptInput: input.promptInput,
        context: input.context,
        rawOutput: currentResult.data,
      });
      return {
        output,
        invocation: buildPromptInvocationMeta(
          asset,
          input.context,
          repairUsed,
          totalRepairAttempts,
          semanticRetryAttempts > 0,
          semanticRetryAttempts,
          input.options,
        ),
        postValidateFailureRecovered: false,
      };
    } catch (error) {
      if (semanticRetryAttempts >= maxSemanticRetryAttempts) {
        if (input.asset.postValidateFailureRecovery) {
          logPromptEvent({
            event: "semantic_retry_recovered",
            asset: asset as PromptAsset<unknown, unknown, unknown>,
            context: input.context,
            provider: input.options?.provider,
            model: input.options?.model,
            attempt: semanticRetryAttempts,
            validationError: stringifyPromptError(error),
          });
          recordPromptQualityEvent({
            event: "semantic_retry_recovered",
            promptId: asset.id,
            promptVersion: asset.version,
            taskType: asset.taskType,
            mode: asset.mode,
            provider: input.options?.provider,
            model: input.options?.model,
            stage: input.options?.stage,
            entrypoint: input.options?.entrypoint,
            estimatedInputTokens: input.context.estimatedInputTokens,
            semanticRetryUsed: semanticRetryAttempts > 0,
            semanticRetryAttempts,
            postValidateFailureRecovered: true,
          });
          return {
            output: input.asset.postValidateFailureRecovery({
              promptInput: input.promptInput,
              context: input.context,
              rawOutput: currentResult.data,
              validationError: stringifyPromptError(error),
              semanticRetryAttempts,
            }),
            invocation: buildPromptInvocationMeta(
              asset,
              input.context,
              repairUsed,
              totalRepairAttempts,
              semanticRetryAttempts > 0,
              semanticRetryAttempts,
              input.options,
            ),
            postValidateFailureRecovered: true,
          };
        }
        throw markPromptQualityFailure(error, "post_validate_failed");
      }

      semanticRetryAttempts += 1;
      recordPromptQualityEvent({
        event: "semantic_retry_start",
        promptId: asset.id,
        promptVersion: asset.version,
        taskType: asset.taskType,
        mode: asset.mode,
        provider: input.options?.provider,
        model: input.options?.model,
        stage: input.options?.stage,
        entrypoint: input.options?.entrypoint,
        estimatedInputTokens: input.context.estimatedInputTokens,
        semanticRetryUsed: true,
        semanticRetryAttempts,
      });
      logPromptEvent({
        event: "semantic_retry_start",
        asset: asset as PromptAsset<unknown, unknown, unknown>,
        context: input.context,
        provider: input.options?.provider,
        model: input.options?.model,
        attempt: semanticRetryAttempts,
        validationError: stringifyPromptError(error),
      });
      currentMessages = buildSemanticRetryMessages({
        asset: input.asset,
        promptInput: input.promptInput,
        context: input.context,
        baseMessages: currentMessages,
        parsedOutput: currentResult.data,
        validationError: stringifyPromptError(error),
        attempt: semanticRetryAttempts,
      });
      currentResult = await promptRunnerStructuredInvoker<R>({
        label: `${input.asset.id}@${input.asset.version}#semantic-retry-${semanticRetryAttempts}`,
        provider: input.options?.provider,
        model: input.options?.model,
        temperature: input.options?.temperature,
        maxTokens: input.options?.maxTokens,
        timeoutMs: input.options?.timeoutMs,
        signal: input.options?.signal,
        taskType: input.asset.taskType,
        messages: currentMessages,
        schema: input.outputSchema,
        maxRepairAttempts: resolveStructuredRepairAttempts(asset),
        promptMeta: buildPromptInvocationMeta(
          asset,
          input.context,
          repairUsed,
          totalRepairAttempts,
          true,
          semanticRetryAttempts,
          input.options,
        ),
      });
      logPromptEvent({
        event: "semantic_retry_done",
        asset: asset as PromptAsset<unknown, unknown, unknown>,
        context: input.context,
        provider: input.options?.provider,
        model: input.options?.model,
        attempt: semanticRetryAttempts,
      });
      recordPromptQualityEvent({
        event: "semantic_retry_done",
        promptId: asset.id,
        promptVersion: asset.version,
        taskType: asset.taskType,
        mode: asset.mode,
        provider: input.options?.provider,
        model: input.options?.model,
        stage: input.options?.stage,
        entrypoint: input.options?.entrypoint,
        estimatedInputTokens: input.context.estimatedInputTokens,
        repairUsed: currentResult.repairUsed,
        repairAttempts: currentResult.repairAttempts,
        semanticRetryUsed: true,
        semanticRetryAttempts,
      });
      totalRepairAttempts += currentResult.repairAttempts;
      repairUsed = repairUsed || currentResult.repairUsed;
    }
  }
}

export async function runStructuredPrompt<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<O>> {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a structured prompt.`);
  }

  const outputSchema = input.asset.outputSchema;
  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  logPromptEvent({
    event: "started",
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    context: prepared.context,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  const startedAt = Date.now();
  const renderedPromptChars = estimateRenderedPromptChars(prepared.messages);
  try {
    const result = await promptRunnerStructuredInvoker<R>({
      label: `${input.asset.id}@${input.asset.version}`,
      provider: input.options?.provider,
      model: input.options?.model,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      signal: input.options?.signal,
      taskType: input.asset.taskType,
      messages: prepared.messages,
      schema: outputSchema,
      maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
      promptMeta: prepared.invocation,
    });
    logMemoryUsage({
      event: "structured_invoke_done",
      component: "runStructuredPrompt",
      taskId: input.options?.taskId,
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      volumeId: input.options?.volumeId,
      stage: input.options?.stage,
      itemKey: input.options?.itemKey,
      scope: input.options?.scope ?? input.options?.triggerReason,
      entrypoint: input.options?.entrypoint,
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      provider: input.options?.provider,
      model: input.options?.model,
      renderedPromptChars,
    });
    const resolved = await resolveStructuredOutput({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      baseMessages: prepared.messages,
      outputSchema,
      initialResult: result,
      options: input.options,
    });
    logMemoryUsage({
      event: "before_prompt_result_return",
      component: "runStructuredPrompt",
      taskId: input.options?.taskId,
      novelId: input.options?.novelId,
      chapterId: input.options?.chapterId,
      volumeId: input.options?.volumeId,
      stage: input.options?.stage,
      itemKey: input.options?.itemKey,
      scope: input.options?.scope ?? input.options?.triggerReason,
      entrypoint: input.options?.entrypoint,
      promptId: input.asset.id,
      promptVersion: input.asset.version,
      provider: input.options?.provider,
      model: input.options?.model,
      renderedPromptChars,
    });
    return buildPromptRunResult({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      output: resolved.output,
      context: prepared.context,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      invocation: resolved.invocation,
      renderedPromptChars,
      tokenUsage: result.tokenUsage,
      postValidateFailureRecovered: resolved.postValidateFailureRecovered,
    });
  } catch (error) {
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }
}

export async function runTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<string>> {
  if (input.asset.mode !== "text") {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a text prompt.`);
  }

  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const startedAt = Date.now();
  const messages = await resolveAdvancedTextPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "text",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  try {
    const llm = await promptRunnerLLMFactory(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
    });
    liveSession.phase("streaming", "模型正在返回内容");
    const stream = await llm.stream(messages, buildPromptCallOptions(input.options));
    let rawOutput = "";
    let tokenUsage: LlmTokenUsageSnapshot | null = null;
    for await (const chunk of stream) {
      const content = toText(chunk.content);
      rawOutput += content;
      liveSession.delta(content);
      tokenUsage = mergeStreamTokenUsage(tokenUsage, extractLlmTokenUsage(chunk));
    }
    liveSession.phase("validating", "正在整理生成结果");
    const output = applyPromptPostValidate({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      rawOutput,
    });
    liveSession.complete();
    return buildPromptRunResult({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      output,
      context: prepared.context,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      invocation: buildPromptInvocationMeta(
        input.asset as PromptAsset<unknown, unknown, unknown>,
        prepared.context,
        false,
        0,
        false,
        0,
        input.options,
      ),
      renderedPromptChars,
      tokenUsage,
    });
  } catch (error) {
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }
}

export async function streamTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<string>> {
  if (input.asset.mode !== "text") {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a text prompt.`);
  }

  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const startedAt = Date.now();
  const messages = await resolveAdvancedTextPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "text",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  try {
    const llm = await promptRunnerLLMFactory(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
    });
    liveSession.phase("streaming", "模型正在返回内容");
    const rawStream = await llm.stream(messages, buildPromptCallOptions(input.options));
    captured = captureStreamOutput(rawStream as AsyncIterable<BaseMessageChunk>, (content) => liveSession.delta(content));
  } catch (error) {
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }

  return {
    stream: captured.stream,
    complete: captured.completedText.then(async (content) => {
      liveSession.phase("validating", "正在整理生成结果");
      const output = applyPromptPostValidate({
        asset: input.asset,
        promptInput: input.promptInput,
        context: prepared.context,
        rawOutput: content,
      });
      const result = buildPromptRunResult({
        asset: input.asset as PromptAsset<unknown, unknown, unknown>,
        output,
        context: prepared.context,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        invocation: buildPromptInvocationMeta(
          input.asset as PromptAsset<unknown, unknown, unknown>,
          prepared.context,
          false,
          0,
          false,
          0,
          input.options,
        ),
        renderedPromptChars,
        tokenUsage: await captured.completedUsage.catch(() => null),
      });
      liveSession.complete();
      return result;
    }).catch((error) => {
      liveSession.fail(error);
      recordPromptFailure({
        asset: input.asset as PromptAsset<unknown, unknown, unknown>,
        context: prepared.context,
        invocation: prepared.invocation,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        renderedPromptChars,
        error,
      });
      throw error;
    }),
    context: prepared.context,
    invocation: prepared.invocation,
  };
}

export async function streamStructuredPrompt<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<O>> {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a structured prompt.`);
  }

  const outputSchema = input.asset.outputSchema;
  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const startedAt = Date.now();
  const renderedPromptChars = estimateRenderedPromptChars(prepared.messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "structured",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  let strategy!: ReturnType<typeof selectStructuredOutputStrategy>;
  let profile!: ReturnType<typeof resolveStructuredOutputProfile>;
  try {
    const llm = await promptRunnerLLMFactory(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
      timeoutMs: input.options?.timeoutMs,
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
      executionMode: "structured",
    });
    const resolvedLLM = getResolvedLLMClientOptionsFromInstance(llm);
    profile = resolvedLLM?.structuredProfile ?? resolveStructuredOutputProfile({
      provider: resolvedLLM?.provider ?? input.options?.provider ?? "deepseek",
      model: resolvedLLM?.model ?? input.options?.model,
      baseURL: resolvedLLM?.baseURL,
      requestProtocol: resolvedLLM?.requestProtocol,
      executionMode: "structured",
    });
    strategy = resolvedLLM?.structuredStrategy ?? selectStructuredOutputStrategy(profile, outputSchema);
    const invokeOptions: Record<string, unknown> = {};
    const responseFormat = buildStructuredResponseFormat({
      strategy,
      schema: outputSchema,
      label: `${input.asset.id}@${input.asset.version}`,
    });
    if (responseFormat) {
      invokeOptions.response_format = responseFormat;
    }
    if (input.options?.signal) {
      invokeOptions.signal = input.options.signal;
    }
    liveSession.phase("streaming", "模型正在返回结构化结果");
    const rawStream = await llm.stream(prepared.messages, invokeOptions);
    captured = captureStreamOutput(rawStream as AsyncIterable<BaseMessageChunk>, (content) => liveSession.delta(content));
  } catch (error) {
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }

  return {
    stream: captured.stream,
    complete: captured.completedText.then(async (rawContent) => {
      liveSession.phase("validating", "正在检查生成结果");
      let repairStarted = false;
      const parsed = await parseStructuredLlmRawContentDetailed({
        rawContent,
        schema: outputSchema,
        provider: input.options?.provider,
        model: input.options?.model,
        temperature: input.options?.temperature,
        maxTokens: input.options?.maxTokens,
        timeoutMs: input.options?.timeoutMs,
        signal: input.options?.signal,
        taskType: input.asset.taskType,
        label: `${input.asset.id}@${input.asset.version}`,
        maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
        promptMeta: prepared.invocation,
        onRepairOutputDelta: (content) => {
          if (!repairStarted) {
            repairStarted = true;
            liveSession.phase("repairing", "正在修复生成结果");
          }
          liveSession.delta(content);
        },
        strategy,
        profile,
      });
      const resolved = await resolveStructuredOutput({
        asset: input.asset,
        promptInput: input.promptInput,
        context: prepared.context,
        baseMessages: prepared.messages,
        outputSchema,
        initialResult: parsed,
        options: input.options,
      });
      const result = buildPromptRunResult({
        asset: input.asset as PromptAsset<unknown, unknown, unknown>,
        output: resolved.output,
        context: prepared.context,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        invocation: resolved.invocation,
        renderedPromptChars,
        tokenUsage: await captured.completedUsage.catch(() => null),
        postValidateFailureRecovered: resolved.postValidateFailureRecovered,
      });
      liveSession.complete();
      return result;
    }).catch((error) => {
      liveSession.fail(error);
      recordPromptFailure({
        asset: input.asset as PromptAsset<unknown, unknown, unknown>,
        context: prepared.context,
        invocation: prepared.invocation,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        renderedPromptChars,
        error,
      });
      throw error;
    }),
    context: prepared.context,
    invocation: prepared.invocation,
  };
}

export function setPromptRunnerLLMFactoryForTests(factory?: PromptRunnerLLMFactory): void {
  promptRunnerLLMFactory = factory ?? getLLM;
}

export function setPromptRunnerStructuredInvokerForTests(invoker?: PromptRunnerStructuredInvoker): void {
  promptRunnerStructuredInvoker = invoker ?? invokeStructuredLlmDetailed;
}
