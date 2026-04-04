import "dotenv/config";
import { prisma } from "./prisma";
import {
  ensureSystemResourceStarterData,
  hasSystemResourceBootstrapChanges,
} from "../services/bootstrap/SystemResourceBootstrapService";

async function main(): Promise<void> {
  const report = await ensureSystemResourceStarterData({ mode: "sync_existing" });

  if (hasSystemResourceBootstrapChanges(report)) {
    console.log("系统内置创作资源同步完成。", report);
    return;
  }

  console.log("系统内置创作资源已是最新，无需同步。");
}

main()
  .catch((error) => {
    console.error("种子数据写入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
