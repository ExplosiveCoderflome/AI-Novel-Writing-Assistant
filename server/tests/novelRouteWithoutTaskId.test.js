const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { DirectorCommandService } = require("../dist/services/novel/director/commands/DirectorCommandService.js");
const { resumeTargetToRoute } = require("../dist/services/novel/workflow/novelWorkflow.shared.js");

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
