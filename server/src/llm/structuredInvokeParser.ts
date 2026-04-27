import { z, type ZodError, type ZodType } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import type { TaskType } from "./modelRouter";
import { relaxGeneratedContentSchema } from "./generatedContentSchema";
import { repairWithLlm } from "./structuredInvokeRepair";
import {
  classifyStructuredOutputFailure,
  resolveStructuredOutputProfile,
  schemaAllowsTopLevelArray,
  selectStructuredOutputStrategy,
  StructuredOutputError,
  type StructuredOutputDiagnostics,
  type StructuredOutputErrorCategory,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { extractJSONValue } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

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
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  label: string;
  maxRepairAttempts?: number;
  promptMeta?: PromptInvocationMeta;
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
  reasoningForcedOff?: boolean;
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

function tryUnwrapSingletonArrayWrapper<T>(
  parsed: unknown,
  schema: ZodType<T>,
): { data: T } | null {
  if (!Array.isArray(parsed) || parsed.length !== 1 || schemaAllowsTopLevelArray(schema)) {
    return null;
  }

  const unwrapped = schema.safeParse(parsed[0]);
  if (!unwrapped.success) {
    return null;
  }

  return {
    data: unwrapped.data,
  };
}

function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
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

export function logStructuredInvokeEvent(input: {
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

export function buildStructuredError(input: {
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

export function wrapStructuredInvokeError(input: {
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

function getRepairHelpers<T>() {
  return {
    tryParseStructuredJsonValue,
    tryUnwrapSingletonArrayWrapper,
    normalizeOversizedArrays,
    formatZodErrors,
    logStructuredInvokeEvent,
  };
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
  const runtimeSchema: ZodType<T> = relaxGeneratedContentSchema(input.schema);
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
          data: await repairWithLlm<T>({
            ...input,
            schema: runtimeSchema,
          }, input.rawContent, parseErrorMessage, attempt, getRepairHelpers<T>()),
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

  const unwrappedInitial = tryUnwrapSingletonArrayWrapper(parsed, runtimeSchema);
  if (unwrappedInitial) {
    logStructuredInvokeEvent({
      event: "unwrapped_singleton_array",
      label: input.label,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      strategy: input.strategy,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: input.reasoningForcedOff,
    });
    return {
      data: unwrappedInitial.data,
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
        data: await repairWithLlm<T>({
          ...input,
          schema: runtimeSchema,
        }, input.rawContent, `Zod 校验错误：\n${formatZodErrors(zodError)}`, attempt, getRepairHelpers<T>()),
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
