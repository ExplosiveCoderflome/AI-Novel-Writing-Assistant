import { z, type ZodError, type ZodType } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import type { TaskType } from "./modelRouter";
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
import type { LlmTokenUsageSnapshot } from "./usageTracking";
import { ResponseTerminationError, StructuredRepairRefusalError, type ResponseDiagnostics } from "./structured";

export interface StructuredInvokeResult<T> {
  data: T;
  repairUsed: boolean;
  repairAttempts: number;
  diagnostics: StructuredOutputDiagnostics;
  tokenUsage?: LlmTokenUsageSnapshot | null;
}

export interface StructuredInvokeRawParseInput<T> {
  rawContent: string;
  schema: ZodType<T>;
  tokenUsage?: LlmTokenUsageSnapshot | null;
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  defaultMaxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  label: string;
  maxRepairAttempts?: number;
  repairGuidance?: string;
  promptMeta?: PromptInvocationMeta;
  onRepairOutputDelta?: (content: string) => void;
  repairMessages?: import("@langchain/core/messages").BaseMessage[];
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
  reasoningForcedOff?: boolean;
  response?: ResponseDiagnostics;
}

function tryParseStructuredJsonValue(source: string): { parsed: unknown } | { error: string } {
  try { return { parsed: JSON.parse(extractJSONValue(source)) as unknown }; }
  catch (error) { return { error: error instanceof Error ? error.message : "JSON 解析失败。" }; }
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

function buildDiagnostics(input: {
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  reasoningForcedOff?: boolean;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
  errorCategory?: StructuredOutputErrorCategory | null;
  response?: ResponseDiagnostics;
  repairFailure?: StructuredOutputDiagnostics["repairFailure"];
}): StructuredOutputDiagnostics {
  return {
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff ?? false,
    fallbackAvailable: input.fallbackAvailable ?? false,
    fallbackUsed: input.fallbackUsed ?? false,
    errorCategory: input.errorCategory ?? null,
    response: input.response,
    repairFailure: input.repairFailure,
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
  response?: ResponseDiagnostics;
  schemaIssues?: Array<{ path: Array<string | number>; code: string }>;
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
      input.response ? `finishReason=${input.response.finishReason ?? "unknown"} outputTokens=${input.response.outputTokens ?? "unknown"} reasoningChars=${input.response.reasoningChars}` : "",
      input.schemaIssues ? `schemaIssues=${JSON.stringify(input.schemaIssues)}` : "",
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
  retryWithNextStrategy?: boolean;
  retryable?: boolean;
  response?: ResponseDiagnostics;
  repairFailure?: StructuredOutputDiagnostics["repairFailure"];
  reasoningForcedOff?: boolean;
  fallbackAvailable?: boolean;
  fallbackUsed?: boolean;
}): StructuredOutputError {
  return new StructuredOutputError({
    message: input.message,
    category: input.category,
    retryWithNextStrategy: input.retryWithNextStrategy,
    retryable: input.retryable,
    diagnostics: buildDiagnostics({
      strategy: input.strategy,
      profile: input.profile,
      reasoningForcedOff: input.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      errorCategory: input.category,
      response: input.response,
      repairFailure: input.repairFailure,
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
  if (input.error instanceof ResponseTerminationError) {
    return buildStructuredError({ ...input, message: input.error.message,
      category: input.error.category, response: input.error.response, retryable: false });
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
    retryable: category !== "input_budget_exceeded" && ((input.error as {retryable?:boolean})?.retryable !== false || category === "unsupported_native_json"),
  });
}

function getRepairHelpers<T>() {
  return {
    tryParseStructuredJsonValue,
    tryUnwrapSingletonArrayWrapper,
    formatZodErrors,
    logStructuredInvokeEvent,
  };
}

function buildRepairRefusal<T>(input: StructuredInvokeRawParseInput<T>, error: StructuredRepairRefusalError,
  attempt: number, category: StructuredOutputErrorCategory): StructuredOutputError {
  logStructuredInvokeEvent({ ...input, event: "repair_refused", repairAttempt: attempt,
    errorCategory: category, response: error.response });
  return buildStructuredError({ ...input, message: `[${input.label}] ${error.message}`,
    category, retryable: false,
    repairFailure: { kind: "refused", attempt, originalCategory: category, response: error.response } });
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
  const runtimeSchema: ZodType<T> = input.schema;
  const diagnostics = buildDiagnostics({
    strategy: input.strategy,
    profile: input.profile,
    reasoningForcedOff: input.reasoningForcedOff,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
    response: input.response,
  });
  if (!input.rawContent.trim()) {
    throw buildStructuredError({
      message: `[${input.label}] 模型没有返回可用内容，无法执行结构校验或 JSON 修复。`,
      category: "transport_error",
      retryWithNextStrategy: input.strategy !== "prompt_json",
      strategy: input.strategy,
      profile: input.profile,
      reasoningForcedOff: input.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
    });
  }
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
          tokenUsage: input.tokenUsage ?? null,
        };
      } catch (repairError) {
        if (repairError instanceof ResponseTerminationError) throw wrapStructuredInvokeError({ ...input, error: repairError });
        if (repairError instanceof StructuredRepairRefusalError) {
          throw buildRepairRefusal(input, repairError, attempt, classifyStructuredOutputFailure({ error: parseErrorMessage }));
        }
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

  if (parseErrorMessage) {
    throw buildStructuredError({ message: `[${input.label}] ${parseErrorMessage}`,
      category: classifyStructuredOutputFailure({ error: parseErrorMessage }),
      strategy: input.strategy, profile: input.profile, response: input.response });
  }
  const first = runtimeSchema.safeParse(parsed);
  if (first.success) {
    return {
      data: first.data,
      repairUsed: false,
      repairAttempts: 0,
      diagnostics,
      tokenUsage: input.tokenUsage ?? null,
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
      tokenUsage: input.tokenUsage ?? null,
    };
  }

  let zodError: ZodError = first.error;
  logStructuredInvokeEvent({ ...input, event: "schema_validation_failed", errorCategory: "schema_mismatch",
    schemaIssues: first.error.issues.slice(0, 32).map(issue => ({ code: issue.code,
      path: issue.path.map(part => typeof part === "number" ? part
        : typeof part === "string" && /^[a-zA-Z0-9_]{1,64}$/.test(part) ? part : "(key)") })) });
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
        tokenUsage: input.tokenUsage ?? null,
      };
    } catch (error) {
      if (error instanceof ResponseTerminationError) throw wrapStructuredInvokeError({ ...input, error });
      if (error instanceof StructuredRepairRefusalError) {
        throw buildRepairRefusal(input, error, attempt, "schema_mismatch");
      }
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
