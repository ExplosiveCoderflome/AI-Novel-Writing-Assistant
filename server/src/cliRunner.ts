#!/usr/bin/env node
import { cliAutomationService } from "./platform/cli/CLIAutomationService";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Daydream Engine CLI Automation Tool

Usage:
  pnpm --filter server run:cli <command> [options]

Commands:
  audit-health    跑全站或指定小说的健康度审计
  export-assets   无头导出指定小说的资产 JSON 快照
  rebuild-rag     无头重建向量与故事卡片索引
  batch-generate  无头批量章节生成

Options:
  --novelId=<id>       指定目标小说 ID
  --chapterRange=<rng> 指定章节范围 (例如 "1-5")
  --dryRun             演示运行，不写入数据库
  --verbose            打出详细日志
  --json               输出 JSON 格式结果

Examples:
  pnpm --filter server run:cli audit-health --novelId=xyz
  pnpm --filter server run:cli export-assets --novelId=xyz --json
    `);
    process.exit(0);
  }

  const { command, options } = cliAutomationService.parseArgv(args);
  const isJsonOutput = args.includes("--json");

  const result = await cliAutomationService.executeCommand(command, options);

  if (isJsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("==========================================");
    console.log(`[CLI RESULT] Command: ${result.command} | Success: ${result.success}`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log("Metrics:", result.metrics);
    if (result.error) {
      console.error("Error:", result.error);
    }
    console.log("==========================================");
  }

  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[CLI FATAL ERROR]:", err);
    process.exit(1);
  });
}
