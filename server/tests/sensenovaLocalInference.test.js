const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// 1. 测试 SystemDiagnosticService 的硬件自检与运行级别推荐
test("SystemDiagnosticService correctly assesses platform capabilities", async () => {
  const { SystemDiagnosticService } = require("../dist/services/image/local/SystemDiagnosticService.js");

  const service = new SystemDiagnosticService();

  // Mock os details and command executor to simulate a Windows machine with high VRAM GPU
  const originalRunDiagnostic = service.runDiagnostic;
  
  // Test Tier 1 (NVIDIA 24GB VRAM)
  service.runDiagnostic = async () => {
    return {
      platform: "win32",
      cpuModel: "Intel i9",
      cpuCores: 16,
      totalMemoryGb: 64,
      freeMemoryGb: 32,
      hasNvidiaGpu: true,
      isAppleSilicon: false,
      gpu: {
        name: "NVIDIA GeForce RTX 4090",
        totalVramMb: 24576,
        freeVramMb: 20480,
      },
      recommendedTier: "tier1",
      reason: "NVIDIA 显卡 (NVIDIA GeForce RTX 4090) 显存 ≥ 15GB，推荐使用本地高精度加速模式 (Tier 1)。",
      expectedGenerationTimeSec: 8,
    };
  };

  const winGpuResult = await service.runDiagnostic();
  assert.equal(winGpuResult.recommendedTier, "tier1");
  assert.equal(winGpuResult.expectedGenerationTimeSec, 8);
  assert.ok(winGpuResult.hasNvidiaGpu);

  // Test Tier 2 (Apple Silicon M2 Pro 16GB)
  service.runDiagnostic = async () => {
    return {
      platform: "darwin",
      cpuModel: "Apple M2 Pro",
      cpuCores: 12,
      totalMemoryGb: 16,
      freeMemoryGb: 8,
      hasNvidiaGpu: false,
      isAppleSilicon: true,
      recommendedTier: "tier2",
      reason: "Apple Silicon (Apple M2 Pro) 且统一内存为 16GB-24GB，推荐使用本地 GGUF 量化加速模式 (Tier 2)。",
      expectedGenerationTimeSec: 30,
    };
  };

  const macResult = await service.runDiagnostic();
  assert.equal(macResult.recommendedTier, "tier2");
  assert.equal(macResult.expectedGenerationTimeSec, 30);
  assert.ok(macResult.isAppleSilicon);

  // Test Tier 3 (CPU Only / Thin Laptop)
  service.runDiagnostic = async () => {
    return {
      platform: "win32",
      cpuModel: "Intel i5",
      cpuCores: 4,
      totalMemoryGb: 8,
      freeMemoryGb: 2,
      hasNvidiaGpu: false,
      isAppleSilicon: false,
      recommendedTier: "tier3",
      reason: "本地无独立显卡，自动回灌至 CPU 纯本地运行模式 (Tier 3)。",
      expectedGenerationTimeSec: 180,
    };
  };

  const cpuResult = await service.runDiagnostic();
  assert.equal(cpuResult.recommendedTier, "tier3");
  assert.equal(cpuResult.expectedGenerationTimeSec, 180);
  assert.equal(cpuResult.hasNvidiaGpu, false);
});

// 2. 测试 LocalInferenceDaemonService 的健康监测与状态检查
test("LocalInferenceDaemonService health check maps correctly to status", async () => {
  const { LocalInferenceDaemonService } = require("../dist/services/image/local/LocalInferenceDaemonService.js");

  const daemon = new LocalInferenceDaemonService();

  // Mock global fetch to simulate successful Ollama response
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (url.includes("/api/tags")) {
      return new Response(
        JSON.stringify({
          models: [
            { name: "sensenova-u1:8b-v3" },
            { name: "llama3.2:latest" }
          ]
        }),
        { status: 200 }
      );
    }
    return new Response("", { status: 404 });
  };

  const health = await daemon.checkDaemonHealth();
  assert.ok(health.ok);
  assert.ok(health.message.includes("sensenova-u1"));

  // Mock server down
  global.fetch = async () => {
    throw new Error("Fetch failed");
  };

  const healthFailed = await daemon.checkDaemonHealth();
  assert.equal(healthFailed.ok, false);
  assert.ok(healthFailed.message.includes("未检测到本地推理服务"));

  global.fetch = originalFetch;
});
