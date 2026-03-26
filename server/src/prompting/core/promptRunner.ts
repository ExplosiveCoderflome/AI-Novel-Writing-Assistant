import { toText } from "../../services/novel/novelP0Utils";
import { getLLM } from "../../llm/factory";
import { invokeStructuredLlmDetailed } from "../../llm/structuredInvoke";
import { hasRegisteredPromptAsset } from "../registry";
import { selectContextBlocks } from "./contextSelection";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptInvocationMeta,
  PromptRenderContext,
  PromptRunResult,
} from "./promptTypes";

function buildRenderContext(asset: PromptAsset<unknown, unknown, unknown>, rawBlocks: Parameters<typeof selectContextBlocks>[0]): PromptRenderContext {
  const selection = selectContextBlocks(rawBlocks, asset.contextPolicy);
  return {
    blocks: selection.selectedBlocks,
    selectedBlockIds: selection.selectedBlocks.map((block) => block.id),
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
): PromptInvocationMeta {
  return {
    promptId: asset.id,
    promptVersion: asset.version,
    taskType: asset.taskType,
    contextBlockIds: context.selectedBlockIds,
    estimatedInputTokens: context.estimatedInputTokens,
    repairUsed,
  };
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
  return {
    messages: input.asset.render(input.promptInput, context),
    context,
    invocation: buildPromptInvocationMeta(input.asset as PromptAsset<unknown, unknown, unknown>, context, false),
  };
}

function logPromptCompletion(input: {
  meta: PromptInvocationMeta;
  provider?: string;
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
      `estimatedInputTokens=${input.meta.estimatedInputTokens}`,
      `repairUsed=${input.meta.repairUsed}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      `latencyMs=${input.latencyMs}`,
    ].join(" "),
  );
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

  const prepared = preparePromptExecution(input);
  const startedAt = Date.now();
  const result = await invokeStructuredLlmDetailed<R>({
    label: `${input.asset.id}@${input.asset.version}`,
    provider: input.options?.provider,
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    messages: prepared.messages,
    schema: input.asset.outputSchema,
    maxRepairAttempts: 1,
    promptMeta: prepared.invocation,
  });
  const output = input.asset.postValidate
    ? input.asset.postValidate(result.data, input.promptInput, prepared.context)
    : result.data as unknown as O;
  const meta = {
    provider: input.options?.provider,
    model: input.options?.model,
    latencyMs: Date.now() - startedAt,
    invocation: buildPromptInvocationMeta(input.asset as PromptAsset<unknown, unknown, unknown>, prepared.context, result.repairUsed),
  };
  logPromptCompletion({
    meta: meta.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
  });
  return {
    output,
    meta,
    context: prepared.context,
  };
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
  const llm = await getLLM(input.options?.provider, {
    fallbackProvider: "deepseek",
    model: input.options?.model,
    temperature: input.options?.temperature,
    maxTokens: input.options?.maxTokens,
    taskType: input.asset.taskType,
    promptMeta: prepared.invocation,
  });
  const result = await llm.invoke(prepared.messages);
  const output = input.asset.postValidate
    ? input.asset.postValidate(toText(result.content), input.promptInput, prepared.context)
    : toText(result.content);
  const meta = {
    provider: input.options?.provider,
    model: input.options?.model,
    latencyMs: Date.now() - startedAt,
    invocation: buildPromptInvocationMeta(input.asset as PromptAsset<unknown, unknown, unknown>, prepared.context, false),
  };
  logPromptCompletion({
    meta: meta.invocation,
    provider: meta.provider,
    model: meta.model,
    latencyMs: meta.latencyMs,
  });
  return {
    output,
    meta,
    context: prepared.context,
  };
}
