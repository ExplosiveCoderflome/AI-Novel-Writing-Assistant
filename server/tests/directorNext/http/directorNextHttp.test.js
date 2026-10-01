const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const { mountDirectorNext } = require("../../../dist/modules/director/http");
const { errorHandler } = require("../../../dist/middleware/errorHandler");

async function withServer(deps, run) {
  const app = express();
  app.use(express.json());
  mountDirectorNext(app, deps);
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function deps(overrides = {}) {
  return {
    commandService: {
      execute: async () => ({ runId: "run-1", controlVersion: 0, commandId: "cmd-1", replayed: false }),
    },
    projectionService: {
      get: async () => ({ runId: "run-1", mode: "running", driver: "auto", headline: "正在推进创作", detail: null, progress: { done: 1, total: 4, source: "artifact_ledger" }, debts: { count: 0, chapterOrders: [] }, availableActions: [], sourceRoute: "/novels/novel-1", sourceTrace: { controlStatus: "running", controlVersion: 0, pauseKind: null, planVersion: "p1" } }),
    },
    runRepository: {
      findActiveRunIdByNovel: async () => "run-1",
      listRunIds: async () => ["run-1"],
    },
    eventLog: { list: async () => [{ seq: 1, type: "run_opened", payload: {}, createdAt: new Date("2026-10-01T00:00:00.000Z") }] },
    ...overrides,
  };
}

test("command endpoint validates and returns immediately with the run projection key", async () => {
  await withServer(deps(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resume", runId: "run-1", expectedVersion: 0, idempotencyKey: "resume-1" }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { success: true, data: { runId: "run-1", controlVersion: 0 }, message: "创作命令已接收。" });
  });
});

test("current and detail reads use the source page route and never expose a task route", async () => {
  await withServer(deps(), async (baseUrl) => {
    const current = await fetch(`${baseUrl}/api/director-next/novels/novel-1/current`);
    const currentBody = await current.json();
    assert.equal(current.status, 200);
    assert.equal(currentBody.data.sourceRoute, "/novels/novel-1");
    assert.equal(JSON.stringify(currentBody).includes("directorTaskId"), false);

    const detail = await fetch(`${baseUrl}/api/director-next/runs/run-1`);
    const detailBody = await detail.json();
    assert.equal(detail.status, 200);
    assert.equal(detailBody.data.timeline[0].seq, 1);
  });
});

test("history reads support needsAttention without mutating facts", async () => {
  let requested = null;
  await withServer(deps({ runRepository: { listRunIds: async (options) => { requested = options; return ["run-1"]; }, findActiveRunIdByNovel: async () => "run-1" } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/runs?needsAttention=true&limit=10`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.length, 1);
  });
  assert.deepEqual(requested, { needsAttention: true, limit: 10 });
});

test("invalid commands return a validation error and never reach the command service", async () => {
  let calls = 0;
  await withServer(deps({ commandService: { execute: async () => { calls += 1; return null; } } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resume", runId: "", expectedVersion: -1, idempotencyKey: "" }),
    });
    assert.equal(response.status, 400);
  });
  assert.equal(calls, 0);
});
