const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { DirectorCommandService } = require("../dist/services/novel/director/DirectorCommandService.js");
const { DirectorTaskSnapshotService } = require("../dist/services/novel/director/DirectorTaskSnapshotService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
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
      headers: payload
        ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        }
        : undefined,
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

test("director task routes accept task creation, command append and snapshot reads", async (t) => {
  const originals = {
    enqueueGenerateCandidatesCommand: DirectorCommandService.prototype.enqueueGenerateCandidatesCommand,
    enqueueContinueCommand: DirectorCommandService.prototype.enqueueContinueCommand,
    getTaskSnapshot: DirectorTaskSnapshotService.prototype.getTaskSnapshot,
  };
  const calls = [];

  DirectorCommandService.prototype.enqueueGenerateCandidatesCommand = async function mockGenerate(payload) {
    calls.push(["create", payload.idea]);
    return {
      commandId: "command-create",
      taskId: "task-created",
      novelId: "novel-created",
      commandType: "generate_candidates",
      status: "queued",
      projectionUrl: "/api/novels/director/tasks/task-created",
    };
  };
  DirectorCommandService.prototype.enqueueContinueCommand = async function mockContinue(taskId, payload) {
    calls.push(["continue", taskId, payload?.continuationMode ?? null]);
    return {
      commandId: "command-continue",
      taskId,
      novelId: "novel-created",
      commandType: "continue",
      status: "queued",
      projectionUrl: `/api/novels/director/tasks/${taskId}`,
    };
  };
  DirectorTaskSnapshotService.prototype.getTaskSnapshot = async function mockSnapshot(taskId) {
    calls.push(["snapshot", taskId]);
    return {
      snapshot: {
        task: {
          id: taskId,
          novelId: "novel-created",
          status: "running",
          currentStage: "AI 自动导演",
          currentItemKey: "chapter_execution",
          currentItemLabel: "AI 正在推进正文生成",
          progress: 0.72,
          checkpointType: null,
          checkpointSummary: null,
          lastError: null,
          pendingManualRecovery: false,
          cancelRequestedAt: null,
        },
        run: {
          id: "run-1",
          novelId: "novel-created",
          entrypoint: "confirm_candidate",
        },
        activeStep: {
          idempotencyKey: "step-1",
          nodeKey: "chapter_execution_node",
          label: "章节正文生成",
          status: "running",
        },
        latestCommand: {
          id: "command-continue",
          commandType: "continue",
          status: "running",
        },
        runtime: null,
        projection: null,
        recentEvents: [],
        artifacts: [],
        chapterProgress: null,
        nextActions: ["continue"],
      },
    };
  };

  t.after(() => {
    DirectorCommandService.prototype.enqueueGenerateCandidatesCommand = originals.enqueueGenerateCandidatesCommand;
    DirectorCommandService.prototype.enqueueContinueCommand = originals.enqueueContinueCommand;
    DirectorTaskSnapshotService.prototype.getTaskSnapshot = originals.getTaskSnapshot;
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  t.after(() => server.close());

  const createResponse = await requestJson(port, "POST", "/api/novels/director/tasks", {
    taskType: "generate_candidates",
    payload: {
      idea: "A rookie courier discovers a hidden city rule system.",
      title: "Rulebound Courier",
      writingMode: "original",
      projectMode: "ai_led",
    },
  });
  assert.equal(createResponse.status, 202);
  assert.equal(createResponse.body.data.taskId, "task-created");

  const continueResponse = await requestJson(port, "POST", "/api/novels/director/tasks/task-created/commands", {
    commandType: "continue",
    payload: {
      continuationMode: "resume",
    },
  });
  assert.equal(continueResponse.status, 202);
  assert.equal(continueResponse.body.data.commandId, "command-continue");

  const snapshotResponse = await requestJson(port, "GET", "/api/novels/director/tasks/task-created");
  assert.equal(snapshotResponse.status, 200);
  assert.equal(snapshotResponse.body.data.snapshot.task.id, "task-created");
  assert.deepEqual(snapshotResponse.body.data.snapshot.nextActions, ["continue"]);

  assert.deepEqual(calls, [
    ["create", "A rookie courier discovers a hidden city rule system."],
    ["continue", "task-created", "resume"],
    ["snapshot", "task-created"],
  ]);
});
