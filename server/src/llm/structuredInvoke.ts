import { z, type ZodError, type ZodType } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import { getLLM } from "./factory";
import { getJsonCapability } from "./capabilities";
import { toText, extractJSONObject } from "../services/novel/novelP0Utils";

interface StructuredInvokeInput<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  label: string;
  maxRepairAttempts?: number; // 默认 1
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

function formatZodErrors(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}

async function repairWithLlm<T>(input: StructuredInvokeInput<T>, rawContent: string, zodError: ZodError): Promise<T> {
  const llm = await getLLM(input.provider, {
    fallbackProvider: "deepseek",
    model: input.model,
    temperature: 0.15,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
  });

  const repairSystem = [
    "你是 JSON 修复器。",
    "你的任务是：只输出严格合法的 JSON 对象，且必须通过给定的结构校验。",
    "不要输出任何解释、Markdown 或额外字段。",
  ].join("\n");

  const repairHuman = [
    `校验失败：${input.label}`,
    "Zod 校验错误：",
    formatZodErrors(zodError),
    "",
    "原始模型输出（可能包含多余文字/markdown/截断）：",
    rawContent,
    "",
    "请修复后只输出最终 JSON 对象。",
  ].join("\n");

  const result = await llm.invoke([new SystemMessage(repairSystem), new HumanMessage(repairHuman)]);
  const repairedRaw = toText(result.content);

  // repair 后仍然走同样的 extract + parse + safeParse
  const extracted = extractJSONObject(repairedRaw);
  const parsed = JSON.parse(extracted) as unknown;
  const final = input.schema.safeParse(parsed);
  if (!final.success) {
    throw new Error(`[${input.label}] JSON repair 后仍未通过 Schema 校验。错误：${formatZodErrors(final.error)}`);
  }
  return final.data;
}

export async function invokeStructuredLlm<T>(input: StructuredInvokeInput<T>): Promise<T> {
  const llm = await getLLM(input.provider, {
    fallbackProvider: "deepseek",
    model: input.model,
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
  });

  const cap = getJsonCapability(input.provider ?? "deepseek", input.model);

  const invokeOptions: Record<string, unknown> = {};
  if (cap.supportsJsonObject) {
    invokeOptions.response_format = { type: "json_object" };
  }

  const result = await llm.invoke([new SystemMessage(input.systemPrompt), new HumanMessage(input.userPrompt)], invokeOptions);
  const rawContent = toText(result.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSONObject(rawContent));
  } catch {
    // 截断修复后再试一次
    const fixed = tryFixTruncatedJson(rawContent);
    parsed = JSON.parse(extractJSONObject(fixed));
  }

  const first = input.schema.safeParse(parsed);
  if (first.success) {
    return first.data;
  }

  const maxRepairAttempts = input.maxRepairAttempts ?? 1;
  let attempt = 0;
  let zodError = first.error;

  while (attempt < maxRepairAttempts) {
    attempt += 1;
    return await repairWithLlm(input, rawContent, zodError);
  }

  throw new Error(`[${input.label}] LLM 输出经修复后仍未通过 Schema 校验。错误：${formatZodErrors(zodError)}`);
}

