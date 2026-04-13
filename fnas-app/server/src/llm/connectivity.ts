import { HumanMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";
import { getLLM } from "./factory";
import { MODEL_ROUTE_TASK_TYPES, resolveModel } from "./modelRouter";
import { PROVIDERS } from "./providers";

export interface LLMConnectivityStatus {
  provider: LLMProvider;
  model: string;
  ok: boolean;
  latency: number | null;
  error: string | null;
}

export interface ModelRouteConnectivityStatus extends LLMConnectivityStatus {
  taskType: ModelRouteTaskType;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "连接测试失败。";
}

async function testConnection(input: {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
}): Promise<LLMConnectivityStatus> {
  const model = input.model?.trim() || PROVIDERS[input.provider].defaultModel;
  try {
    const llm = await getLLM(input.provider, {
      apiKey: input.apiKey,
      model,
      temperature: 0,
      maxTokens: 16,
    });
    const start = Date.now();
    await llm.invoke([new HumanMessage("请只回复“ok”。")]);
    return {
      provider: input.provider,
      model,
      ok: true,
      latency: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      provider: input.provider,
      model,
      ok: false,
      latency: null,
      error: toErrorMessage(error),
    };
  }
}

async function testModelRoutes(taskTypes: readonly ModelRouteTaskType[] = MODEL_ROUTE_TASK_TYPES): Promise<{
  testedAt: string;
  statuses: ModelRouteConnectivityStatus[];
}> {
  const resolvedRoutes = await Promise.all(taskTypes.map(async (taskType) => ({
    taskType,
    ...(await resolveModel(taskType)),
  })));

  const dedupedChecks = new Map<string, Promise<LLMConnectivityStatus>>();
  for (const route of resolvedRoutes) {
    const key = `${route.provider}::${route.model}`;
    if (!dedupedChecks.has(key)) {
      dedupedChecks.set(key, testConnection({
        provider: route.provider,
        model: route.model,
      }));
    }
  }

  const statuses = await Promise.all(resolvedRoutes.map(async (route) => {
    const key = `${route.provider}::${route.model}`;
    const result = await dedupedChecks.get(key)!;
    return {
      taskType: route.taskType,
      provider: route.provider,
      model: route.model,
      ok: result.ok,
      latency: result.latency,
      error: result.error,
    };
  }));

  return {
    testedAt: new Date().toISOString(),
    statuses,
  };
}

export const llmConnectivityService = {
  testConnection,
  testModelRoutes,
};
