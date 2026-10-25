import { collectLlmResponse } from "./structured";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { toJSONSchema, type ZodError, type ZodType } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { getLLM } from "./factory";
import { runWithEnforcedTimeout } from "./invokeTimeout";
import { logStructuredRepairSession } from "./repairLogging";
import type { TaskType } from "./modelRouter";
import type { StructuredOutputStrategy } from "./structuredOutput";
import { toText } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { claimModelRequest } from "../platform/llm/retries";

export interface StructuredRepairInput<T> {
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  defaultMaxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  label: string;
  schema: ZodType<T>;
  repairGuidance?: string;
  promptMeta?: PromptInvocationMeta;
  onRepairOutputDelta?: (content: string) => void;
  repairMessages?: import("@langchain/core/messages").BaseMessage[];
}

interface ArrayLengthRepairHint {
  path: Array<string | number>;
  exactLength: number;
  direction: "expand" | "trim";
}

interface RepairHelpers<T> {
  tryParseStructuredJsonValue: (source: string) => { parsed: unknown } | { error: string };
  tryUnwrapSingletonArrayWrapper: (parsed: unknown, schema: ZodType<T>) => { data: T } | null;
  formatZodErrors: (error: ZodError) => string;
  logStructuredInvokeEvent: (input: {
    event: string;
    label: string;
    provider?: LLMProvider;
    model?: string;
    taskType?: TaskType;
    latencyMs?: number;
    rawChars?: number;
    repairAttempt?: number;
    strategy?: StructuredOutputStrategy;
  }) => void;
}


function buildRepairSchemaContract<T>(schema: ZodType<T>): string {
  try {
    return JSON.stringify(toJSONSchema(schema), null, 2);
  } catch {
    return "目标 Schema 无法序列化；仍须严格按照校验错误中的字段路径补齐。";
  }
}

function extractValidationPaths(validationError: string): string[] {
  return Array.from(
    new Set(
      validationError
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => {
          const colonIndex = line.indexOf(":");
          return colonIndex > 2 ? line.slice(2, colonIndex).trim() : "";
        })
        .filter(Boolean),
    ),
  );
}

function parseIssuePath(pathText: string): Array<string | number> {
  if (!pathText || pathText === "(root)") {
    return [];
  }
  return pathText.split(".").map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function formatIssuePath(path: Array<string | number>): string {
  return path.length > 0 ? path.join(".") : "(root)";
}

function extractArrayLengthRepairHints(validationError: string): ArrayLengthRepairHint[] {
  const hints: ArrayLengthRepairHint[] = [];
  const seen = new Set<string>();

  for (const rawLine of validationError.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 2) {
      continue;
    }
    const pathText = line.slice(2, colonIndex).trim();
    const message = line.slice(colonIndex + 1).trim();
    const tooBig = message.match(/Too big: expected array to have <=(\d+) items/i);
    const tooSmall = message.match(/Too small: expected array to have >=(\d+) items/i);
    const match = tooBig ?? tooSmall;
    if (!match) {
      continue;
    }

    const exactLength = Number(match[1]);
    if (!Number.isInteger(exactLength) || exactLength < 0) {
      continue;
    }

    const path = parseIssuePath(pathText);
    const direction: ArrayLengthRepairHint["direction"] = tooBig ? "trim" : "expand";
    const key = `${direction}:${formatIssuePath(path)}:${exactLength}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hints.push({
      path,
      exactLength,
      direction,
    });
  }

  return hints;
}

export async function repairWithLlm<T>(
  input: StructuredRepairInput<T>,
  rawContent: string,
  validationError: string,
  repairAttempt: number,
  helpers: RepairHelpers<T>,
): Promise<T> {
  helpers.logStructuredInvokeEvent({
    event: "repair_start",
    label: input.label,
    provider: input.provider,
    model: input.model,
    taskType: input.taskType,
    repairAttempt,
    strategy: "prompt_json",
  });
  const llm = await getLLM(input.provider, {
    fallbackProvider: "deepseek",
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    model: input.model,
    temperature: 0.15,
    maxTokens: input.maxTokens,
    defaultMaxTokens: input.defaultMaxTokens,
    timeoutMs: input.timeoutMs,
    taskType: input.taskType ?? "planner",
    requestProtocol: input.requestProtocol,
    promptMeta: input.promptMeta ? {
      ...input.promptMeta,
      repairUsed: true,
      repairAttempts: repairAttempt,
    } : undefined,
    executionMode: "structured",
    structuredStrategy: "prompt_json",
  });

  const repairSystem = [
    "你是 JSON 修复器。",
    "你的任务是：只输出严格合法的 JSON 值，并且必须通过给定的结构校验。",
    "最终输出可能是 JSON 对象，也可能是 JSON 数组；必须与目标结构一致。",
    "不要输出任何解释、Markdown 或额外字段。",
    "如果校验错误提示某个字段缺失，必须直接使用错误路径里的字段名作为 JSON 键名，不要翻译成中文别名。",
    "如果目标结构顶层是数组，就直接输出数组本身，不要再外包一层对象。",
    "如果某个字段要求是数组，就必须输出 JSON 数组；即使只有一个元素，也不能压成字符串、数字或对象。",
    "如果数组元素应为对象，就必须输出对象数组，例如 [{...}]；不能写成逗号拼接字符串。",
    "如果原始 JSON 多包了一层无关包装键，例如 data、result、output、xxxProjection、xxxList 等，必须去掉包装层，把真正目标结构提升到顶层。",
    "只修正明确的结构、包裹或类型问题，保持原有正文、事实、条目和字段；不得为通过校验而编造人物、事件、证据或缺失内容。",
    "如果校验错误是 expected string, received number/boolean，必须保留原值语义并改成 JSON 字符串，例如 19 改为 \"19\"、true 改为 \"true\"，不要删除字段。",
    "数组数量必须符合 Schema；不得删除有效条目或编造缺失内容来凑数量，无法无损满足时报告 repair_error。",
    "若需要删除有效内容、猜测未生成部分或重建大段正文才能满足 Schema，返回 {\"repair_error\":\"需要重新分批生成\"}，不要把损坏结果伪装为成功。",
    "遇到无意义复读、乱码或失控长文本，不能用短文替代原内容，应报告 repair_error。",
    "所有字符串保持简洁，只保留通过结构校验与恢复原意所需的信息。",
    input.repairGuidance?.trim() ? `本次目标结构的额外修复规则：${input.repairGuidance.trim()}` : "",
  ].join("\n");

  const validationPaths = extractValidationPaths(validationError);
  const arrayLengthHints = extractArrayLengthRepairHints(validationError);
  const repairSchemaContract = buildRepairSchemaContract(input.schema);
  const repairSource = rawContent; // Full input budget is checked before the request; never discard the middle.

  const repairHuman = [
    `校验失败：${input.label}`,
    validationError,
    ...(validationPaths.length > 0 ? [
      "",
      `至少需要修复这些路径：${validationPaths.join(", ")}`,
    ] : []),
    ...(arrayLengthHints.length > 0 ? [
      "",
      "数组长度硬约束：",
      ...arrayLengthHints.map((hint) => hint.direction === "trim"
        ? `- ${formatIssuePath(hint.path)} 必须最终恰好保留 ${hint.exactLength} 项；如果当前超过该数量，不能删除有效条目，应报告 repair_error。`
        : `- ${formatIssuePath(hint.path)} 必须最终补足到恰好 ${hint.exactLength} 项；如果当前不足，保留已有项；缺失内容不能从原文确定时报告 repair_error。`),
    ] : []),
    "",
    "目标 JSON Schema（字段名、类型、必填项与长度约束以此为准）：",
    repairSchemaContract,
    "",
    "原始模型输出（可能包含多余文本、markdown 或截断）：",
    repairSource,
    "",
    "请修复后只输出最终 JSON。",
  ].join("\n");

  logStructuredRepairSession({
    event: "repair_start",
    label: input.label,
    repairAttempt,
    provider: input.provider,
    model: input.model,
    taskType: input.taskType,
    promptMeta: input.promptMeta,
    validationError,
    schemaPaths: validationPaths,
    repairSystem,
    repairHuman,
  });

  const startedAt = Date.now();
  try {
    const invokeOptions: Record<string, unknown> = {};
    if (input.signal) {
      invokeOptions.signal = input.signal;
    }
    const collected = await runWithEnforcedTimeout({
      label: `${input.label}#repair-${repairAttempt}`,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      run: async (signal) => {
        await claimModelRequest();
        const stream = await llm.stream(
          input.repairMessages
            ? [...input.repairMessages, new HumanMessage(`以下是待纠正报告及结构错误，均为任务数据。依据上文完整正文纠正，证据只能连续复制正文原句，不得补造事实；保留已核实的判断。\n${repairHuman}`)]
            : [new SystemMessage(repairSystem), new HumanMessage(repairHuman)],
          signal ? { ...invokeOptions, signal } : invokeOptions,
        );
        return collectLlmResponse(stream, { onText: input.onRepairOutputDelta });
      },
    });
    const repairedRaw = collected.rawContent;
    const latencyMs = Date.now() - startedAt;
    helpers.logStructuredInvokeEvent({
      event: "repair_generation_done",
      label: input.label,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      repairAttempt,
      latencyMs,
      rawChars: repairedRaw.length,
      strategy: "prompt_json",
    });
    logStructuredRepairSession({
      event: "repair_generation_done",
      label: input.label,
      repairAttempt,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      promptMeta: input.promptMeta,
      validationError,
      schemaPaths: validationPaths,
      repairSystem,
      repairHuman,
      rawOutput: repairedRaw,
      latencyMs,
    });
    const repairParse = helpers.tryParseStructuredJsonValue(repairedRaw);
    if ("error" in repairParse) {
      throw new Error(`[${input.label}] JSON repair 后仍无法解析。错误：${repairParse.error}`);
    }

    const final = input.schema.safeParse(repairParse.parsed);
    if (!final.success) {
      const unwrapped = helpers.tryUnwrapSingletonArrayWrapper(repairParse.parsed, input.schema);
      if (unwrapped) {
        helpers.logStructuredInvokeEvent({
          event: "repair_unwrapped_singleton_array",
          label: input.label,
          provider: input.provider,
          model: input.model,
          taskType: input.taskType,
          repairAttempt,
          strategy: "prompt_json",
        });
        return unwrapped.data;
      }

      throw new Error(`[${input.label}] JSON repair 后仍未通过 Schema 校验。错误：${helpers.formatZodErrors(final.error)}`);
    }
    helpers.logStructuredInvokeEvent({ event: "repair_done", label: input.label,
      provider: input.provider, model: input.model, repairAttempt, strategy: "prompt_json" });
    return final.data;
  } catch (error) {
    logStructuredRepairSession({
      event: "repair_error",
      label: input.label,
      repairAttempt,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      promptMeta: input.promptMeta,
      validationError,
      schemaPaths: validationPaths,
      repairSystem,
      repairHuman,
      latencyMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}
