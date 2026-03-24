import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import { PROVIDERS } from "./providers";

export type TaskType =
  | ModelRouteTaskType
  | "outline_planning"
  | "chapter_drafting"
  | "chapter_review"
  | "chapter_repair"
  | "summary_generation"
  | "chat"
  | "default";

const TASK_TYPE_ALIASES: Partial<Record<TaskType, ModelRouteTaskType>> = {
  outline_planning: "planner",
  chapter_drafting: "writer",
  chapter_review: "review",
  chapter_repair: "repair",
  summary_generation: "summary",
  fact_extraction: "fact_extraction",
};

export const MODEL_ROUTE_TASK_TYPES: ModelRouteTaskType[] = [
  "planner",
  "writer",
  "review",
  "repair",
  "summary",
  "fact_extraction",
  "chat",
];

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
}

const DEFAULT_ROUTES: Record<ModelRouteTaskType | "default", ResolvedModel> = {
  planner: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.3,
  },
  writer: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.8,
  },
  review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
  },
  repair: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
  },
  summary: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
  },
  fact_extraction: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
  },
  chat: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
  },
  default: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
  },
};

const VALID_PROVIDERS = new Set<string>(Object.keys(PROVIDERS));

function toLLMProvider(value: string): LLMProvider {
  if (VALID_PROVIDERS.has(value)) {
    return value as LLMProvider;
  }
  return "deepseek";
}

function normalizeMaxTokens(provider: LLMProvider, maxTokens?: number): number | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return undefined;
  }
  const normalized = Math.floor(maxTokens);
  if (normalized < 1) {
    return undefined;
  }
  // Historical UI defaults persisted 4096 as a placeholder for "use provider defaults".
  if (normalized === 4096) {
    return undefined;
  }
  const providerLimit = PROVIDERS[provider].maxTokens;
  if (typeof providerLimit === "number") {
    return Math.min(normalized, providerLimit);
  }
  return normalized;
}

function applyOverrides(
  base: ResolvedModel,
  userOverride?: { provider?: LLMProvider; model?: string; temperature?: number; maxTokens?: number },
): ResolvedModel {
  const merged: ResolvedModel = {
    ...base,
    ...(userOverride?.provider != null && { provider: userOverride.provider }),
    ...(userOverride?.model != null && { model: userOverride.model }),
    ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
    ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
  };
  return {
    ...merged,
    maxTokens: normalizeMaxTokens(merged.provider, merged.maxTokens),
  };
}

function normalizeTaskType(taskType: TaskType): ModelRouteTaskType | "default" {
  const aliased = TASK_TYPE_ALIASES[taskType];
  if (aliased) {
    return aliased;
  }
  if (taskType === "default") {
    return "default";
  }
  if (MODEL_ROUTE_TASK_TYPES.includes(taskType as ModelRouteTaskType)) {
    return taskType as ModelRouteTaskType;
  }
  return "default";
}

export async function resolveModel(
  taskType: TaskType,
  userOverride?: { provider?: LLMProvider; model?: string; temperature?: number; maxTokens?: number },
): Promise<ResolvedModel> {
  const normalizedTaskType = normalizeTaskType(taskType);
  const base = DEFAULT_ROUTES[normalizedTaskType] ?? DEFAULT_ROUTES.default;

  try {
    const row = await prisma.modelRouteConfig.findUnique({
      where: { taskType: normalizedTaskType },
    });
    if (row) {
      const provider = toLLMProvider(row.provider);
      const resolved: ResolvedModel = {
        provider,
        model: row.model,
        temperature: row.temperature,
        maxTokens: normalizeMaxTokens(provider, row.maxTokens ?? undefined),
      };
      return applyOverrides(resolved, userOverride);
    }
  } catch {
    // table may not exist yet
  }

  return applyOverrides(base, userOverride);
}

export async function listModelRouteConfigs(): Promise<Array<{ taskType: string; provider: string; model: string; temperature: number; maxTokens: number | null }>> {
  try {
    const rows = await prisma.modelRouteConfig.findMany({
      orderBy: { taskType: "asc" },
    });
    return rows.map((r) => ({
      provider: toLLMProvider(r.provider),
      taskType: r.taskType,
      model: r.model,
      temperature: r.temperature,
      maxTokens: normalizeMaxTokens(toLLMProvider(r.provider), r.maxTokens ?? undefined) ?? null,
    }));
  } catch {
    return [];
  }
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: { provider: string; model: string; temperature?: number; maxTokens?: number | null },
): Promise<void> {
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  const provider = toLLMProvider(data.provider);
  const normalizedMaxTokens = normalizeMaxTokens(provider, data.maxTokens ?? undefined) ?? null;
  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
    },
    update: {
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
    },
  });
}
