import os from "os";
import { spawnSync } from "child_process";
import {
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  providerRequiresApiKey,
} from "../../llm/providers";
import { secretStore } from "../../services/settings/secretStore";

export interface DiscoveredModelItem {
  provider: string;
  model: string;
  displayName: string;
  baseURL: string;
  isOnline: boolean;
  capabilities: string[];
}

export interface SystemHardwareSpec {
  gpuName: string | null;
  vramGb: number;
  totalRamGb: number;
  cpuCores: number;
  recommendedTier: "ENTRY" | "MAIN_STREAM" | "ENTHUSIAST" | "FLAGSHIP";
  recommendedQuantization: string;
}

export async function detectSystemHardwareSpec(): Promise<SystemHardwareSpec> {
  const totalRamGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const cpuCores = os.cpus().length;
  let gpuName: string | null = null;
  let vramGb = 0;

  try {
    const smi = spawnSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], {
      encoding: "utf8",
    });
    if (smi.status === 0 && smi.stdout.trim()) {
      const parts = smi.stdout.trim().split("\n")[0].split(",");
      gpuName = parts[0]?.trim() || null;
      const mb = parseFloat(parts[1]);
      if (!isNaN(mb)) vramGb = Math.round((mb / 1024) * 10) / 10;
    }
  } catch (e) {}

  let recommendedTier: SystemHardwareSpec["recommendedTier"] = "ENTRY";
  let recommendedQuantization = "Q4_K_M (7B / SD1.5)";

  if (vramGb >= 20 || (vramGb === 0 && totalRamGb >= 64)) {
    recommendedTier = "FLAGSHIP";
    recommendedQuantization = "FP16 / Full (70B / FLUX.1-Pro)";
  } else if (vramGb >= 12 || (vramGb === 0 && totalRamGb >= 32)) {
    recommendedTier = "ENTHUSIAST";
    recommendedQuantization = "Q4_K_M (30B/32B / FLUX.1-dev)";
  } else if (vramGb >= 6 || (vramGb === 0 && totalRamGb >= 16)) {
    recommendedTier = "MAIN_STREAM";
    recommendedQuantization = "Q4_K_M / INT8 (14B / SDXL)";
  }

  return {
    gpuName,
    vramGb,
    totalRamGb,
    cpuCores,
    recommendedTier,
    recommendedQuantization,
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number = 2000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function discoverAllModels(): Promise<{
  hardware: SystemHardwareSpec;
  models: DiscoveredModelItem[];
}> {
  const hardware = await detectSystemHardwareSpec();
  const discovered: DiscoveredModelItem[] = [];

  for (const providerKey of SUPPORTED_PROVIDERS) {
    const pConfig = PROVIDERS[providerKey];
    if (!pConfig) continue;

    const custom = await secretStore.getProvider(providerKey);

    const savedKey = custom?.key?.trim() ? custom.key.trim() : undefined;
    const envKey = getProviderEnvApiKey(providerKey);
    const effectiveKey = savedKey ?? envKey;

    const requiresApiKey = providerRequiresApiKey(providerKey);
    const configuredModel = custom?.model?.trim() || getProviderEnvModel(providerKey) || pConfig.defaultModel;
    const baseURL = custom?.baseURL?.trim() || getProviderEnvBaseUrl(providerKey) || pConfig.baseURL;

    // 1. 严格检查：如果厂商要求 API Key，且未在 SecretStore 或 .env 中配置，则直接跳过！
    const isConfigured = requiresApiKey ? Boolean(effectiveKey && configuredModel) : Boolean(baseURL);

    // 2. 严格检查：如果在系统设置中该厂商被停用 (isActive === false)，直接跳过！
    const isActive = custom?.isActive ?? isConfigured;

    if (!isConfigured || !isActive) {
      continue;
    }

    // 3. 本地与云端服务连通性实测测试
    let realModels: string[] = [];
    let isOnline = false;

    if (providerKey === "ollama") {
      // 实测 Ollama 连通性并获取已下载的动态模型列表
      try {
        const cleanBaseUrl = baseURL.replace(/\/v1\/?$/, "");
        const resp = await fetchWithTimeout(`${cleanBaseUrl}/api/tags`, 2000);
        if (resp.ok) {
          const data = (await resp.json()) as { models?: Array<{ name: string }> };
          if (Array.isArray(data.models) && data.models.length > 0) {
            realModels = data.models.map((m) => m.name.replace(":latest", ""));
            isOnline = true;
          }
        }
      } catch (e) {
        isOnline = false;
      }
    } else if (providerKey === "comfyui") {
      // 实测 ComfyUI 本地生图守护服务
      try {
        const resp = await fetchWithTimeout(`${baseURL}/system_stats`, 2000);
        if (resp.ok) {
          isOnline = true;
          realModels = pConfig.models;
        }
      } catch (e) {
        isOnline = false;
      }
    } else {
      // 云端 AI 厂商 (如 DeepSeek, OpenAI, Qwen 等)：测试 API Key 连通性
      isOnline = Boolean(effectiveKey);
      if (isOnline) {
        realModels = custom?.model ? Array.from(new Set([custom.model, ...pConfig.models])) : pConfig.models;
      }
    }

    if (!isOnline || realModels.length === 0) {
      continue;
    }

    for (const modelName of realModels) {
      const caps: string[] = ["text-gen", "structured-json"];
      const lower = modelName.toLowerCase();

      if (lower.includes("embed") || lower.includes("bge") || lower.includes("minilm")) {
        caps.push("embedding");
      }
      if (lower.includes("flux") || lower.includes("sd") || lower.includes("minimax-h3")) {
        caps.push("image-gen");
      }
      if (lower.includes("hunyuan") || lower.includes("cogvideo") || lower.includes("runway")) {
        caps.push("video-gen");
      }

      discovered.push({
        provider: providerKey,
        model: modelName,
        displayName: `${pConfig.name} - ${modelName}`,
        baseURL,
        isOnline: true,
        capabilities: caps,
      });
    }
  }

  return {
    hardware,
    models: discovered,
  };
}
