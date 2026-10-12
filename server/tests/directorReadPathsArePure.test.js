const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const tempRoot = path.join(repoRoot, "server", ".tmp");

test("director reads preserve stale task columns in a real SQLite database", () => {
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "director-read-pure-"));
  const databaseUrl = `file:${path.join(tempDir, "read-pure.db").replace(/\\/g, "/")}`;
  const scriptPath = path.join(tempDir, "read-pure.cjs");
  console.log(`[director-read-pure] retained test database: ${path.join(tempDir, "read-pure.db")}`);
  try {
    const Database = require(require.resolve("better-sqlite3", { paths: [path.join(repoRoot, "server")] }));
    const db = new Database(path.join(tempDir, "read-pure.db"));
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
const { NovelWorkflowTaskAdapter } = fromDist("services/task/adapters/NovelWorkflowTaskAdapter.js");
const { AutoDirectorFollowUpService } = fromDist("services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.js");
const { AutoDirectorFollowUpActionExecutor } = fromDist("services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");
const { DirectorBookAutomationProjectionService } = fromDist("services/novel/director/projections/DirectorBookAutomationProjectionService.js");
const { NovelCoreCrudService } = fromDist("services/novel/novelCoreCrudService.js");
const { DirectorTaskHealingSweep } = fromDist("workers/directorTaskHealingSweep.js");

async function main() {
  let readTriggeredSweep = 0;
  DirectorTaskHealingSweep.prototype.run = async () => { readTriggeredSweep += 1; };
  const novel = await prisma.novel.create({ data: { title: "纯读边界测试" } });
  const task = await prisma.novelWorkflowTask.create({
    data: {
      novelId: novel.id,
      lane: "auto_director",
      title: "陈旧候选任务",
      status: "failed",
      checkpointType: "candidate_selection_required",
      pendingManualRecovery: false,
      seedPayloadJson: JSON.stringify({
        directorSession: { phase: "candidate_selection", isBackgroundRunning: false },
        batches: [{ id: "batch-1", candidates: [{ workingTitle: "无 ID 的候选" }] }],
      }),
    },
  });
  const queuedTask = await prisma.novelWorkflowTask.create({
    data: {
      novelId: novel.id,
      lane: "auto_director",
      title: "陈旧排队任务",
      status: "queued",
      currentItemKey: "chapter_list",
      checkpointType: "candidate_selection_required",
      pendingManualRecovery: false,
      heartbeatAt: new Date("2020-01-01T00:00:00.000Z"),
      seedPayloadJson: "{}",
    },
  });
  const columns = { status: true, updatedAt: true, seedPayloadJson: true, checkpointType: true, pendingManualRecovery: true };
  const before = await prisma.novelWorkflowTask.findMany({ where: { id: { in: [task.id, queuedTask.id] } }, orderBy: { id: "asc" }, select: { id: true, ...columns } });
  const check = async (label, operation) => {
    await operation();
    const after = await prisma.novelWorkflowTask.findMany({ where: { id: { in: [task.id, queuedTask.id] } }, orderBy: { id: "asc" }, select: { id: true, ...columns } });
    assert.deepEqual(after, before, label + " changed persistent task columns");
  };
  const workflow = new NovelWorkflowService();
  const adapter = new NovelWorkflowTaskAdapter();
  const followUps = new AutoDirectorFollowUpService();
  await check("workflow detail", () => workflow.getVisibleRowById(task.id));
  await check("workflow list", () => workflow.getVisibleRowsByNovelId(novel.id, "auto_director"));
  await check("book automation", () => new DirectorBookAutomationProjectionService().getProjection(novel.id));
  await check("running records detail", () => adapter.detail(task.id));
  await check("running records list", () => adapter.list({ take: 10 }));
  await check("follow-up detail", () => followUps.getDetail(task.id));
  await check("follow-up list", () => followUps.list());
  await check("novel list", () => new NovelCoreCrudService().listNovels({ page: 1, limit: 10 }));
  assert.equal(readTriggeredSweep, 0, "read entrypoints must not launch worker healing sweeps");

  for (const scenario of [
    { stepStatus: "waiting_approval", actionCode: "continue_auto_execution", checkpointType: "chapter_batch_ready" },
    { stepStatus: "blocked_scope", actionCode: "continue_auto_execution", checkpointType: "chapter_batch_ready" },
    { stepStatus: "failed", actionCode: "retry_with_task_model", checkpointType: null },
  ]) {
    const actionTask = await prisma.novelWorkflowTask.create({
      data: {
        novelId: novel.id,
        lane: "auto_director",
        title: scenario.stepStatus,
        status: "running",
        checkpointType: scenario.checkpointType,
        pendingManualRecovery: false,
        seedPayloadJson: "{}",
      },
    });
    const run = await prisma.directorRun.create({ data: { id: "run-" + scenario.stepStatus, taskId: actionTask.id, novelId: novel.id, policyJson: "{}" } });
    const step = await prisma.directorStepRun.create({
      data: {
        runId: run.id,
        taskId: actionTask.id,
        novelId: novel.id,
        idempotencyKey: "step-" + scenario.stepStatus,
        nodeKey: "chapter_execution",
        label: "章节执行",
        status: scenario.stepStatus,
        startedAt: new Date("2020-01-01T00:00:00.000Z"),
        policyDecisionJson: scenario.stepStatus === "failed" ? null : JSON.stringify({ reason: "等待审批" }),
        error: scenario.stepStatus === "failed" ? "步骤失败" : null,
      },
    });
    const persistedBefore = await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: actionTask.id }, select: columns });
    const result = await new AutoDirectorFollowUpActionExecutor().execute({
      taskId: actionTask.id,
      actionCode: scenario.actionCode,
      source: "web",
      idempotencyKey: "action-" + scenario.stepStatus,
    });
    assert.equal(result.code, "forbidden", scenario.stepStatus + " must use the persisted running state");
    assert.deepEqual(await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: actionTask.id }, select: columns }), persistedBefore, scenario.stepStatus + " action healed task state");
    assert.equal((await prisma.directorStepRun.findUniqueOrThrow({ where: { id: step.id } })).status, scenario.stepStatus);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
`, "utf8");
    childProcess.execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    // Keep the isolated database for evidence and manual inspection.
  }
});
