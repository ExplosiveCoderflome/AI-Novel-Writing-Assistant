const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { DirectorCommandService } = require("../dist/services/novel/director/commands/DirectorCommandService.js");
const { resumeTargetToRoute } = require("../dist/services/novel/workflow/novelWorkflow.shared.js");
const { buildWorkflowSourceRoute } = require("../dist/services/task/RecoveryTaskService.js");
const { prisma } = require("../dist/db/prisma.js");
const quickSetup = require("../dist/modules/setup/onboarding/application/QuickSetupService.js");
const { getFirstNovelOnboardingProjection } = require("../dist/modules/setup/onboarding/application/FirstNovelOnboardingService.js");
const { CreationStudioService } = require("../dist/modules/novel/creation-studio/application/CreationStudioService.js");
const {
  buildPrimaryAction,
  buildSecondaryActions,
} = require("../dist/services/novel/director/projections/DirectorBookAutomationProjectionModel.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      } : undefined,
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("book current route returns the latest task summary including terminal state", async (t) => {
  const originalResolve = NovelWorkflowService.prototype.resolveCurrentDirectorTask;
  NovelWorkflowService.prototype.resolveCurrentDirectorTask = async function resolveCurrent(novelId) {
    if (novelId === "empty") return null;
    return {
      id: `task-${novelId}`,
      novelId,
      status: novelId === "finished" ? "succeeded" : "running",
      currentStage: "chapter_execution",
      currentItemKey: "chapter_execution",
      currentItemLabel: "第 3 章",
      progress: 0.4,
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "第 2 章已完成",
      seedPayloadJson: "private seed data",
    };
  };
  t.after(() => { NovelWorkflowService.prototype.resolveCurrentDirectorTask = originalResolve; });

  const server = http.createServer(createApp());
  const port = await listen(server);
  t.after(() => server.close());

  const running = await requestJson(port, "GET", "/api/novels/director/novels/running/current");
  assert.equal(running.status, 200);
  assert.deepEqual(running.body.data, {
    id: "task-running",
    novelId: "running",
    status: "running",
    currentStage: "chapter_execution",
    currentItemKey: "chapter_execution",
    currentItemLabel: "第 3 章",
    progress: 0.4,
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "第 2 章已完成",
    isActive: true,
  });

  const finished = await requestJson(port, "GET", "/api/novels/director/novels/finished/current");
  assert.equal(finished.status, 200);
  assert.equal(finished.body.data.id, "task-finished");
  assert.equal(finished.body.data.isActive, false);

  const empty = await requestJson(port, "GET", "/api/novels/director/novels/empty/current");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data, null);
});

test("book command route uses the current task and the existing command behavior", async (t) => {
  const originalResolve = NovelWorkflowService.prototype.resolveCurrentDirectorTask;
  const originalContinue = DirectorCommandService.prototype.enqueueContinueCommand;
  const calls = [];
  NovelWorkflowService.prototype.resolveCurrentDirectorTask = async function resolveCurrent(novelId) {
    return novelId === "empty" ? null : { id: "task-current", novelId, status: "running" };
  };
  DirectorCommandService.prototype.enqueueContinueCommand = async function enqueueContinue(taskId, payload) {
    calls.push({ taskId, payload });
    return {
      commandId: "command-1",
      taskId,
      novelId: "novel-1",
      commandType: "continue",
      status: "queued",
      projectionUrl: `/api/novels/director/tasks/${taskId}`,
    };
  };
  t.after(() => {
    NovelWorkflowService.prototype.resolveCurrentDirectorTask = originalResolve;
    DirectorCommandService.prototype.enqueueContinueCommand = originalContinue;
  });

  const server = http.createServer(createApp());
  const port = await listen(server);
  t.after(() => server.close());

  const payload = { commandType: "continue", payload: { continuationMode: "resume" } };
  const byTask = await requestJson(port, "POST", "/api/novels/director/tasks/task-current/commands", payload);
  const byNovel = await requestJson(port, "POST", "/api/novels/director/novels/novel-1/commands", payload);
  assert.equal(byTask.status, 202);
  assert.deepEqual(byNovel, byTask);
  assert.deepEqual(calls, [
    { taskId: "task-current", payload: { continuationMode: "resume" } },
    { taskId: "task-current", payload: { continuationMode: "resume" } },
  ]);

  const empty = await requestJson(port, "POST", "/api/novels/director/novels/empty/commands", payload);
  assert.equal(empty.status, 404);
  assert.equal(calls.length, 2);
});

test("book resume links retain location but omit task identifiers", () => {
  assert.equal(resumeTargetToRoute({
    route: "/novels/:id/edit",
    novelId: "novel-1",
    taskId: "director-task",
    lane: "auto_director",
    stage: "structured",
    chapterId: "chapter-2",
    volumeId: "volume-1",
  }), "/novels/novel-1/edit?stage=structured&chapterId=chapter-2&volumeId=volume-1");

  assert.equal(resumeTargetToRoute({
    route: "/novels/:id/simple",
    novelId: "novel-2",
    taskId: "manual-task",
    lane: "manual_create",
    stage: "chapter",
  }), "/novels/novel-2/simple?stage=chapter");

  assert.equal(resumeTargetToRoute({
    route: "/novels/create",
    mode: "director",
    taskId: "candidate-task",
  }), "/novels/auto-director?taskId=candidate-task");
});

test("recovery task source routes keep book location but omit task identifiers", () => {
  assert.equal(buildWorkflowSourceRoute({ id: "task-1", novelId: "novel-1", creationExperience: "professional" }), "/novels/novel-1/edit?taskPanel=1");
  assert.equal(buildWorkflowSourceRoute({ id: "task-2", novelId: "novel-2", creationExperience: "simple" }), "/novels/novel-2/simple");
  assert.equal(buildWorkflowSourceRoute({ id: "task-3", novelId: null }), "/tasks?kind=novel_workflow&id=task-3");
});

test("first novel onboarding routes do not bind a book link to a historical task", async (t) => {
  const originals = {
    chapterFindFirst: prisma.chapter.findFirst,
    taskFindFirst: prisma.novelWorkflowTask.findFirst,
    novelFindFirst: prisma.novel.findFirst,
    quickSetupStatus: quickSetup.getQuickSetupStatus,
  };
  const novel = { id: "novel-1", title: "示例小说", creationExperience: "professional" };
  let latestTask = null;
  prisma.chapter.findFirst = async () => null;
  prisma.novelWorkflowTask.findFirst = async () => latestTask;
  prisma.novel.findFirst = async () => novel;
  quickSetup.getQuickSetupStatus = async () => ({
    readyForCreation: true,
    providers: [],
    selectedProvider: "deepseek",
    selectedModel: "deepseek-chat",
    routeCoverage: { configured: 11, total: 11, missingTaskTypes: [] },
    blockingReasons: [],
    recommendedAction: "start_creating",
  });
  t.after(() => {
    prisma.chapter.findFirst = originals.chapterFindFirst;
    prisma.novelWorkflowTask.findFirst = originals.taskFindFirst;
    prisma.novel.findFirst = originals.novelFindFirst;
    quickSetup.getQuickSetupStatus = originals.quickSetupStatus;
  });

  const cases = [
    { checkpointType: "production_experience_required", currentStage: "chapter_execution" },
    { checkpointType: null, currentStage: "chapter_execution" },
    { checkpointType: null, currentStage: "chapter_planning" },
  ];
  for (const state of cases) {
    latestTask = {
      id: "old-task-id",
      novelId: novel.id,
      status: "running",
      checkpointType: state.checkpointType,
      currentStage: state.currentStage,
      currentItemLabel: "准备章节",
      lastError: null,
      novel,
    };
    const projection = await getFirstNovelOnboardingProjection();
    assert.equal(projection.primaryAction.route, "/novels/novel-1/edit");
  }
});

test("creation studio confirmation resumes at the novel page without a task selector", () => {
  const service = new CreationStudioService();
  const result = service.buildConfirmationResult("studio-task", "long_novel", "novel-1", "production-task");
  assert.equal(result.resumeRoute, "/novels/novel-1/edit");
});

test("director book automation action builders omit task identifiers from novel links", () => {
  assert.equal(buildPrimaryAction({
    novelId: "novel-1",
    status: "running",
    task: { id: "task-1" },
  }).target.href, "/novels/novel-1/edit");
  assert.equal(buildPrimaryAction({
    novelId: "novel-1",
    status: "waiting_approval",
    task: { id: "task-1", checkpointType: "chapter_batch_ready" },
  }).target.href, "/novels/novel-1/edit?stage=chapter");
  assert.equal(buildPrimaryAction({
    novelId: "novel-1",
    status: "failed",
    task: { id: "task-1", checkpointType: "replan_required" },
  }).target.href, "/novels/novel-1/edit?stage=pipeline");
  assert.equal(buildPrimaryAction({
    novelId: "novel-1",
    status: "failed",
    task: { id: "task-1" },
  }).target.href, "/novels/novel-1/edit?taskPanel=1");
  assert.equal(buildSecondaryActions({ novelId: "novel-1", status: "failed", taskId: "task-1" })[0].target.href, "/novels/novel-1/edit?taskPanel=1");
});
