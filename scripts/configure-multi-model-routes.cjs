const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");

process.chdir(SERVER_DIR);
const { prisma } = require(path.join(SERVER_DIR, "dist", "db", "prisma.js"));

const RECOMMENDED_ROUTES = [
  { taskType: "writer", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.75 },
  { taskType: "planner", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.4 },
  { taskType: "replan", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.3 },
  { taskType: "chat", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.7 },
  { taskType: "critical_review", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.2 },
  { taskType: "state_resolution", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.3 },
  { taskType: "repair", provider: "ollama", model: "muse-glimmer-30b", temperature: 0.4 },
  { taskType: "review", provider: "ollama", model: "qwen2.5:7b", temperature: 0.2 },
  { taskType: "light_review", provider: "ollama", model: "qwen2.5:7b", temperature: 0.2 },
  { taskType: "fact_extraction", provider: "ollama", model: "qwen2.5:7b", temperature: 0.1 },
  { taskType: "summary", provider: "ollama", model: "qwen2.5:7b", temperature: 0.3 },
];

async function main() {
  console.log("=================================================================");
  console.log("  配置 Ollama Muse-Glimmer-30B 多模型混合路由 (Multi-Model Routes)");
  console.log("=================================================================\n");

  for (const route of RECOMMENDED_ROUTES) {
    await prisma.modelRouteConfig.upsert({
      where: { taskType: route.taskType },
      create: {
        taskType: route.taskType,
        provider: route.provider,
        model: route.model,
        temperature: route.temperature,
        requestProtocol: "auto",
        structuredResponseFormat: "auto",
      },
      update: {
        provider: route.provider,
        model: route.model,
        temperature: route.temperature,
        requestProtocol: "auto",
        structuredResponseFormat: "auto",
      },
    });
    console.log(`[✓ 路由更新] ${route.taskType.padEnd(18)} -> Provider: ${route.provider.padEnd(10)} | Model: ${route.model}`);
  }

  console.log("\n[✓ 成功] 已将推荐的 Ollama Muse-Glimmer-30B 路由写入系统数据库！\n");
}

main().catch(err => {
  console.error("配置模型路由失败:", err);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
