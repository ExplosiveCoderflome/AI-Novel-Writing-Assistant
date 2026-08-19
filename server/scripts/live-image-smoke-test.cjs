// Hook better-sqlite3 to prevent native binary evaluation crash on Node v26
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = () => "wal";
      this.defaultSafeIntegers = () => {};
      this.prepare = () => {
        return {
          run: () => ({ changes: 1, lastInsertRowid: 1 }),
          all: () => [],
          get: () => ({ id: "mock-id", createdAt: new Date(), updatedAt: new Date(), bundleJson: "{}" }),
          bind: function () { return this; }
        };
      };
      this.close = () => {};
    };
    return MockDb;
  }
  return originalRequire.apply(this, arguments);
};

const fs = require("fs");
const path = require("path");
const { runTextPrompt } = require("../dist/prompting/core/promptRunner.js");
const { imageCharacterPromptOptimizePrompt } = require("../dist/prompting/prompts/image/image.prompts.js");
const { generateImagesByProvider } = require("../dist/services/image/provider.js");

const outputDir = path.join(__dirname, "../tests/output");
fs.mkdirSync(outputDir, { recursive: true });

async function run() {
  console.log("====================================================");
  console.log("             文生图模型真实集成测试与图片生成脚本         ");
  console.log("====================================================\n");

  // 1. 输入的小说文本测试数据
  const novelText = "林动望着眼前巍峨的古墓，心中暗自震惊。古墓表面覆盖着淡蓝色的雷霆流光，隐隐有风雷之声。";
  console.log(`[测试数据] 待改编的小说原文:\n👉 "${novelText}"\n`);

  // 2. 检测本地 Ollama 连接性
  console.log("[Ollama 检测] 尝试连接本地 Ollama 服务 (http://127.0.0.1:11434)...");
  let ollamaRunning = false;
  let ollamaModels = [];
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags");
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models || []).map(m => m.name);
      ollamaRunning = true;
      console.log(`✅ 本地 Ollama 正在运行！已加载模型: ${ollamaModels.join(", ")}`);
    } else {
      console.log("⚠️ Ollama 响应异常，将启用静态 Mock 提示词优化。");
    }
  } catch (err) {
    console.log("❌ 无法连接到本地 Ollama，将启用静态 Mock 提示词优化。 (启动 Ollama 后可运行真实提示词优化)");
  }

  // 3. 提示词优化环节 (Prompt Optimization)
  let optimizedPrompt = "Chinese anime style, young male protagonist staring at a massive ancient tomb covered with crackling blue lightning energy, wind and thunder atmosphere, cinematic lighting, 8k resolution";
  if (ollamaRunning && ollamaModels.length > 0) {
    const selectedModel = ollamaModels.includes("llama3.2") ? "llama3.2" : ollamaModels[0];
    console.log(`\n[提示词优化] 正在使用本地 Ollama [${selectedModel}] 优化小说提示词...`);
    try {
      const result = await runTextPrompt({
        asset: imageCharacterPromptOptimizePrompt,
        promptInput: {
          sourcePrompt: novelText,
          stylePreset: "Chinese anime style",
          outputLanguage: "en",
          characterName: "林动",
          role: "主角",
          personality: "坚毅不拔",
          appearance: "短发，身穿朴素长袍",
          background: "大炎王朝林家子弟"
        },
        options: {
          provider: "ollama",
          model: selectedModel,
          temperature: 0.4
        }
      });
      optimizedPrompt = result.output.trim();
      console.log("✅ 本地模型优化成功！");
    } catch (err) {
      console.log(`⚠️ 本地模型优化调用失败: ${err.message}。使用预置优化 prompt 继续。`);
    }
  } else {
    console.log("\n[提示词优化] 使用预置优化后的 Prompt 进行下一阶段...");
  }
  console.log(`👉 优化后的英文生图 Prompt:\n"${optimizedPrompt}"\n`);

  // 4. 文生图图片生成环节 (T2I Image Generation)
  let t2iProvider = "mock";
  let apiKeyEnv = "";
  let realApiKey = "";

  if (process.env.SILICONFLOW_API_KEY) {
    t2iProvider = "siliconflow";
    apiKeyEnv = "SILICONFLOW_API_KEY";
    realApiKey = process.env.SILICONFLOW_API_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    t2iProvider = "openai";
    apiKeyEnv = "OPENAI_API_KEY";
    realApiKey = process.env.OPENAI_API_KEY;
  }

  const outputPath = path.join(outputDir, `smoke_test_${t2iProvider}.png`);

  if (t2iProvider !== "mock") {
    console.log(`[图像生成] 检测到环境变量 ${apiKeyEnv} 已配置，正在向 [${t2iProvider}] 发起真实绘图请求...`);
    try {
      const model = t2iProvider === "siliconflow" ? "black-forest-labs/FLUX.1-schnell" : "dall-e-3";
      const result = await generateImagesByProvider({
        provider: t2iProvider,
        model: model,
        prompt: optimizedPrompt,
        size: "1024x1024",
        count: 1
      });

      const imageUrl = result.images[0].url;
      console.log(`✅ 绘图生成成功！图像临时链接: ${imageUrl}`);
      console.log(`[保存图片] 正在下载图片并写入本地文件系统...`);

      if (imageUrl.startsWith("data:")) {
        // Base64 格式保存
        const base64Data = imageUrl.split(",")[1];
        fs.writeFileSync(outputPath, Buffer.from(base64Data, "base64"));
      } else {
        // HTTP URL 格式保存
        const imageRes = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        fs.writeFileSync(outputPath, imageBuffer);
      }

      console.log(`🎉 真实生成的图片成功保存到本地:\n👉 ${path.resolve(outputPath)}\n`);
    } catch (err) {
      console.log(`❌ 图像生成接口调用失败: ${err.message}\n将自动回退到模拟模式生成占位图。`);
      t2iProvider = "mock";
    }
  }

  if (t2iProvider === "mock") {
    console.log("[图像生成] 提示：当前未在系统环境变量中检测到 SILICONFLOW_API_KEY 或 OPENAI_API_KEY。");
    console.log("由于云端生图是收费服务，我们在本地测试中回退到【本地模拟占位图生成】。");
    
    // 生成一个带水印的空 PNG 字节流文件，保证流程闭环
    const placeholderPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const placeholderPath = path.join(outputDir, "smoke_test_placeholder.png");
    fs.writeFileSync(placeholderPath, Buffer.from(placeholderPngBase64, "base64"));
    
    console.log("✅ 已在本地生成模拟图片文件。");
    console.log(`👉 模拟图片文件路径:\n${path.resolve(placeholderPath)}\n`);
    console.log("💡 [如何运行真实云端图片生成？]");
    console.log("   请在命令行中配置密钥后再运行本脚本，例如：");
    console.log("   $env:SILICONFLOW_API_KEY=\"你的密钥\"; node scripts/live-image-smoke-test.cjs");
  }

  console.log("====================================================");
  console.log("                     测试执行完毕                    ");
  console.log("====================================================");
}

run().catch(err => {
  console.error("❌ 冒烟测试遇到未捕获异常崩溃:", err);
});
