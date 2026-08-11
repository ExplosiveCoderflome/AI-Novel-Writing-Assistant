import { execSync, spawnSync } from "child_process";
import os from "os";

export interface MeasuredHardwareSpec {
  totalRamGb: number;
  freeRamGb: number;
  cpuCores: number;
  cpuModel: string;
  gpuName: string | null;
  totalVramGb: number;
  freeVramGb: number;
  hasCudaGpu: boolean;
  recommendedParamLimitB: number;
}

export interface OllamaModelBenchmarkDetail {
  modelName: string;
  family: string;
  parameterSizeB: number;
  quantization: string;
  estimatedMemoryRequirementGb: number;
  hardwareFitScore: number; // 0 - 100
  writingCapabilityScore: number; // 0 - 100
  agentStructuredScore: number; // 0 - 100
  totalBenchmarkScore: number; // 0 - 100
  benchmarkRationale: string;
}

export interface OllamaBenchmarkEvaluationResult {
  measuredHardware: MeasuredHardwareSpec;
  installedModelsCount: number;
  benchmarkDetails: OllamaModelBenchmarkDetail[];
  selectedModel: string | null;
  statusSummary: string;
}

/**
 * 实时精准测量本机的物理硬件 spec (CPU/内存/GPU 显存/CUDA)
 */
export function measureHardwareSpec(): MeasuredHardwareSpec {
  const totalRamGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const freeRamGb = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;
  const cpuCores = os.cpus().length || 1;
  const cpuModel = os.cpus()[0]?.model?.trim() || "Unknown CPU";

  let gpuName: string | null = null;
  let totalVramGb = 0;
  let freeVramGb = 0;
  let hasCudaGpu = false;

  // 通过 nvidia-smi 测量 NVIDIA 显卡物理 Spec
  try {
    const smiOut = spawnSync(
      "nvidia-smi",
      ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
      { encoding: "utf8" },
    );
    if (smiOut.status === 0 && smiOut.stdout.trim()) {
      const firstLine = smiOut.stdout.trim().split("\n")[0];
      const parts = firstLine.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        gpuName = parts[0];
        const totalMb = parseFloat(parts[1]);
        const freeMb = parseFloat(parts[2]);
        if (!isNaN(totalMb)) totalVramGb = Math.round((totalMb / 1024) * 10) / 10;
        if (!isNaN(freeMb)) freeVramGb = Math.round((freeMb / 1024) * 10) / 10;
        hasCudaGpu = true;
      }
    }
  } catch {
    // 忽略未安装 nvidia-smi 的环境
  }

  // 计算推荐的大模型参数量上限（以 4-bit / 5-bit 量化所需显存与 KV 缓存估算）
  const effectiveMemoryGb = hasCudaGpu && totalVramGb > 0 ? totalVramGb : totalRamGb * 0.6;
  let recommendedParamLimitB = 7;
  if (effectiveMemoryGb >= 28) {
    recommendedParamLimitB = 32;
  } else if (effectiveMemoryGb >= 12) {
    recommendedParamLimitB = 14;
  } else if (effectiveMemoryGb >= 6) {
    recommendedParamLimitB = 8;
  } else {
    recommendedParamLimitB = 3;
  }

  return {
    totalRamGb,
    freeRamGb,
    cpuCores,
    cpuModel,
    gpuName,
    totalVramGb,
    freeVramGb,
    hasCudaGpu,
    recommendedParamLimitB,
  };
}

/**
 * 解析模型 Tag 中的参数量 (如 qwen2.5:14b -> 14, deepseek-r1:8b -> 8)
 */
function parseParameterSizeB(modelName: string): number {
  const match = modelName.match(/(\d+(?:\.\d+)?)[bB]/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 7; // 默认按 7B 估算
}

/**
 * 解析模型 Tag 中的架构系列
 */
function parseModelFamily(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes("qwen2.5") || lower.includes("qwen-2.5")) return "qwen2.5";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("deepseek-r1") || lower.includes("deepseek_r1")) return "deepseek-r1";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("llama3.1") || lower.includes("llama-3.1")) return "llama3.1";
  if (lower.includes("llama3") || lower.includes("llama-3")) return "llama3";
  if (lower.includes("gemma2") || lower.includes("gemma-2")) return "gemma2";
  if (lower.includes("mistral")) return "mistral";
  return "other";
}

/**
 * 依据实测硬件 Spec 与测评标准 (Benchmark Standard)，对 Ollama 真实返回的模型列表逐一打分评估
 */
export function benchmarkOllamaModels(
  installedModels: string[],
  hardwareSpec: MeasuredHardwareSpec = measureHardwareSpec(),
): OllamaBenchmarkEvaluationResult {
  if (!installedModels || installedModels.length === 0) {
    const recModel = hardwareSpec.recommendedParamLimitB >= 14 ? "qwen2.5:14b" : "qwen2.5:7b";
    return {
      measuredHardware: hardwareSpec,
      installedModelsCount: 0,
      benchmarkDetails: [],
      selectedModel: null,
      statusSummary: `实测硬件（${hardwareSpec.gpuName ? `GPU: ${hardwareSpec.gpuName}, 显存: ${hardwareSpec.totalVramGb}GB` : `CPU模式, 内存: ${hardwareSpec.totalRamGb}GB`}），但 Ollama 探针显示当前未安装任何模型。建议通过命令拉取模型: ollama pull ${recModel}`,
    };
  }

  const details: OllamaModelBenchmarkDetail[] = installedModels.map((modelName) => {
    const paramSizeB = parseParameterSizeB(modelName);
    const family = parseModelFamily(modelName);
    const quantization = modelName.includes("q4")
      ? "Q4"
      : modelName.includes("q8")
      ? "Q8"
      : modelName.includes("fp16")
      ? "FP16"
      : "Standard Quant";

    // 1. 硬件兼容度评估 (Hardware Fit Score: 0 - 100)
    // 粗略按 Q4 模式：每 1B 参数约占 0.65GB 显存/内存 + 1.5GB 缓存
    const estMemoryGb = Math.round((paramSizeB * 0.65 + 1.5) * 10) / 10;
    let hardwareFitScore = 100;
    const availableMem = hardwareSpec.hasCudaGpu && hardwareSpec.totalVramGb > 0
      ? hardwareSpec.totalVramGb
      : hardwareSpec.totalRamGb * 0.7;

    if (estMemoryGb <= availableMem) {
      hardwareFitScore = 100;
    } else if (estMemoryGb <= availableMem * 1.3) {
      hardwareFitScore = 60; // 较轻微超量，可能会发生 SWAP
    } else {
      hardwareFitScore = 15; // 严重超出显存，性能很差或无法加载
    }

    // 2. 小说创作与文学表达能力评估 (Writing Capability Score: 0 - 100)
    let writingCapabilityScore = 60;
    switch (family) {
      case "qwen2.5":
        writingCapabilityScore = 100;
        break;
      case "qwen":
        writingCapabilityScore = 90;
        break;
      case "deepseek-r1":
        writingCapabilityScore = 95;
        break;
      case "deepseek":
        writingCapabilityScore = 88;
        break;
      case "llama3.1":
        writingCapabilityScore = 82;
        break;
      case "llama3":
        writingCapabilityScore = 78;
        break;
      case "gemma2":
        writingCapabilityScore = 75;
        break;
      default:
        writingCapabilityScore = 65;
    }

    // 3. Agent 规划与 JSON 结构化遵循度评估 (Agent Structured Score: 0 - 100)
    let agentStructuredScore = 70;
    if (paramSizeB >= 14) agentStructuredScore = 98;
    else if (paramSizeB >= 7) agentStructuredScore = 90;
    else if (paramSizeB >= 3) agentStructuredScore = 75;
    else agentStructuredScore = 55;

    // 计算 Benchmark 加权总得分 (Hardware 40% + Writing 35% + Agent 25%)
    const totalBenchmarkScore = Math.round(
      hardwareFitScore * 0.4 + writingCapabilityScore * 0.35 + agentStructuredScore * 0.25,
    );

    const rationale = `[Benchmark 打分: ${totalBenchmarkScore}] 显存预算: ${estMemoryGb}GB/${availableMem.toFixed(1)}GB (兼容分:${hardwareFitScore}) | 创作表达:${writingCapabilityScore} | 结构化指令:${agentStructuredScore}`;

    return {
      modelName,
      family,
      parameterSizeB: paramSizeB,
      quantization,
      estimatedMemoryRequirementGb: estMemoryGb,
      hardwareFitScore,
      writingCapabilityScore,
      agentStructuredScore,
      totalBenchmarkScore,
      benchmarkRationale: rationale,
    };
  });

  // 按 Benchmark 加权总分从高到低排序，选出最优模型
  details.sort((a, b) => b.totalBenchmarkScore - a.totalBenchmarkScore);
  const winner = details[0];

  const summary = `从本地 ${installedModels.length} 个 Ollama 模型中完成 Benchmark 评估，最高分模型: [${winner.modelName}] (得分: ${winner.totalBenchmarkScore})`;

  return {
    measuredHardware: hardwareSpec,
    installedModelsCount: installedModels.length,
    benchmarkDetails: details,
    selectedModel: winner.modelName,
    statusSummary: summary,
  };
}
