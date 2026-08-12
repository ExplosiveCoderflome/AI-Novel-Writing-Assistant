import os from "os";
import { spawnSync } from "child_process";
import { PROVIDERS, SUPPORTED_PROVIDERS } from "../../llm/providers";
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

    const baseURL = custom?.baseURL || pConfig.baseURL;
    const modelList = custom?.model ? [custom.model, ...pConfig.models] : pConfig.models;
    const uniqueModels = Array.from(new Set(modelList));

    for (const modelName of uniqueModels) {
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
