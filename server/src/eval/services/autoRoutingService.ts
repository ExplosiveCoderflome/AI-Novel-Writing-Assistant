import { prisma } from "../../db/prisma";
import { MODEL_ROUTE_TASK_TYPES, upsertModelRouteConfig } from "../../llm/modelRouter";
import { detectSystemHardwareSpec } from "./modelDiscoveryService";

export interface ApplyAutoRoutesInput {
  targetProvider?: string;
  targetModel?: string;
}

export async function applySmartModelRouting(input?: ApplyAutoRoutesInput): Promise<{
  updatedCount: number;
  routes: Record<string, { provider: string; model: string }>;
}> {
  const hardware = await detectSystemHardwareSpec();

  let provider = input?.targetProvider || "ollama";
  let model = input?.targetModel || "muse-glimmer-30b";

  if (!input?.targetModel) {
    if (hardware.vramGb >= 20 || hardware.totalRamGb >= 64) {
      provider = "ollama";
      model = "qwen2.5:72b";
    } else if (hardware.vramGb >= 12 || hardware.totalRamGb >= 32) {
      provider = "ollama";
      model = "muse-glimmer-30b";
    } else {
      provider = "ollama";
      model = "qwen2.5:7b";
    }
  }

  const updatedRoutes: Record<string, { provider: string; model: string }> = {};

  for (const taskType of MODEL_ROUTE_TASK_TYPES) {
    const isLightTask = taskType === "review" || taskType === "light_review" || taskType === "fact_extraction" || taskType === "summary";
    const assignedModel = isLightTask && (hardware.vramGb >= 12 || hardware.totalRamGb >= 32) ? "qwen2.5:7b" : model;

    await upsertModelRouteConfig(taskType, {
      provider: provider as any,
      model: assignedModel,
      temperature: isLightTask ? 0.2 : 0.7,
      requestProtocol: "auto",
      structuredResponseFormat: "auto",
    });

    updatedRoutes[taskType] = { provider, model: assignedModel };
  }

  return {
    updatedCount: MODEL_ROUTE_TASK_TYPES.length,
    routes: updatedRoutes,
  };
}
