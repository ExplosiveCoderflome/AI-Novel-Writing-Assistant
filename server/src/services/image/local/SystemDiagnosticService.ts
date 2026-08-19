import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type SystemTier = "tier1" | "tier2" | "tier3";

export interface GpuInfo {
  name: string;
  totalVramMb: number;
  freeVramMb: number;
}

export interface DiagnosticResult {
  platform: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  hasNvidiaGpu: boolean;
  isAppleSilicon: boolean;
  gpu?: GpuInfo;
  recommendedTier: SystemTier;
  reason: string;
  expectedGenerationTimeSec: number;
}

export class SystemDiagnosticService {
  /**
   * 执行硬件自检并评估本地模型运行级别
   */
  async runDiagnostic(): Promise<DiagnosticResult> {
    const platform = os.platform(); // win32, darwin, linux
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : "Unknown CPU";
    const cpuCores = cpus.length;
    const totalMemoryGb = parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2));
    const freeMemoryGb = parseFloat((os.freemem() / (1024 * 1024 * 1024)).toFixed(2));

    let hasNvidiaGpu = false;
    let isAppleSilicon = false;
    let gpu: GpuInfo | undefined;

    // 1. macOS (Apple Silicon 统一内存检测)
    if (platform === "darwin") {
      try {
        const { stdout } = await execAsync("sysctl -n hw.optional.arm64");
        if (stdout.trim() === "1") {
          isAppleSilicon = true;
        }
      } catch {
        // 忽略非 ARM 架构报错
      }
    }

    // 2. Windows / Linux (NVIDIA CUDA 显卡检测)
    if (platform === "win32" || platform === "linux") {
      try {
        const { stdout } = await execAsync(
          "nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits"
        );
        const parts = stdout.trim().split("\n")[0]?.split(",");
        if (parts && parts.length >= 3) {
          hasNvidiaGpu = true;
          gpu = {
            name: parts[0].trim(),
            totalVramMb: parseInt(parts[1].trim(), 10),
            freeVramMb: parseInt(parts[2].trim(), 10),
          };
        }
      } catch {
        // nvidia-smi 执行失败，说明无显卡或未安装 CUDA 驱动
      }
    }

    // 3. 计算推荐级别 (Tier) 与预期耗时
    let recommendedTier: SystemTier = "tier3";
    let reason = "本地无独立显卡，自动回灌至 CPU 纯本地运行模式 (Tier 3)。";
    let expectedGenerationTimeSec = 120; // 默认 CPU 耗时估算

    if (platform === "darwin" && isAppleSilicon) {
      if (totalMemoryGb >= 32) {
        recommendedTier = "tier1";
        reason = `检测到 Apple Silicon (${cpuModel}) 且统一内存 ≥ 32GB (${totalMemoryGb}GB)，推荐使用本地高精度加速模式 (Tier 1)。`;
        expectedGenerationTimeSec = 10;
      } else if (totalMemoryGb >= 16) {
        recommendedTier = "tier2";
        reason = `检测到 Apple Silicon (${cpuModel}) 且统一内存为 16GB-24GB (${totalMemoryGb}GB)，推荐使用本地 GGUF 量化加速模式 (Tier 2)。`;
        expectedGenerationTimeSec = 30;
      } else {
        recommendedTier = "tier3";
        reason = `检测到 Apple Silicon (${cpuModel}) 但统一内存较小 (< 16GB)，为防止爆显存，推荐使用 CPU 限制运行模式 (Tier 3)。`;
        expectedGenerationTimeSec = 90;
      }
    } else if (hasNvidiaGpu && gpu) {
      if (gpu.totalVramMb >= 15000) {
        recommendedTier = "tier1";
        reason = `检测到 NVIDIA 显卡 (${gpu.name}) 显存 ≥ 15GB (${(gpu.totalVramMb / 1024).toFixed(1)}GB)，推荐使用本地高精度加速模式 (Tier 1)。`;
        expectedGenerationTimeSec = 8;
      } else if (gpu.totalVramMb >= 6000) {
        recommendedTier = "tier2";
        reason = `检测到 NVIDIA 显卡 (${gpu.name}) 显存为 6GB-14GB (${(gpu.totalVramMb / 1024).toFixed(1)}GB)，推荐使用本地 GGUF 量化加速模式 (Tier 2)。`;
        expectedGenerationTimeSec = 25;
      } else {
        recommendedTier = "tier3";
        reason = `检测到 NVIDIA 显卡 (${gpu.name}) 但显存不足 6GB，自动回灌至 CPU 运行模式 (Tier 3)。`;
        expectedGenerationTimeSec = 120;
      }
    } else {
      if (totalMemoryGb < 16) {
        reason += ` 警告：当前物理内存为 ${totalMemoryGb}GB，不足 16GB，运行可能极其缓慢。`;
        expectedGenerationTimeSec = 180;
      }
    }

    return {
      platform,
      cpuModel,
      cpuCores,
      totalMemoryGb,
      freeMemoryGb,
      hasNvidiaGpu,
      isAppleSilicon,
      gpu,
      recommendedTier,
      reason,
      expectedGenerationTimeSec,
    };
  }
}

export const systemDiagnosticService = new SystemDiagnosticService();
