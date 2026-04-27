import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ZodError, ZodType } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { getLLM } from "./factory";
import { runWithEnforcedTimeout } from "./invokeTimeout";
import { logStructuredRepairSession } from "./repairLogging";
import type { TaskType } from "./modelRouter";
import type { StructuredOutputStrategy } from "./structuredOutput";
import { toText } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

export interface StructuredRepairInput<T> {
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  label: string;
  schema: ZodType<T>;
  promptMeta?: PromptInvocationMeta;
}

interface ArrayLengthRepairHint {
  path: Array<string | number>;
  exactLength: number;
  direction: "expand" | "trim";
}

interface RepairHelpers<T> {
  tryParseStructuredJsonValue: (source: string) => { parsed: unknown } | { error: string };
  tryUnwrapSingletonArrayWrapper: (parsed: unknown, schema: ZodType<T>) => { data: T } | null;
  normalizeOversizedArrays: (
    parsed: unknown,
    error: ZodError,
    schema: ZodType<T>,
  ) => { data: T; trimmedPaths: string[] } | null;
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
    "如果缺失必填字符串字段，必须补出非空字符串；可根据原始 JSON 中已有内容做最小、保守、语义一致的补全，不能输出空字符串、null 或 undefined。",
    "如果校验错误指出某个数组数量过多或过少，必须把该路径的数组长度修正到错误里要求的精确数量，不能停留在接近正确的数量。",
  ].join("\n");

  const validationPaths = extractValidationPaths(validationError);
  const arrayLengthHints = extractArrayLengthRepairHints(validationError);

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
        ? `- ${formatIssuePath(hint.path)} 必须最终恰好保留 ${hint.exactLength} 项；如果当前超过该数量，按原顺序裁掉多余项。`
        : `- ${formatIssuePath(hint.path)} 必须最终补足到恰好 ${hint.exactLength} 项；如果当前不足，按原顺序保留已有项并补齐缺失项。`),
    ] : []),
    "",
    "原始模型输出（可能包含多余文本、markdown 或截断）：",
    rawContent,
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
    repairSystem,
    repairHuman,
  });

  const startedAt = Date.now();
  try {
    const invokeOptions: Record<string, unknown> = {};
    if (input.signal) {
      invokeOptions.signal = input.signal;
    }
    const result = await runWithEnforcedTimeout({
      label: `${input.label}#repair-${repairAttempt}`,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      run: (signal) => llm.invoke(
        [new SystemMessage(repairSystem), new HumanMessage(repairHuman)],
        signal ? { ...invokeOptions, signal } : invokeOptions,
      ),
    });
    const repairedRaw = toText(result.content);
    const latencyMs = Date.now() - startedAt;
    helpers.logStructuredInvokeEvent({
      event: "repair_done",
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
      event: "repair_done",
      label: input.label,
      repairAttempt,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      promptMeta: input.promptMeta,
      validationError,
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

      const normalized = helpers.normalizeOversizedArrays(repairParse.parsed, final.error, input.schema);
      if (normalized) {
        helpers.logStructuredInvokeEvent({
          event: "repair_normalized",
          label: input.label,
          provider: input.provider,
          model: input.model,
          taskType: input.taskType,
          repairAttempt,
          strategy: "prompt_json",
        });
        return normalized.data;
      }
      throw new Error(`[${input.label}] JSON repair 后仍未通过 Schema 校验。错误：${helpers.formatZodErrors(final.error)}`);
    }
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
      repairSystem,
      repairHuman,
      latencyMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}
