import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import { isBuiltInProvider, PROVIDERS } from "./providers";
import type { StructuredOutputStrategy } from "./structuredOutput";

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
  "light_review",
  "critical_review",
  "repair",
  "replan",
  "state_resolution",
  "summary",
  "fact_extraction",
  "chat",
];

export interface ResolvedModel {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
  routeKey: ModelRouteTaskType | "default";
  routeDegraded: boolean;
}

const STRICT_ROUTE_TASK_TYPES = new Set<ModelRouteTaskType>([
  "critical_review",
  "replan",
  "state_resolution",
]);

const DEFAULT_ROUTES: Record<ModelRouteTaskType | "default", Omit<ResolvedModel, "routeKey" | "routeDegraded">> = {
  planner: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.3,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  writer: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.8,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  light_review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  critical_review: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.1,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  repair: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.4,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  replan: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  state_resolution: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.1,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  summary: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  fact_extraction: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.2,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  chat: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
  default: {
    provider: "deepseek",
    model: PROVIDERS.deepseek.defaultModel,
    temperature: 0.7,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  },
};

function normalizeProviderId(value: string | null | undefined): LLMProvider {
  if (typeof value !== "string") {
    return "deepseek";
  }
  const trimmed = value.trim();
  return trimmed || "deepseek";
}

function normalizeMaxTokens(_provider: LLMProvider, maxTokens?: number): number | undefined {
  if (maxTokens === undefined) return undefined;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error("最大输出必须是正整数。");
  return maxTokens;
}
async function readStoredMaxTokens(provider: LLMProvider, row: {maxTokens: number | null; taskType: string}): Promise<number | undefined> {
  if (row.maxTokens === 4096) {
    try {
      const marker = await prisma.appSetting.findUnique({where:{key:`llm.routeOutputExplicit.${row.taskType}`}});
      if (marker?.value !== "true") return undefined;
    } catch (error) { if((error as {code?:string})?.code === "P2021") return undefined;throw error; }
  }
  return normalizeMaxTokens(provider, row.maxTokens ?? undefined);
}

export function normalizeRequestProtocol(value?: string | null): ModelRouteRequestProtocol {
  if (["openai_compatible", "openai_responses", "deepseek", "anthropic", "gemini", "llama_cpp"].includes(value ?? "")) {
    return value as ModelRouteRequestProtocol;
  }
  return "auto";
}

export function normalizeStructuredResponseFormat(value?: string | null): ModelRouteStructuredResponseFormat {
  if (value === "json_schema" || value === "json_object" || value === "prompt_json") {
    return value;
  }
  return "auto";
}

function normalizeRoutePreferences(input: {
  requestProtocol?: string | null;
  structuredResponseFormat?: string | null;
}): {
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
} {
  const requestProtocol = normalizeRequestProtocol(input.requestProtocol);
  const structuredResponseFormat = requestProtocol === "anthropic"
    ? "prompt_json"
    : normalizeStructuredResponseFormat(input.structuredResponseFormat);
  return {
    requestProtocol,
    structuredResponseFormat,
  };
}

export function toStructuredOutputStrategy(
  value: ModelRouteStructuredResponseFormat,
): StructuredOutputStrategy | null {
  return value === "auto" ? null : value;
}

function applyOverrides(
  base: ResolvedModel,
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): ResolvedModel {
  const merged: ResolvedModel = {
    ...base,
    ...(userOverride?.provider != null && { provider: userOverride.provider }),
    ...(userOverride?.model != null && { model: userOverride.model }),
    ...(userOverride?.temperature != null && { temperature: userOverride.temperature }),
    ...(userOverride?.maxTokens != null && { maxTokens: userOverride.maxTokens }),
    ...(userOverride?.requestProtocol != null && { requestProtocol: userOverride.requestProtocol }),
    ...(userOverride?.structuredResponseFormat != null && {
      structuredResponseFormat: userOverride.structuredResponseFormat,
    }),
  };
  const routePreferences = normalizeRoutePreferences({
    requestProtocol: merged.requestProtocol,
    structuredResponseFormat: merged.structuredResponseFormat,
  });
  return {
    ...merged,
    ...routePreferences,
    maxTokens: normalizeMaxTokens(merged.provider, merged.maxTokens),
    routeKey: merged.routeKey,
    routeDegraded: merged.routeDegraded,
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
  userOverride?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestProtocol?: ModelRouteRequestProtocol;
    structuredResponseFormat?: ModelRouteStructuredResponseFormat;
  },
): Promise<ResolvedModel> {
  const normalizedTaskType = normalizeTaskType(taskType);
  const base = DEFAULT_ROUTES[normalizedTaskType] ?? DEFAULT_ROUTES.default;

  try {
    const row = await prisma.modelRouteConfig.findUnique({
      where: { taskType: normalizedTaskType },
    });
    if (row) {
      const provider = normalizeProviderId(row.provider);
      const routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in row ? row.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in row ? row.structuredResponseFormat : null,
      });
      const resolved: ResolvedModel = {
        provider,
        model: row.model,
        temperature: row.temperature,
        maxTokens: await readStoredMaxTokens(provider, row),
        ...routePreferences,
        routeKey: normalizedTaskType,
        routeDegraded: false,
      };
      return applyOverrides(resolved, userOverride);
    }
  } catch (error) {
    if((error as {code?:string})?.code !== "P2021") throw error;
  }

  return applyOverrides({
    ...base,
    routeKey: normalizedTaskType,
    routeDegraded: normalizedTaskType !== "default"
      && STRICT_ROUTE_TASK_TYPES.has(normalizedTaskType),
  }, userOverride);
}

export async function listModelRouteConfigs(): Promise<Array<{
  taskType: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}>> {
  try {
    const rows = await prisma.modelRouteConfig.findMany({
      orderBy: { taskType: "asc" },
    });
    return Promise.all(rows.map(async (r) => {
      const provider = normalizeProviderId(r.provider);
      const routePreferences = normalizeRoutePreferences({
        requestProtocol: "requestProtocol" in r ? r.requestProtocol : null,
        structuredResponseFormat: "structuredResponseFormat" in r ? r.structuredResponseFormat : null,
      });
      return {
        provider,
        taskType: r.taskType,
        model: r.model,
        temperature: r.temperature,
        maxTokens: await readStoredMaxTokens(provider, r) ?? null,
        ...routePreferences,
      };
    }));
  } catch (error) {
    if((error as {code?:string})?.code === "P2021") return [];
    throw error;
  }
}

export async function upsertModelRouteConfig(
  taskType: string,
  data: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number | null;
    requestProtocol?: string | null;
    structuredResponseFormat?: string | null;
  },
): Promise<void> {
  const normalizedTaskType = normalizeTaskType(taskType as TaskType);
  const provider = normalizeProviderId(data.provider);
  const normalizedMaxTokens = normalizeMaxTokens(provider, data.maxTokens ?? undefined) ?? null;
  const {
    requestProtocol,
    structuredResponseFormat,
  } = normalizeRoutePreferences({
    requestProtocol: data.requestProtocol,
    structuredResponseFormat: data.structuredResponseFormat,
  });
  await prisma.appSetting.upsert({where:{key:`llm.routeOutputExplicit.${normalizedTaskType}`},
    create:{key:`llm.routeOutputExplicit.${normalizedTaskType}`,value:String(data.maxTokens != null)},
    update:{value:String(data.maxTokens != null)}});
  await prisma.modelRouteConfig.upsert({
    where: { taskType: normalizedTaskType },
    create: {
      taskType: normalizedTaskType,
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
    update: {
      provider,
      model: data.model,
      temperature: data.temperature ?? 0.7,
      maxTokens: normalizedMaxTokens,
      requestProtocol,
      structuredResponseFormat,
    },
  });
}
