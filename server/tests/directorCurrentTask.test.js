const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.join(repoRoot, "server");

function runScenario() {
  const tempRoot = path.join(serverRoot, ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "director-current-task-"));
  const databasePath = path.join(tempDir, "director-current-task.db");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const scriptPath = path.join(tempDir, "run-director-current-task.cjs");

  try {
    fs.writeFileSync(databasePath, "");
    childProcess.execSync("pnpm --filter @ai-novel/server prisma:push", {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      shell: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    fs.writeFileSync(scriptPath, `
const path = require("node:path");

async function main() {
  const repoRoot = process.cwd();
  const { prisma } = require(path.join(repoRoot, "server", "dist", "db", "prisma.js"));
  const { archiveTask } = require(path.join(repoRoot, "server", "dist", "services", "task", "taskArchive.js"));
  const { NovelWorkflowService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "workflow", "NovelWorkflowService.js"));
  const { DirectorCommandService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "director", "commands", "DirectorCommandService.js"));
  const {
    findActiveDirectorTask,
    resolveCurrentDirectorTask,
    startDirectorTaskForNovel,
  } = require(path.join(repoRoot, "server", "dist", "services", "novel", "director", "state", "currentDirectorTask.js"));

  const createNovel = (title) => prisma.novel.create({ data: { title } });
  const createTask = (input) => prisma.novelWorkflowTask.create({
    data: {
      id: input.id,
      novelId: input.novelId,
      lane: input.lane ?? "auto_director",
      title: input.id,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
  });

  const lookupNovel = await createNovel("当前任务解析测试");
  const oldDate = new Date("2020-01-01T00:00:00.000Z");
  const currentDate = new Date("2022-01-01T00:00:00.000Z");
  await createTask({ id: "task_old_active", novelId: lookupNovel.id, status: "running", createdAt: oldDate, updatedAt: new Date("2030-01-01T00:00:00.000Z") });
  await createTask({ id: "task_wrong_lane", novelId: lookupNovel.id, lane: "manual_create", status: "queued", createdAt: new Date("2040-01-01T00:00:00.000Z"), updatedAt: new Date("2040-01-01T00:00:00.000Z") });
  await createTask({ id: "task_tie_a", novelId: lookupNovel.id, status: "succeeded", createdAt: currentDate, updatedAt: new Date("2010-01-01T00:00:00.000Z") });
  await createTask({ id: "task_tie_z", novelId: lookupNovel.id, status: "failed", createdAt: currentDate, updatedAt: new Date("2009-01-01T00:00:00.000Z") });
  const archived = await createTask({ id: "task_archived_newest", novelId: lookupNovel.id, status: "queued", createdAt: new Date("2045-01-01T00:00:00.000Z"), updatedAt: new Date("2045-01-01T00:00:00.000Z") });
  await archiveTask("novel_workflow", archived.id);

  const currentTask = await resolveCurrentDirectorTask(lookupNovel.id);
  const activeTask = await findActiveDirectorTask(lookupNovel.id);

  const concurrentNovel = await createNovel("并发创建测试");
  const concurrentResults = await Promise.allSettled([
    startDirectorTaskForNovel({ novelId: concurrentNovel.id, title: "并发创建 A" }, { whenActive: "reject" }),
    startDirectorTaskForNovel({ novelId: concurrentNovel.id, title: "并发创建 B" }, { whenActive: "reject" }),
  ]);
  const concurrentTasks = await prisma.novelWorkflowTask.findMany({
    where: { novelId: concurrentNovel.id, lane: "auto_director", status: { in: ["queued", "running", "waiting_approval"] } },
    select: { id: true },
  });
  const concurrentErrors = concurrentResults
    .filter((result) => result.status === "rejected")
    .map((result) => ({
      statusCode: result.reason.statusCode ?? null,
      details: result.reason.details ?? null,
    }));

  const takeoverNovel = await createNovel("接管替换测试");
  const activeOne = await createTask({ id: "task_active_one", novelId: takeoverNovel.id, status: "running", createdAt: oldDate, updatedAt: oldDate });
  const activeTwo = await createTask({ id: "task_active_two", novelId: takeoverNovel.id, status: "waiting_approval", createdAt: currentDate, updatedAt: currentDate });
  const commandQueued = await prisma.directorRunCommand.create({
    data: { taskId: activeOne.id, novelId: takeoverNovel.id, commandType: "takeover", idempotencyKey: "queued-command", status: "queued" },
  });
  const commandRunning = await prisma.directorRunCommand.create({
    data: { taskId: activeTwo.id, novelId: takeoverNovel.id, commandType: "takeover", idempotencyKey: "running-command", status: "running" },
  });
  const rejectedStart = await startDirectorTaskForNovel(
    { novelId: takeoverNovel.id, title: "应拒绝的新任务" },
    { whenActive: "reject" },
  ).then(() => null, (error) => ({ statusCode: error.statusCode ?? null, details: error.details ?? null }));
  const replacement = await startDirectorTaskForNovel(
    { novelId: takeoverNovel.id, title: "替换后的新任务" },
    { whenActive: "supersede" },
  );
  const supersededTasks = await prisma.novelWorkflowTask.findMany({
    where: { id: { in: [activeOne.id, activeTwo.id] } },
    orderBy: { id: "asc" },
    select: { id: true, status: true, lastError: true },
  });
  const supersededCommands = await prisma.directorRunCommand.findMany({
    where: { id: { in: [commandQueued.id, commandRunning.id] } },
    orderBy: { id: "asc" },
    select: { id: true, status: true },
  });

  const commandNovel = await createNovel("接管命令并发测试");
  const commandWorkflowService = new NovelWorkflowService();
  const startCommandTask = commandWorkflowService.startDirectorTaskForNovel.bind(commandWorkflowService);
  commandWorkflowService.startDirectorTaskForNovel = async (...args) => {
    const task = await startCommandTask(...args);
    await prisma.novelWorkflowTask.update({
      where: { id: task.id },
      data: { status: "cancelled", finishedAt: new Date(), lastError: "已被新的 AI 任务替换" },
    });
    return task;
  };
  const directorCommandService = new DirectorCommandService(commandWorkflowService);
  const supersededTakeover = await directorCommandService.enqueueTakeoverCommand({
    novelId: commandNovel.id,
    strategy: "continue_existing",
  }).then(() => null, (error) => ({ statusCode: error.statusCode ?? null, details: error.details ?? null }));
  const supersededTakeoverCommands = await prisma.directorRunCommand.findMany({
    where: { novelId: commandNovel.id, commandType: "takeover" },
    select: { id: true, taskId: true, status: true },
  });

  console.log(JSON.stringify({
    currentTaskId: currentTask?.id ?? null,
    activeTaskId: activeTask?.id ?? null,
    concurrentSuccessCount: concurrentResults.filter((result) => result.status === "fulfilled").length,
    concurrentErrorCount: concurrentErrors.length,
    concurrentErrors,
    concurrentActiveTaskCount: concurrentTasks.length,
    rejectedStart,
    replacementTaskId: replacement.id,
    supersededTasks,
    supersededCommands,
    supersededTakeover,
    supersededTakeoverCommands,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  const { prisma } = require(path.join(process.cwd(), "server", "dist", "db", "prisma.js"));
  await prisma.$disconnect();
});
`, "utf8");

    const stdout = childProcess.execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const jsonLine = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse().find((line) => line.startsWith("{"));
    if (!jsonLine) {
      throw new Error(`Child scenario did not write a JSON result. stdout=${stdout}`);
    }
    return JSON.parse(jsonLine);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("current director task is the newest visible task by creation time and id, regardless of status", () => {
  const result = runScenario();

  assert.equal(result.currentTaskId, "task_tie_z");
  assert.equal(result.activeTaskId, null);
});

test("starting director work rejects, serializes, or supersedes active tasks as requested", () => {
  const result = runScenario();

  assert.equal(result.concurrentSuccessCount, 1);
  assert.equal(result.concurrentErrorCount, 1);
  assert.equal(result.concurrentErrors[0].statusCode, 409);
  assert.equal(result.concurrentErrors[0].details.code, "DIRECTOR_TASK_ALREADY_ACTIVE");
  assert.equal(result.concurrentActiveTaskCount, 1);

  assert.equal(result.rejectedStart.statusCode, 409);
  assert.equal(result.rejectedStart.details.code, "DIRECTOR_TASK_ALREADY_ACTIVE");
  assert.ok(result.rejectedStart.details.activeTaskId);
  assert.ok(result.replacementTaskId);
  assert.deepEqual(result.supersededTasks.map((task) => task.status), ["cancelled", "cancelled"]);
  assert.ok(result.supersededTasks.every((task) => task.lastError === "已被新的 AI 任务替换"));
  assert.deepEqual(result.supersededCommands.map((command) => command.status), ["cancelled", "cancelled"]);
  assert.equal(result.supersededTakeover.statusCode, 409);
  assert.equal(result.supersededTakeover.details.code, "DIRECTOR_TASK_SUPERSEDED");
  assert.deepEqual(result.supersededTakeoverCommands, []);
});
