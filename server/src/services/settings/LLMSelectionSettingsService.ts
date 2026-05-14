import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";

const LLM_SELECTION_SETTING_KEY = "llm.currentSelection";
const DEFAULT_TEMPERATURE = 0.7;

export interface LLMSelectionSettings {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export type SaveLLMSelectionSettingsInput = Omit<LLMSelectionSettings, "temperature"> & {
  temperature?: number;
};

function normalizeProvider(value: unknown): LLMProvider | null {
  return typeof value === "string" && value.trim() ? (value.trim() as LLMProvider) : null;
}

function normalizeModel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTemperature(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, value));
}

function normalizeMaxTokens(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized >= 256 && normalized <= 32768 ? normalized : undefined;
}

function parseSelectionPayload(value: string): LLMSelectionSettings | null {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    const provider = normalizeProvider(payload.provider);
    const model = normalizeModel(payload.model);
    if (!provider || !model) {
      return null;
    }
    const maxTokens = normalizeMaxTokens(payload.maxTokens);
    return {
      provider,
      model,
      temperature: normalizeTemperature(payload.temperature),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    };
  } catch {
    return null;
  }
}

function serializeSelection(input: LLMSelectionSettings): string {
  const maxTokens = normalizeMaxTokens(input.maxTokens);
  return JSON.stringify({
    provider: input.provider,
    model: input.model,
    temperature: normalizeTemperature(input.temperature),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  });
}

export async function getLLMSelectionSettings(): Promise<LLMSelectionSettings | null> {
  const record = await prisma.appSetting.findUnique({
    where: { key: LLM_SELECTION_SETTING_KEY },
  });
  return record ? parseSelectionPayload(record.value) : null;
}

export async function saveLLMSelectionSettings(input: SaveLLMSelectionSettingsInput): Promise<LLMSelectionSettings> {
  const provider = normalizeProvider(input.provider);
  const model = normalizeModel(input.model);
  if (!provider || !model) {
    throw new Error("模型厂商和模型名称不能为空。");
  }
  const maxTokens = normalizeMaxTokens(input.maxTokens);
  const settings: LLMSelectionSettings = {
    provider,
    model,
    temperature: normalizeTemperature(input.temperature),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
  await prisma.appSetting.upsert({
    where: { key: LLM_SELECTION_SETTING_KEY },
    update: { value: serializeSelection(settings) },
    create: { key: LLM_SELECTION_SETTING_KEY, value: serializeSelection(settings) },
  });
  return settings;
}
