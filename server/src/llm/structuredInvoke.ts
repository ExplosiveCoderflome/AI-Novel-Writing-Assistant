import { z, type ZodError, type ZodType } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import { createLLMFromResolvedOptions, getLLM, resolveLLMClientOptions } from "./factory";
import {
  buildStructuredResponseFormat,
  classifyStructuredOutputFailure,
  extractStructuredOutputErrorCategory,
  resolveStructuredOutputProfile,
  schemaAllowsTopLevelArray,
  selectStructuredOutputStrategy,
  StructuredOutputError,
  type StructuredOutputDiagnostics,
  type StructuredOutputErrorCategory,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { relaxGeneratedContentSchema } from "./generatedContentSchema";
import { getStructuredFallbackSettings } from "./structuredFallbackSettings";
import { logStructuredRepairSession } from "./repairLogging";
import { toText, extractJSONValue } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

export interface StructuredInvokeInput<T> {
  systemPrompt?: string;
  userPrompt?: string;
  messages?: BaseMessage[];
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  label: string;
  maxRepairAttempts?: number;
  promptMeta?: PromptInvocationMeta;
  disableFallbackModel?: boolean;
}

export interface StructuredInvokeResult<T> {
  data: T;
  repairUsed: boolean;
  repairAttempts: number;
  diagnostics: StructuredOutputDiagnostics;
}

export interface StructuredInvokeRawParseInput<T> {
  rawContent: string;
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  label: string;
  maxRepairAttempts?: number;
  promptMeta?: PromptInvocationMeta;
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
  reasoningForcedOff?: boolean;
}

interface StructuredAttemptTarget {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature: number;
  maxTokens?: number;
  profile: StructuredOutputProfile;
}

function buildInvokeMessages<T>(input: StructuredInvokeInput<T>): BaseMessage[] {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages;
  }
  if (typeof input.systemPrompt === "string" && typeof input.userPrompt === "string") {
    return [new SystemMessage(input.systemPrompt), new HumanMessage(input.userPrompt)];
  }
  throw new Error(`[${input.label}] missing prompt messages.`);
}

function tryFixTruncatedJson(raw: string): string {
  const text = raw.trim();
  if (!text) return text;

  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const openBraces = count(/{/g);
  const closeBraces = count(/}/g);
  const openBrackets = count(/\[/g);
  const closeBrackets = count(/]/g);

  let fixed = text.replace(/,\s*$/g, "");
  if (openBrackets > closeBrackets) {
    fixed += "]".repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    fixed += "}".repeat(openBraces - closeBraces);
  }
  return fixed;
}

function tryParseStructuredJsonValue(source: string): { parsed: unknown } | { error: string } {
  try {
    return {
      parsed: JSON.parse(extractJSONValue(source)) as unknown,
    };
  } catch (error) {
    const fixed = tryFixTruncatedJson(source);
    if (fixed === source) {
      return {
        error: [
          "JSON 解析失败：",
          error instanceof Error ? error.message : String(error),
        ].join("\n"),
      };
    }

    try {
      return {
        parsed: JSON.parse(extractJSONValue(fixed)) as unknown,
      };
    } catch (fixedError) {
      return {
        error: [
          "JSON 解析失败：",
          error instanceof Error ? error.message : String(error),
          "截断修复后仍失败：",
          fixedError instanceof Error ? fixedError.message : String(fixedError),
        ].join("\n"),
      };
    }
  }
}

function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
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

interface ArrayLengthRepairHint {
  path: Array<string | number>;
  exactLength: number;
  direction: "expand" | "trim";
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

function normalizeIssuePath(path: readonly PropertyKey[]): Array<string | number> {
  return path.flatMap((segment) => {
    if (typeof segment === "string" || typeof segment === "number") {
      return [segment];
    }
    return [];
  });
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

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function getValueAtPath(root: unknown, path: Array<string | number>): unknown {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
      continue;
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[String(segment)];
      continue;
    }
    return undefined;
  }
  return current;
}

function setValueAtPath(root: unknown, path: Array<string | number>, nextValue: unknown): unknown {
  if (path.length === 0) {
    return nextValue;
  }

  const parentPath = path.slice(0, -1);
  const leaf = path[path.length - 1]!;
  const parent = getValueAtPath(root, parentPath);
  if (Array.isArray(parent) && typeof leaf === "number") {
    parent[leaf] = nextValue;
  } else if (parent && typeof parent === "object" && !Array.isArray(parent)) {
    (parent as Record<string, unknown>)[String(leaf)] = nextValue;
  }
  return root;
}

function normalizeOversizedArrays<T>(
  parsed: unknown,
  error: ZodError,
  schema: ZodType<T>,
): { data: T; trimmedPaths: string[] } | null {
  let normalized = cloneJsonValue(parsed);
  const trimmedPaths: string[] = [];

  for (const issue of error.issues) {
    if (issue.code !== "too_big" || !issue.message.toLowerCase().includes("array")) {
      continue;
    }
    const maximum = typeof (issue as { maximum?: unknown }).maximum === "number"
      ? (issue as { maximum: number }).maximum
      : null;
    if (!Number.isInteger(maximum) || maximum === null || maximum < 0) {
      continue;
    }

    const issuePath = normalizeIssuePath(issue.path);
    const currentValue = getValueAtPath(normalized, issuePath);
    if (!Array.isArray(currentValue) || currentValue.length <= maximum) {
      continue;
    }

    normalized = setValueAtPath(normalized, issuePath, currentValue.slice(0, maximum));
    trimmedPaths.push(formatIssuePath(issuePath));
  }

  if (trimmedPaths.length === 0) {
    return null;
  }

  const final = schema.safeParse(normalized);
  if (!final.success) {
    return null;
  }

  return {
    data: final.data,
    trimmedPaths,
  };
}

function buildDiagnostics(input: {
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  reasoningForcedOff?: boolean;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
  errorCategory?: StructuredOutputErrorCategory | null;
}): StructuredOutputDiagnostics {
  return {
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff ?? false,
    fallbackAvailable: input.fallbackAvailable ?? false,
    fallbackUsed: input.fallbackUsed ?? false,
    errorCategory: input.errorCategory ?? null,
  };
}

function logStructuredInvokeEvent(input: {
  event: string;
  label: string;
  provider?: LLMProvider;
  model?: string;
  taskType?: TaskType;
  latencyMs?: number;
  rawChars?: number;
  repairAttempt?: number;
  strategy?: StructuredOutputStrategy;
  errorCategory?: StructuredOutputErrorCategory | null;
  fallbackUsed?: boolean;
  reasoningForcedOff?: boolean;
}): void {
  console.info(
    [
      "[structured.invoke]",
      `event=${input.event}`,
      `label=${input.label}`,
      `provider=${input.provider ?? "default"}`,
      `model=${input.model ?? "default"}`,
      `taskType=${input.taskType ?? "planner"}`,
      input.strategy ? `strategy=${input.strategy}` : "",
      input.errorCategory ? `errorCategory=${input.errorCategory}` : "",
      typeof input.repairAttempt === "number" ? `repairAttempt=${input.repairAttempt}` : "",
      typeof input.latencyMs === "number" ? `latencyMs=${input.latencyMs}` : "",
      typeof input.rawChars === "number" ? `rawChars=${input.rawChars}` : "",
      input.fallbackUsed ? "fallbackUsed=true" : "",
      input.reasoningForcedOff ? "reasoningForcedOff=true" : "",
    ].filter(Boolean).join(" "),
  );
}

function buildStructuredError(input: {
  message: string;
  category: StructuredOutputErrorCategory;
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  reasoningForcedOff?: boolean;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
}): StructuredOutputError {
  return new StructuredOutputError({
    message: input.message,
    category: input.category,
    diagnostics: buildDiagnostics({
      strategy: input.strategy,
      profile: input.profile,
      reasoningForcedOff: input.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      errorCategory: input.category,
    }),
  });
}

function wrapStructuredInvokeError(input: {
  label: string;
  error: unknown;
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  rawContent?: string;
  reasoningForcedOff?: boolean;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
}): StructuredOutputError {
  if (input.error instanceof StructuredOutputError) {
    return input.error;
  }
  const category = classifyStructuredOutputFailure({
    error: input.error,
    rawContent: input.rawContent,
  });
  const message = input.error instanceof Error
    ? input.error.message
    : typeof input.error === "string"
      ? input.error
      : `[${input.label}] Structured output failed.`;
  return buildStructuredError({
    message,
    category,
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
  });
}

function buildStrategySequence<T>(
  profile: StructuredOutputProfile,
  schema: ZodType<T>,
): StructuredOutputStrategy[] {
  const first = selectStructuredOutputStrategy(profile, schema);
  const sequence: StructuredOutputStrategy[] = [first];
  if (first === "json_schema" && profile.nativeJsonObject) {
    sequence.push("json_object");
  }
  if (first !== "prompt_json") {
    sequence.push("prompt_json");
  }
  return Array.from(new Set(sequence));
}

function computeAttemptTemperature(baseTemperature: number, strategyIndex: number): number {
  if (strategyIndex === 0) {
    return baseTemperature;
  }
  return Math.min(baseTemperature, 0.2);
}

async function repairWithLlm<T>(
  input: Pick<
    StructuredInvokeInput<T>,
    "provider" | "model" | "apiKey" | "baseURL" | "maxTokens" | "taskType" | "label" | "schema" | "promptMeta"
  >,
  rawContent: string,
  validationError: string,
  repairAttempt: number,
): Promise<T> {
  logStructuredInvokeEvent({
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
    taskType: input.taskType ?? "planner",
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
    const result = await llm.invoke([new SystemMessage(repairSystem), new HumanMessage(repairHuman)]);
    const repairedRaw = toText(result.content);
    const latencyMs = Date.now() - startedAt;
    logStructuredInvokeEvent({
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
    const repairParse = tryParseStructuredJsonValue(repairedRaw);
    if ("error" in repairParse) {
      throw new Error(`[${input.label}] JSON repair 后仍无法解析。错误：${repairParse.error}`);
    }

    const final = input.schema.safeParse(repairParse.parsed);
    if (!final.success) {
      const normalized = normalizeOversizedArrays(repairParse.parsed, final.error, input.schema);
      if (normalized) {
        logStructuredInvokeEvent({
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
      throw new Error(`[${input.label}] JSON repair 后仍未通过 Schema 校验。错误：${formatZodErrors(final.error)}`);
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

export function shouldUseJsonObjectResponseFormat<T>(
  provider: LLMProvider,
  model: string | undefined,
  schema: ZodType<T>,
  baseURL?: string,
): boolean {
  const profile = resolveStructuredOutputProfile({
    provider,
    model,
    baseURL,
    executionMode: "structured",
  });
  return selectStructuredOutputStrategy(profile, schema) === "json_object";
}

export async function parseStructuredLlmRawContentDetailed<T>(
  input: StructuredInvokeRawParseInput<T>,
): Promise<StructuredInvokeResult<T>> {
  const runtimeSchema = relaxGeneratedContentSchema(input.schema);
  const diagnostics = buildDiagnostics({
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
  });
  const initialParse = tryParseStructuredJsonValue(input.rawContent);
  const parseErrorMessage = "error" in initialParse ? initialParse.error : "";
  const parsed = "parsed" in initialParse ? initialParse.parsed : null;

  const maxRepairAttempts = input.maxRepairAttempts ?? 1;
  if (parseErrorMessage) {
    for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
      try {
        return {
          data: await repairWithLlm({
            ...input,
            schema: runtimeSchema,
          }, input.rawContent, parseErrorMessage, attempt),
          repairUsed: true,
          repairAttempts: attempt,
          diagnostics,
        };
      } catch (repairError) {
        if (attempt >= maxRepairAttempts) {
          throw buildStructuredError({
            message: `[${input.label}] JSON 解析失败且修复未成功。错误：${repairError instanceof Error ? repairError.message : String(repairError)}`,
            category: classifyStructuredOutputFailure({
              error: repairError,
              rawContent: input.rawContent,
            }),
            strategy: input.strategy,
            profile: input.profile,
            reasoningForcedOff: input.reasoningForcedOff,
            fallbackAvailable: input.fallbackAvailable,
            fallbackUsed: input.fallbackUsed,
          });
        }
      }
    }
  }

  const first = runtimeSchema.safeParse(parsed);
  if (first.success) {
    return {
      data: first.data,
      repairUsed: false,
      repairAttempts: 0,
      diagnostics,
    };
  }

  const normalizedInitial = normalizeOversizedArrays(parsed, first.error, runtimeSchema);
  if (normalizedInitial) {
    logStructuredInvokeEvent({
      event: "normalized",
      label: input.label,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      strategy: input.strategy,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: input.reasoningForcedOff,
    });
    return {
      data: normalizedInitial.data,
      repairUsed: false,
      repairAttempts: 0,
      diagnostics,
    };
  }

  let zodError: ZodError = first.error;
  for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
    try {
      return {
        data: await repairWithLlm({
          ...input,
          schema: runtimeSchema,
        }, input.rawContent, `Zod 校验错误：\n${formatZodErrors(zodError)}`, attempt),
        repairUsed: true,
        repairAttempts: attempt,
        diagnostics,
      };
    } catch (error) {
      if (attempt >= maxRepairAttempts) {
        throw buildStructuredError({
          message: `[${input.label}] LLM 输出经修复后仍未通过 Schema 校验。错误：${error instanceof Error ? error.message : String(error)}`,
          category: "schema_mismatch",
          strategy: input.strategy,
          profile: input.profile,
          reasoningForcedOff: input.reasoningForcedOff,
          fallbackAvailable: input.fallbackAvailable,
          fallbackUsed: input.fallbackUsed,
        });
      }
      if (error instanceof z.ZodError) {
        zodError = error as ZodError;
      }
    }
  }

  throw buildStructuredError({
    message: `[${input.label}] LLM 输出经修复后仍未通过 Schema 校验。错误：${formatZodErrors(zodError)}`,
    category: "schema_mismatch",
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
  });
}

async function resolveAttemptTarget(input: {
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
}): Promise<StructuredAttemptTarget> {
  const resolved = await resolveLLMClientOptions(input.provider, {
    fallbackProvider: "deepseek",
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    executionMode: "plain",
  });
  return {
    provider: resolved.provider,
    model: resolved.model,
    apiKey: input.apiKey,
    baseURL: resolved.baseURL,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    profile: resolveStructuredOutputProfile({
      provider: resolved.provider,
      model: resolved.model,
      baseURL: resolved.baseURL,
      executionMode: "structured",
    }),
  };
}

async function invokeStructuredAttempt<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  strategy: StructuredOutputStrategy;
  strategyIndex: number;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
}): Promise<StructuredInvokeResult<T>> {
  const attemptTemperature = computeAttemptTemperature(input.target.temperature, input.strategyIndex);
  const resolved = await resolveLLMClientOptions(input.target.provider, {
    fallbackProvider: "deepseek",
    apiKey: input.target.apiKey,
    baseURL: input.target.baseURL,
    model: input.target.model,
    temperature: attemptTemperature,
    maxTokens: input.target.maxTokens,
    taskType: input.baseInput.taskType ?? "planner",
    promptMeta: input.baseInput.promptMeta,
    executionMode: "structured",
    structuredStrategy: input.strategy,
  });
  const llm = createLLMFromResolvedOptions(resolved);
  const invokeOptions: Record<string, unknown> = {};
  const responseFormat = buildStructuredResponseFormat({
    strategy: input.strategy,
    schema: input.baseInput.schema,
    label: input.baseInput.label,
  });
  if (responseFormat) {
    invokeOptions.response_format = responseFormat;
  }

  const messages = buildInvokeMessages(input.baseInput);
  logStructuredInvokeEvent({
    event: "invoke_start",
    label: input.baseInput.label,
    provider: resolved.provider,
    model: resolved.model,
    taskType: input.baseInput.taskType,
    strategy: input.strategy,
    fallbackUsed: input.fallbackUsed,
    reasoningForcedOff: resolved.reasoningForcedOff,
  });
  const startedAt = Date.now();
  try {
    const result = await llm.invoke(messages, invokeOptions);
    const rawContent = toText(result.content);
    logStructuredInvokeEvent({
      event: "invoke_done",
      label: input.baseInput.label,
      provider: resolved.provider,
      model: resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      rawChars: rawContent.length,
      strategy: input.strategy,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
    return parseStructuredLlmRawContentDetailed({
      rawContent,
      schema: input.baseInput.schema,
      provider: resolved.provider,
      model: resolved.model,
      apiKey: input.target.apiKey,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      taskType: input.baseInput.taskType,
      label: input.baseInput.label,
      maxRepairAttempts: input.baseInput.maxRepairAttempts,
      promptMeta: input.baseInput.promptMeta,
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
  } catch (error) {
    const category = error instanceof StructuredOutputError
      ? error.category
      : classifyStructuredOutputFailure({ error });
    logStructuredInvokeEvent({
      event: "invoke_error",
      label: input.baseInput.label,
      provider: resolved.provider,
      model: resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      strategy: input.strategy,
      errorCategory: category,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
    throw wrapStructuredInvokeError({
      label: input.baseInput.label,
      error,
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      reasoningForcedOff: resolved.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
    });
  }
}

async function tryStructuredStrategies<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
}): Promise<StructuredInvokeResult<T>> {
  const sequence = buildStrategySequence(input.target.profile, input.baseInput.schema);
  let lastError: StructuredOutputError | null = null;
  for (let index = 0; index < sequence.length; index += 1) {
    const strategy = sequence[index]!;
    try {
      return await invokeStructuredAttempt({
        baseInput: input.baseInput,
        target: input.target,
        strategy,
        strategyIndex: index,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
    } catch (error) {
      lastError = wrapStructuredInvokeError({
        label: input.baseInput.label,
        error,
        strategy,
        profile: input.target.profile,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
      if (lastError.category === "schema_mismatch" && strategy === "prompt_json") {
        break;
      }
    }
  }
  throw lastError ?? buildStructuredError({
    message: `[${input.baseInput.label}] Structured output failed.`,
    category: "transport_error",
    strategy: selectStructuredOutputStrategy(input.target.profile, input.baseInput.schema),
    profile: input.target.profile,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
  });
}

export async function invokeStructuredLlmDetailed<T>(input: StructuredInvokeInput<T>): Promise<StructuredInvokeResult<T>> {
  const primaryTarget = await resolveAttemptTarget({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
  });
  const fallbackSettings = input.disableFallbackModel ? null : await getStructuredFallbackSettings();
  const fallbackEnabled = Boolean(
    fallbackSettings?.enabled
    && fallbackSettings.model.trim().length > 0
    && !(
      fallbackSettings.provider === primaryTarget.provider
      && fallbackSettings.model === primaryTarget.model
    ),
  );

  try {
    return await tryStructuredStrategies({
      baseInput: input,
      target: primaryTarget,
      fallbackAvailable: fallbackEnabled,
      fallbackUsed: false,
    });
  } catch (primaryError) {
    if (!fallbackEnabled || !fallbackSettings) {
      throw primaryError;
    }

    const fallbackTarget = await resolveAttemptTarget({
      provider: fallbackSettings.provider,
      model: fallbackSettings.model,
      temperature: fallbackSettings.temperature,
      maxTokens: fallbackSettings.maxTokens ?? undefined,
      taskType: input.taskType ?? "planner",
    });
    try {
      return await tryStructuredStrategies({
        baseInput: {
          ...input,
          provider: fallbackTarget.provider,
          model: fallbackTarget.model,
          temperature: fallbackTarget.temperature,
          maxTokens: fallbackTarget.maxTokens,
          disableFallbackModel: true,
        },
        target: fallbackTarget,
        fallbackAvailable: true,
        fallbackUsed: true,
      });
    } catch (fallbackError) {
      throw fallbackError instanceof StructuredOutputError
        ? fallbackError
        : primaryError;
    }
  }
}

export async function invokeStructuredLlm<T>(input: StructuredInvokeInput<T>): Promise<T> {
  const result = await invokeStructuredLlmDetailed(input);
  return result.data;
}

export function summarizeStructuredOutputFailure(input: {
  error: unknown;
  fallbackAvailable?: boolean;
}): {
  category: StructuredOutputErrorCategory;
  failureCode: string;
  summary: string;
} {
  const message = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  const category = input.error instanceof StructuredOutputError
    ? input.error.category
    : extractStructuredOutputErrorCategory(message) ?? classifyStructuredOutputFailure({ error: input.error });
  const suffix = input.fallbackAvailable ? "，可考虑启用结构化备用模型。" : "。";
  const summaryMap: Record<StructuredOutputErrorCategory, string> = {
    unsupported_native_json: `当前模型端点不兼容原生 JSON 输出${suffix}`,
    thinking_pollution: `当前模型的思考内容污染了结构化输出${suffix}`,
    incomplete_json: `模型输出的 JSON 被截断或不完整${suffix}`,
    malformed_json: `模型输出的 JSON 格式不稳定${suffix}`,
    schema_mismatch: `模型输出未满足目标结构要求${suffix}`,
    transport_error: `结构化调用过程发生传输或服务端错误${suffix}`,
  };
  return {
    category,
    failureCode: `STRUCTURED_OUTPUT_${category.toUpperCase()}`,
    summary: summaryMap[category],
  };
}

export { schemaAllowsTopLevelArray };
