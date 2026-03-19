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
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
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
