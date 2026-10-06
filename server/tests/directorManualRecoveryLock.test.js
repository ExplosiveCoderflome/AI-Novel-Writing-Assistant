const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const tempRoot = path.join(repoRoot, "server", ".tmp");

test("worker healing preserves all task state when a queued task waits for manual recovery", () => {
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "director-manual-recovery-"));
  const databasePath = path.join(tempDir, "manual-recovery.db");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const scriptPath = path.join(tempDir, "manual-recovery.cjs");
  console.log(`[director-manual-recovery] retained test database: ${databasePath}`);

  const Database = require(require.resolve("better-sqlite3", { paths: [path.join(repoRoot, "server")] }));
  const db = new Database(databasePath);
  try {
    const migrationsRoot = path.join(repoRoot, "server", "src", "prisma", "migrations.sqlite");
    for (const folder of fs.readdirSync(migrationsRoot).sort()) {
      const migrationPath = path.join(migrationsRoot, folder, "migration.sql");
      if (fs.existsSync(migrationPath)) db.exec(fs.readFileSync(migrationPath, "utf8"));
    }
  } finally {
    db.close();
  }

  fs.writeFileSync(scriptPath, `
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.cwd();
const fromDist = (name) => require(path.join(root, "server", "dist", name));
const { prisma } = fromDist("db/prisma.js");
const { NovelWorkflowService } = fromDist("services/novel/workflow/NovelWorkflowService.js");
const { NovelWorkflowHealingService } = fromDist("services/novel/workflow/NovelWorkflowHealingService.js");
const { isHistoricalAutoDirectorRecoveryNotNeededFailure } = fromDist("services/novel/workflow/novelWorkflowRecoveryHeuristics.js");

async function main() {
  const novel = await prisma.novel.create({ data: { title: "人工恢复锁测试" } });
  const queuedTask = await prisma.novelWorkflowTask.create({
    data: {
      novelId: novel.id,
      lane: "auto_director",
      title: "等待人工恢复的排队任务",
      status: "queued",
      currentStage: "章节执行",
      currentItemKey: "chapter_list",
      currentItemLabel: "等待人工恢复",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "请从已保存章节恢复。",
      pendingManualRecovery: true,
      seedPayloadJson: JSON.stringify({ runMode: "auto_to_full_book" }),
    },
  });
  const failedTask = await prisma.novelWorkflowTask.create({
    data: {
      novelId: novel.id,
      lane: "auto_director",
      title: "等待人工恢复的历史失败任务",
      status: "failed",
      currentStage: "章节执行",
      currentItemKey: "chapter_execution",
      currentItemLabel: "等待人工恢复",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "请从已保存章节恢复。",
      pendingManualRecovery: true,
      lastError: "当前导演产物已经完整，无需继续自动导演。",
      seedPayloadJson: JSON.stringify({ runMode: "auto_to_full_book" }),
    },
  });
  assert.equal(isHistoricalAutoDirectorRecoveryNotNeededFailure(failedTask), true);
  const columns = {
    status: true,
    updatedAt: true,
    seedPayloadJson: true,
    checkpointType: true,
    pendingManualRecovery: true,
  };
  const taskIds = [queuedTask.id, failedTask.id];
  const before = await prisma.novelWorkflowTask.findMany({
    where: { id: { in: taskIds } },
    orderBy: { id: "asc" },
    select: { id: true, ...columns },
  });
  const healer = new NovelWorkflowHealingService(new NovelWorkflowService());

  await healer.healAutoDirectorTaskState(queuedTask.id);
  await healer.healAutoDirectorTaskState(failedTask.id);

  const after = await prisma.novelWorkflowTask.findMany({
    where: { id: { in: taskIds } },
    orderBy: { id: "asc" },
    select: { id: true, ...columns },
  });
  assert.deepEqual(after, before, "background healing must not change any protected task column");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
`, "utf8");

  childProcess.execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
});
