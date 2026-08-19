import { prisma } from "../../db/prisma";
import { MODEL_ROUTE_TASK_TYPES, upsertModelRouteConfig } from "../../llm/modelRouter";
import { discoverAllModels, detectSystemHardwareSpec } from "./modelDiscoveryService";

export interface ApplyAutoRoutesInput {
  targetProvider?: string;
  targetModel?: string;
}

export async function applySmartModelRouting(input?: ApplyAutoRoutesInput): Promise<{
  updatedCount: number;
  routes: Record<string, { provider: string; model: string }>;
}> {
  const hardware = await detectSystemHardwareSpec();
  const discovery = await discoverAllModels();

  const availableModels = discovery.models;

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
    let assignedProvider = provider;
    let assignedModel = model;
    let temperature = 0.7;

    if (taskType === "image_gen") {
      const comfy = availableModels.find((m) => m.provider === "comfyui");
      const sense = availableModels.find((m) => m.provider === "sensenova");
      if (comfy) {
        assignedProvider = comfy.provider;
        assignedModel = comfy.model;
      } else if (sense) {
        assignedProvider = sense.provider;
        assignedModel = sense.model;
      } else {
        assignedProvider = "siliconflow";
        assignedModel = "black-forest-labs/FLUX.1-schnell";
      }
    } else if (taskType === "video_gen") {
      const comfy = availableModels.find((m) => m.provider === "comfyui");
      if (comfy) {
        assignedProvider = comfy.provider;
        assignedModel = comfy.model;
      } else {
        assignedProvider = "siliconflow";
        assignedModel = "hunyuan-video";
      }
    } else if (taskType === "embedding") {
      const embedLocal = availableModels.find((m) => m.capabilities.includes("embedding"));
      if (embedLocal) {
        assignedProvider = embedLocal.provider;
        assignedModel = embedLocal.model;
      } else {
        assignedProvider = "ollama";
        assignedModel = "embeddinggemma";
      }
      temperature = 0.0;
    } else if (taskType === "asr") {
      assignedProvider = "siliconflow";
      assignedModel = "FunAudioLLM/SenseVoiceSmall";
      temperature = 0.0;
    } else if (taskType === "tts") {
      assignedProvider = "siliconflow";
      assignedModel = "cosyvoice-300m";
    } else if (taskType === "ocr") {
      assignedProvider = "siliconflow";
      assignedModel = "stepfun-ai/step-1o-vision-32k";
      temperature = 0.0;
    } else {
      const isLightTask = taskType === "review" || taskType === "light_review" || taskType === "fact_extraction" || taskType === "summary";
      const lightModelCandidate = availableModels.find(
        (m) => m.provider === provider && (m.model.includes("7b") || m.model.includes("8b") || m.model.includes("12b"))
      )?.model;
      assignedModel = isLightTask ? (lightModelCandidate ?? model) : model;
      temperature = isLightTask ? 0.2 : 0.7;
    }

    await upsertModelRouteConfig(taskType, {
      provider: assignedProvider as any,
      model: assignedModel,
      temperature,
      requestProtocol: "auto",
      structuredResponseFormat: "auto",
    });

    updatedRoutes[taskType] = { provider: assignedProvider, model: assignedModel };
  }

  return {
    updatedCount: MODEL_ROUTE_TASK_TYPES.length,
    routes: updatedRoutes,
  };
}
