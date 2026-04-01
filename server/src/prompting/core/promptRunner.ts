import { HumanMessage, type BaseMessage, type BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getJsonCapability } from "../../llm/capabilities";
import { getLLM } from "../../llm/factory";
import {
  invokeStructuredLlmDetailed,
  parseStructuredLlmRawContentDetailed,
  shouldUseJsonObjectResponseFormat,
  type StructuredInvokeResult,
} from "../../llm/structuredInvoke";
import { toText } from "../../services/novel/novelP0Utils";
import { hasRegisteredPromptAsset } from "../registry";
import { selectContextBlocks } from "./contextSelection";
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

function buildRenderContext(asset: PromptAsset<unknown, unknown, unknown>, rawBlocks: Parameters<typeof selectContextBlocks>[0]): PromptRenderContext {
  const selection = selectContextBlocks(rawBlocks, asset.contextPolicy);
  return {
    blocks: selection.selectedBlocks,
    selectedBlockIds: selection.selectedBlocks.map((block) => block.id),
    droppedBlockIds: selection.droppedBlockIds,
    summarizedBlockIds: selection.summarizedBlockIds,
    estimatedInputTokens: selection.estimatedTokens,
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
): PromptInvocationMeta {
  return {
    promptId: asset.id,
    promptVersion: asset.version,
    taskType: asset.taskType,
    contextBlockIds: context.selectedBlockIds,
    droppedContextBlockIds: context.droppedBlockIds,
    summarizedContextBlockIds: context.summarizedBlockIds,
    estimatedInputTokens: context.estimatedInputTokens,
    repairUsed,
    repairAttempts,
    semanticRetryUsed,
    semanticRetryAttempts,
  };
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
}): {
  messages: ReturnType<PromptAsset<I, O, R>["render"]>;
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
} {
  assertRegistered(input.asset as PromptAsset<unknown, unknown, unknown>);
  const context = buildRenderContext(input.asset as PromptAsset<unknown, unknown, unknown>, input.contextBlocks ?? []);
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

function captureStreamOutput(rawStream: AsyncIterable<BaseMessageChunk>): {
  stream: AsyncIterable<BaseMessageChunk>;
  completedText: Promise<string>;
} {
  let resolveText!: (value: string) => void;
  let rejectText!: (reason?: unknown) => void;
  const completedText = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });

  const stream = {
    async *[Symbol.asyncIterator]() {
      const chunks: string[] = [];
      try {
        for await (const chunk of rawStream) {
          chunks.push(toText(chunk.content));
          yield chunk;
        }
        resolveText(chunks.join(""));
      } catch (error) {
        rejectText(error);
        throw error;
      }
    },
  };

  return {
    stream,
    completedText,
  };
}

function buildPromptRunResult<T>(input: {
  output: T;
  context: PromptRenderContext;
  provider?: LLMProvider;
  model?: string;
  latencyMs: number;
  invocation: PromptInvocationMeta;
}): PromptRunResult<T> {
  const meta = {
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    invocation: input.invocation,
  };
  logPromptCompletion({
    meta: input.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
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
        ),
      };
    } catch (error) {
      if (semanticRetryAttempts >= maxSemanticRetryAttempts) {
        throw error;
      }

      semanticRetryAttempts += 1;
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
        ),
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
  const prepared = preparePromptExecution(input);
  const startedAt = Date.now();
  const result = await promptRunnerStructuredInvoker<R>({
    label: `${input.asset.id}@${input.asset.version}`,
    provider: input.options?.provider,
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    messages: prepared.messages,
    schema: outputSchema,
    maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
    promptMeta: prepared.invocation,
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
  return buildPromptRunResult({
    output: resolved.output,
    context: prepared.context,
    provider: input.options?.provider,
    model: input.options?.model,
    latencyMs: Date.now() - startedAt,
    invocation: resolved.invocation,
  });
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

  const prepared = preparePromptExecution(input);
  const startedAt = Date.now();
  const llm = await promptRunnerLLMFactory(input.options?.provider, {
    fallbackProvider: "deepseek",
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    promptMeta: prepared.invocation,
  });
  const result = await llm.invoke(prepared.messages);
  return buildPromptRunResult({
    output: applyPromptPostValidate({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      rawOutput: toText(result.content),
    }),
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
    ),
  });
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

  const prepared = preparePromptExecution(input);
  const startedAt = Date.now();
  const llm = await promptRunnerLLMFactory(input.options?.provider, {
    fallbackProvider: "deepseek",
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    promptMeta: prepared.invocation,
  });
  const rawStream = await llm.stream(prepared.messages);
  const captured = captureStreamOutput(rawStream as AsyncIterable<BaseMessageChunk>);

  return {
    stream: captured.stream,
    complete: captured.completedText.then((content) => buildPromptRunResult({
      output: applyPromptPostValidate({
        asset: input.asset,
        promptInput: input.promptInput,
        context: prepared.context,
        rawOutput: content,
      }),
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
      ),
    })),
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
  const prepared = preparePromptExecution(input);
  const startedAt = Date.now();
  const llm = await promptRunnerLLMFactory(input.options?.provider, {
    fallbackProvider: "deepseek",
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    promptMeta: prepared.invocation,
  });
  const invokeOptions: Record<string, unknown> = {};
  if (
    getJsonCapability(input.options?.provider ?? "deepseek", input.options?.model).supportsJsonObject
    && shouldUseJsonObjectResponseFormat(input.options?.provider ?? "deepseek", input.options?.model, outputSchema)
  ) {
    invokeOptions.response_format = { type: "json_object" };
  }
  const rawStream = await llm.stream(prepared.messages, invokeOptions);
  const captured = captureStreamOutput(rawStream as AsyncIterable<BaseMessageChunk>);

  return {
    stream: captured.stream,
    complete: captured.completedText.then(async (rawContent) => {
      const parsed = await parseStructuredLlmRawContentDetailed({
        rawContent,
        schema: outputSchema,
        provider: input.options?.provider,
        model: input.options?.model,
        temperature: input.options?.temperature,
        maxTokens: input.options?.maxTokens,
        taskType: input.asset.taskType,
        label: `${input.asset.id}@${input.asset.version}`,
        maxRepairAttempts: resolveStructuredRepairAttempts(input.asset as PromptAsset<unknown, unknown, unknown>),
        promptMeta: prepared.invocation,
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
      return buildPromptRunResult({
        output: resolved.output,
        context: prepared.context,
        provider: input.options?.provider,
        model: input.options?.model,
        latencyMs: Date.now() - startedAt,
        invocation: resolved.invocation,
      });
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
