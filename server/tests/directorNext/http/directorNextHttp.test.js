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
      get: async () => ({ runId: "run-1", novelId: "novel-1", mode: "running", driver: "auto", headline: "正在推进创作", detail: null, progress: { done: 1, total: 4, source: "artifact_ledger" }, debts: { count: 0, chapterOrders: [] }, availableActions: [], sourceRoute: "/novels/novel-1/edit", sourceTrace: { controlStatus: "running", controlVersion: 0, pauseKind: null, planVersion: "p1" } }),
    },
    runRepository: {
      findActiveRunIdByNovel: async () => "run-1",
      listRunIds: async () => ["run-1"],
    },
    eventLog: { list: async () => [{ seq: 1, type: "run_opened", payload: {}, createdAt: new Date("2026-10-01T00:00:00.000Z") }] },
    ...overrides,
  };
}

test("ledger endpoint reads the requested book without entering director commands", async () => {
  await withServer(deps({
    readLedgers: async novelId => ({novelId, payoffs: [], resources: [], resourceEvents: [], pendingResources: [], warnings: []}),
    commandService: {execute: async () => {throw new Error('a read must not execute commands');}},
  }), async url => {
    const response = await fetch(`${url}/api/director-next/novels/book%20one/ledgers`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.novelId, 'book one');
    assert.equal((await fetch(`${url}/api/director-next/novels/book%20one/ledgers`, {method:'POST'})).status,404);
  });
});

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
    assert.equal(currentBody.data.sourceRoute, "/novels/novel-1/edit");
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

test("a novel with no active run displays its latest terminal record", async () => {
  let requested;
  await withServer(deps({ runRepository: {
    findActiveRunIdByNovel: async () => null,
    listRunIds: async (options) => { requested = options; return ["run-1"]; },
  } }), async (url) => {
    const response = await fetch(`${url}/api/director-next/novels/novel-1/current`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.novelId, "novel-1");
  });
  assert.deepEqual(requested, { novelId: "novel-1", limit: 1 });
});

test("read-only records expose labels and a stable novel route without commands", async () => {
  await withServer(deps(), async (url) => {
    const response = await fetch(`${url}/api/director-next/records?needsAttention=true`);
    const record = (await response.json()).data[0];
    assert.equal(record.directorRoute, "/lab/director/novel-1");
    assert.equal(record.statusLabel, "推进中");
    assert.equal(record.progressLabel, "1/4 个阶段完成");
    assert.equal(Object.hasOwn(record, "availableActions"), false);
    assert.equal(Object.hasOwn(record, "sourceTrace"), false);
  });
});

test("unreadable facts or plans remain read-only records without hiding healthy books or inventing progress", async () => {
  const {FactIntegrityError} = require('../../../dist/modules/director/domain');
  const {UnknownPlanVersionError} = require('../../../dist/modules/director/application');
  const saved = {contract: {runId: 'damaged', novelId: 'book/中文?x=1'},
    control: {status: 'paused', version: 4, pause: {kind: 'safety', reason: '保存结果需要检查'}}};
  const before = JSON.stringify(saved);
  const normal = deps().projectionService;
  for (const failure of [new FactIntegrityError('invalid persisted artifact'), new UnknownPlanVersionError('unavailable')]) {
   await withServer(deps({projectionService: {get: async id => {
    if (id === 'damaged') throw failure;
    return normal.get(id);
  }}, runRepository: {listRunIds: async () => ['damaged','run-1'],
    getContract: async id => id === 'damaged' ? saved.contract : null,
    getControl: async id => id === 'damaged' ? saved.control : null}}), async url => {
    const response = await fetch(`${url}/api/director-next/records?needsAttention=true`);
    assert.equal(response.status, 200);
    const records = (await response.json()).data;
    assert.equal(records.length, 2);
    const damaged = records[0];
    assert.equal(damaged.runId, 'damaged');
    assert.equal(damaged.statusLabel, '暂停中');
    assert.equal(damaged.detail, saved.control.pause.reason);
    assert.equal(damaged.progressLabel, '创作进度暂时无法读取');
    assert.equal(damaged.sourceRoute, `/lab/director/${encodeURIComponent(saved.contract.novelId)}`);
    assert.equal(damaged.directorRoute, damaged.sourceRoute);
    assert.equal(Object.hasOwn(damaged, 'availableActions'), false);
    assert.equal(Object.hasOwn(damaged, 'progress'), false);
    assert.equal(records[1].progressLabel, '1/4 个阶段完成');
   });
  }
  assert.equal(JSON.stringify(saved), before);
});

test("record diagnostics cannot invent a missing identity or hide unrelated failures", async () => {
  const {RecordProjection, UnknownPlanVersionError} = require('../../../dist/modules/director/application');
  const {FactIntegrityError} = require('../../../dist/modules/director/domain');
  for (const [failure, savedContract, savedControl, expectedReads] of [
    [new Error('invalid persisted artifact'), {novelId:'book'}, {status:'paused'}, 0],
    [new FactIntegrityError('bad'), null, {status:'paused'}, 2],
    [new UnknownPlanVersionError('missing'), {novelId:'book'}, null, 2],
    [new FactIntegrityError('bad'), {novelId:'book'}, {status:'invalid_status'}, 2],
    [new FactIntegrityError('bad'), {runId:'run',novelId:'book'}, {status:'constructor'}, 2],
    [new FactIntegrityError('bad'), {runId:'another',novelId:'book'}, {status:'paused'}, 2],
  ]) {
    let reads = 0;
    const service = new RecordProjection({projectionService: {get: async () => {throw failure;}},
      runRepository: {getContract: async () => {reads++; return savedContract;},
        getControl: async () => {reads++; return savedControl;}}});
    await assert.rejects(service.get('run'), error => error === failure);
    assert.equal(reads, expectedReads);
  }
});
