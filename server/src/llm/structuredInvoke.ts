import { z, type ZodError, type ZodType } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import { getLLM } from "./factory";
import { getJsonCapability } from "./capabilities";
import { toText, extractJSONValue } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

export interface StructuredInvokeInput<T> {
  systemPrompt?: string;
  userPrompt?: string;
  messages?: BaseMessage[];
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  label: string;
  maxRepairAttempts?: number; // 默认 1
  promptMeta?: PromptInvocationMeta;
}

export interface StructuredInvokeResult<T> {
  data: T;
  repairUsed: boolean;
  repairAttempts: number;
}

export interface StructuredInvokeRawParseInput<T> {
  rawContent: string;
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  label: string;
  maxRepairAttempts?: number;
  promptMeta?: PromptInvocationMeta;
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

  // 简单的括号/方括号补全：用于模型输出被截断时提升成功率。
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const openBraces = count(/{/g);
  const closeBraces = count(/}/g);
  const openBrackets = count(/\[/g);
  const closeBrackets = count(/]/g);

  let fixed = text;

  // 去掉可能的末尾多余逗号（降低修复难度）
  fixed = fixed.replace(/,\s*$/g, "");

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

function schemaAllowsTopLevelArray<T>(schema: ZodType<T>): boolean {
  const probe = schema.safeParse([]);
  if (probe.success) {
    return true;
  }
  return probe.error.issues.some((issue) => issue.path.length === 0 && issue.code !== "invalid_type");
}

export function shouldUseJsonObjectResponseFormat<T>(
  provider: LLMProvider,
  model: string | undefined,
  schema: ZodType<T>,
): boolean {
  if (!getJsonCapability(provider, model).supportsJsonObject) {
    return false;
  }
  return !schemaAllowsTopLevelArray(schema);
}

async function repairWithLlm<T>(
  input: Pick<StructuredInvokeInput<T>, "provider" | "model" | "maxTokens" | "taskType" | "label" | "schema" | "promptMeta">,
  rawContent: string,
  validationError: string,
  repairAttempt: number,
): Promise<T> {
  const llm = await getLLM(input.provider, {
    fallbackProvider: "deepseek",
    model: input.model,
    temperature: 0.15,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    promptMeta: input.promptMeta ? {
      ...input.promptMeta,
      repairUsed: true,
      repairAttempts: repairAttempt,
    } : undefined,
  });

  const repairSystem = [
    "你是 JSON 修复器。",
    "你的任务是：只输出严格合法的 JSON 值，且必须通过给定的结构校验。",
    "最终输出可能是 JSON 对象，也可能是 JSON 数组；必须与目标结构一致。",
    "不要输出任何解释、Markdown 或额外字段。",
    "如果校验错误提示某个字段缺失，必须直接使用错误路径里的字段名作为 JSON 键名，不要翻译成中文别名。",
    "如果目标结构顶层是数组，就直接输出数组本身，不要再外包一层对象。",
    "如果原始 JSON 多包了一层无关包装键，例如 data、result、output、xxxProjection、xxxList 等，必须去掉包装层，把真正目标结构提升到顶层。",
    "如果缺失必填字符串字段，必须补出非空字符串；可根据原始 JSON 中已有内容做最小、保守、语义一致的补全，不能输出空字符串、null 或 undefined。",
  ].join("\n");

  const validationPaths = extractValidationPaths(validationError);

  const repairHuman = [
    `校验失败：${input.label}`,
    validationError,
    ...(validationPaths.length > 0 ? [
      "",
      `至少需要修复这些路径：${validationPaths.join(", ")}`,
    ] : []),
    "",
    "原始模型输出（可能包含多余文字/markdown/截断）：",
    rawContent,
    "",
    "请修复后只输出最终 JSON。",
  ].join("\n");

  const result = await llm.invoke([new SystemMessage(repairSystem), new HumanMessage(repairHuman)]);
  const repairedRaw = toText(result.content);
  const repairParse = tryParseStructuredJsonValue(repairedRaw);
  if ("error" in repairParse) {
    throw new Error(`[${input.label}] JSON repair 后仍无法解析。错误：${repairParse.error}`);
  }

  const final = input.schema.safeParse(repairParse.parsed);
  if (!final.success) {
    throw new Error(`[${input.label}] JSON repair 后仍未通过 Schema 校验。错误：${formatZodErrors(final.error)}`);
  }
  return final.data;
}

export async function parseStructuredLlmRawContentDetailed<T>(
  input: StructuredInvokeRawParseInput<T>,
): Promise<StructuredInvokeResult<T>> {
  const initialParse = tryParseStructuredJsonValue(input.rawContent);
  const parseErrorMessage = "error" in initialParse ? initialParse.error : "";
  const parsed = "parsed" in initialParse ? initialParse.parsed : null;

  const maxRepairAttempts = input.maxRepairAttempts ?? 1;
  if (parseErrorMessage) {
    for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
      try {
        return {
          data: await repairWithLlm(input, input.rawContent, parseErrorMessage, attempt),
          repairUsed: true,
          repairAttempts: attempt,
        };
      } catch (repairError) {
        if (attempt >= maxRepairAttempts) {
          throw repairError;
        }
      }
    }
    throw new Error(`[${input.label}] JSON 解析失败且修复未成功。`);
  }

  const first = input.schema.safeParse(parsed);
  if (first.success) {
    return {
      data: first.data,
      repairUsed: false,
      repairAttempts: 0,
    };
  }

  let zodError: ZodError = first.error;

  for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
    try {
      return {
        data: await repairWithLlm(input, input.rawContent, `Zod 校验错误：\n${formatZodErrors(zodError)}`, attempt),
        repairUsed: true,
        repairAttempts: attempt,
      };
    } catch (error) {
      if (attempt >= maxRepairAttempts) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        zodError = error as ZodError;
      }
    }
  }

  throw new Error(`[${input.label}] LLM 输出经修复后仍未通过 Schema 校验。错误：${formatZodErrors(zodError)}`);
}

export async function invokeStructuredLlmDetailed<T>(input: StructuredInvokeInput<T>): Promise<StructuredInvokeResult<T>> {
  const llm = await getLLM(input.provider, {
    fallbackProvider: "deepseek",
    model: input.model,
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    promptMeta: input.promptMeta,
  });

  const cap = getJsonCapability(input.provider ?? "deepseek", input.model);

  const invokeOptions: Record<string, unknown> = {};
  if (cap.supportsJsonObject && shouldUseJsonObjectResponseFormat(input.provider ?? "deepseek", input.model, input.schema)) {
    invokeOptions.response_format = { type: "json_object" };
  }

  const messages = buildInvokeMessages(input);
  const result = await llm.invoke(messages, invokeOptions);
  const rawContent = toText(result.content);

  return parseStructuredLlmRawContentDetailed({
    rawContent,
    schema: input.schema,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    taskType: input.taskType,
    label: input.label,
    maxRepairAttempts: input.maxRepairAttempts,
    promptMeta: input.promptMeta,
  });
}

export async function invokeStructuredLlm<T>(input: StructuredInvokeInput<T>): Promise<T> {
  const result = await invokeStructuredLlmDetailed(input);
  return result.data;
}

