import { prisma } from "../../../db/prisma";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
export interface ModelTokenSettings {
  maxOutputTokens: number | null;
  contextWindowTokens: number | null;
  maxInputTokens: number | null;
  maxReasoningTokens: number | null;
  budgetSharing: "unknown" | "shared" | "separate";
  requestProtocol: ModelRouteRequestProtocol;
  chatReasoningFormat: "none" | "reasoning_effort";
  thinkingMode: "default" | "disabled" | "enabled" | "adaptive";
  thinkingEffort: "default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  thinkingBudgetTokens: number | null;
  outputTokenParameter: "auto" | "max_tokens" | "max_completion_tokens";
}
export const EMPTY_MODEL_TOKEN_SETTINGS: ModelTokenSettings = { maxOutputTokens: null, contextWindowTokens: null,
  maxInputTokens: null, maxReasoningTokens: null, budgetSharing: "unknown", requestProtocol: "auto",
  chatReasoningFormat:"none", thinkingMode: "default", thinkingEffort: "default", thinkingBudgetTokens: null, outputTokenParameter: "auto" };
const key = (provider: string, model: string) => `llm.modelTokens.${JSON.stringify([provider, model])}`;
export function validateOutputTokens(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("最大输出必须是正整数，留空使用原默认值。");
  return value;
}
export async function getModelTokenSettings(provider: string, model: string): Promise<ModelTokenSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(provider, model) } });
    const result = row ? {...EMPTY_MODEL_TOKEN_SETTINGS,...JSON.parse(row.value)} : {...EMPTY_MODEL_TOKEN_SETTINGS};
    for(const field of ["maxOutputTokens","contextWindowTokens","maxInputTokens","maxReasoningTokens","thinkingBudgetTokens"]) validateOutputTokens(result[field]);
    return result;
  } catch (error) {
    if((error as {code?:string})?.code === "P2021") return {...EMPTY_MODEL_TOKEN_SETTINGS};
    throw new Error("读取模型接口与预算设置失败，请检查本地设置后重试。");
  }
}
export async function saveModelTokenSettings(provider: string, model: string, patch: Partial<ModelTokenSettings>): Promise<ModelTokenSettings> {
  const value = { ...await getModelTokenSettings(provider, model), ...patch };
  for (const field of ["maxOutputTokens", "contextWindowTokens", "maxInputTokens", "maxReasoningTokens", "thinkingBudgetTokens"] as const) value[field] = validateOutputTokens(value[field]) ?? null;
  if (!["unknown", "shared", "separate"].includes(value.budgetSharing)) throw new Error("预算关系无效。");
  await prisma.appSetting.upsert({ where: { key: key(provider, model) },
    create: { key: key(provider, model), value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  return value;
}
