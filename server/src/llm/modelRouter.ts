import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../db/prisma";
import { PROVIDERS } from "./providers";

export type TaskType =
  | "outline_planning"
  | "chapter_drafting"
  | "chapter_review"
  | "chapter_repair"
  | "summary_generation"
  | "fact_extraction"
  | "consistency_check"
  | "character_dialogue"
  | "style_analysis"
  | "chat"
  | "default";

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
}

const DEFAULT_ROUTES: Record<TaskType, ResolvedModel> = {
  outline_planning: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.3,
    maxTokens: 4096,
  },
  chapter_drafting: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.8,
    maxTokens: 4096,
  },
  chapter_review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    maxTokens: 2048,
  },
  chapter_repair: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
    maxTokens: 4096,
  },
  summary_generation: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    maxTokens: 1024,
  },
  fact_extraction: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    maxTokens: 2048,
  },
  consistency_check: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    maxTokens: 2048,
  },
  character_dialogue: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    maxTokens: 2048,
  },
  style_analysis: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
    maxTokens: 2048,
  },
  chat: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    maxTokens: 4096,
  },
  default: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    maxTokens: 4096,
  },
};

const VALID_PROVIDERS = new Set<string>(Object.keys(PROVIDERS));

function toLLMProvider(value: string): LLMProvider {
  if (VALID_PROVIDERS.has(value)) {
    return value as LLMProvider;
  }
  return "deepseek";
}

export async function resolveModel(
  taskType: TaskType,
  userOverride?: { provider?: LLMProvider; model?: string; temperature?: number; maxTokens?: number },
): Promise<ResolvedModel> {
  const base = DEFAULT_ROUTES[taskType] ?? DEFAULT_ROUTES.default;

  try {
    const row = await prisma.modelRouteConfig.findUnique({
      where: { taskType },
    });
    if (row) {
      const resolved: ResolvedModel = {
        provider: toLLMProvider(row.provider),
        model: row.model,
        temperature: row.temperature,
        maxTokens: row.maxTokens ?? undefined,
      };
      return {
        ...resolved,
        ...(userOverride?.provider != null && { provider: userOverride.provider }),
        ...(userOverride?.model != null && { model: userOverride.model }),
        ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
        ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
      };
    }
  } catch {
    // table may not exist yet
  }

  return {
    ...base,
    ...(userOverride?.provider != null && { provider: userOverride.provider }),
    ...(userOverride?.model != null && { model: userOverride.model }),
    ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
    ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
  };
}

export async function listModelRouteConfigs(): Promise<Array<{ taskType: string; provider: string; model: string; temperature: number; maxTokens: number | null }>> {
  try {
    const rows = await prisma.modelRouteConfig.findMany({
      orderBy: { taskType: "asc" },
    });
    return rows.map((r) => ({
      taskType: r.taskType,
      provider: r.provider,
      model: r.model,
      temperature: r.temperature,
      maxTokens: r.maxTokens,
    }));
  } catch {
    return [];
  }
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: { provider: string; model: string; temperature?: number; maxTokens?: number | null },
): Promise<void> {
  await prisma.modelRouteConfig.upsert({
    where: { taskType },
    create: {
      taskType,
      provider: data.provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: data.maxTokens ?? null,
    },
    update: {
      provider: data.provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: data.maxTokens ?? null,
    },
  });
}
