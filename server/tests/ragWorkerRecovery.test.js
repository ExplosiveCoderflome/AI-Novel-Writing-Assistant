const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-worker-test-"));
process.env.DATABASE_URL = `file:${path.join(temporaryRoot, "test.db").replace(/\\/g, "/")}`;
process.env.AI_NOVEL_APP_DATA_DIR = temporaryRoot;
const { prisma } = require("../dist/db/prisma.js");
const { RagWorker } = require("../dist/services/rag/RagWorker.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { ragConfig } = require("../dist/config/rag.js");
const { stubDatabaseMethod } = require("./legacyDirector/databasePorts.js");
const { RagIndexRollbackError } = require("../dist/services/rag/indexing/index.js");

test.after(async () => {
  await prisma.$disconnect();
  assert.equal(path.dirname(temporaryRoot), os.tmpdir());
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

async function flush() {
  for (let index = 0; index < 10; index += 1) await new Promise(setImmediate);
}

function fixture(t, overrides = {}) {
  const originalConfig = { ...ragConfig };
  Object.assign(ragConfig, { enabled: true, verboseLog: false, workerRetryBaseMs: 1000 });
  t.after(() => Object.assign(ragConfig, originalConfig));
  t.mock.method(globalThis, "setInterval", () => ({ testTimer: true }));
  t.mock.method(globalThis, "clearInterval", () => {});
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const job = { id: "job", tenantId: "default", ownerType: "knowledge_document", ownerId: "document",
    jobType: "rebuild", attempts: 0, maxAttempts: 2, status: "queued", runAfter: new Date(0), ...overrides };
  const calls = [];
  const port = {
    listInterruptedJobs: async () => { calls.push("recovery"); return job.status === "running" && job.runAfter <= new Date() ? [{ ...job }] : []; },
    getNextRunnableJob: async () => {
      calls.push("poll");
      return job.status === "queued" && job.runAfter <= new Date() ? { ...job } : null;
    },
    updateJobStatus: async (id, data) => { calls.push(data.status); Object.assign(job, data); return { ...job }; },
    recoverJob: async () => port.updateJobStatus(job.id, { status: job.attempts >= job.maxAttempts ? "failed" : "queued",
      runAfter: new Date(0), lastError: "Interrupted job reached its attempt limit or was requeued." }),
    claimJob: async () => port.updateJobStatus(job.id, { status: "running", attempts: job.attempts + 1, runAfter: new Date(Date.now() + 90000) }),
    renewJob: async () => true,
    processJob: async () => { calls.push("process"); return { chunks: 2 }; },
  };
  const worker = new RagWorker(port);
  t.after(() => worker.stop());
  return { worker, job, port, calls, warnings };
}

test("startup finishes interrupted-job recovery before its first poll", async (t) => {
  const f = fixture(t, { status: "running" });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const originalList = f.port.listInterruptedJobs;
  f.port.listInterruptedJobs = async () => { await gate; return originalList(); };
  f.worker.start();
  await flush();
  assert.equal(f.calls.includes("poll"), false);
  release();
  await flush();
  assert.deepEqual(f.calls.slice(0, 4), ["recovery", "queued", "recovery", "poll"]);
  assert.equal(f.job.status, "succeeded");
  assert.equal(f.job.attempts, 1);
});

test("interrupted jobs at the attempt limit fail without another embedding request", async (t) => {
  const f = fixture(t, { status: "running", attempts: 1, maxAttempts: 1 });
  f.worker.start();
  await flush();
  assert.equal(f.job.status, "failed");
  assert.equal(f.job.attempts, 1);
  assert.equal(f.calls.includes("process"), false);
  assert.match(f.job.lastError, /attempt limit/);
});

test("queued jobs cannot exceed their attempt budget either", async (t) => {
  const f = fixture(t, { attempts: 2, maxAttempts: 1 });
  f.worker.start();
  await flush();
  assert.equal(f.job.status, "failed");
  assert.equal(f.job.attempts, 2);
  assert.equal(f.calls.includes("process"), false);
});

test("failure uses backoff and the next attempt succeeds within the budget", async (t) => {
  const f = fixture(t);
  let attempts = 0;
  f.port.processJob = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline transient error");
    return { chunks: 2 };
  };
  const before = Date.now();
  f.worker.start();
  await flush();
  assert.equal(f.job.status, "queued");
  assert.equal(f.job.attempts, 1);
  assert.ok(f.job.runAfter.getTime() >= before + 1000);
  assert.equal(f.warnings.length, 1, "failure must remain visible with verbose logging disabled");
  f.job.runAfter = new Date(0);
  await f.worker.tick();
  assert.equal(f.job.status, "succeeded");
  assert.equal(f.job.attempts, 2);
});

test("settings stop/start does not recover and duplicate the same in-flight job", async (t) => {
  const f = fixture(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  f.port.processJob = async () => { f.calls.push("process"); await gate; return { chunks: 1 }; };
  f.worker.start();
  await flush();
  assert.equal(f.job.status, "running");
  f.worker.stop();
  f.worker.start();
  await flush();
  assert.equal(f.calls.filter((call) => call === "recovery").length, 1);
  release();
  await flush();
  await f.worker.tick();
  assert.equal(f.calls.filter((call) => call === "process").length, 1);
  assert.equal(f.job.status, "succeeded");
});

test("a failed startup scan is reported and retried before queued work is processed", async (t) => {
  const f = fixture(t);
  const originalList = f.port.listInterruptedJobs;
  let scans = 0;
  f.port.listInterruptedJobs = async () => { scans += 1; if (scans === 1) throw new Error("temporary database error"); return originalList(); };
  f.worker.start();
  await flush();
  assert.equal(f.calls.includes("poll"), false);
  assert.equal(f.warnings.length, 1);
  await f.worker.tick();
  assert.equal(f.job.status, "succeeded");
  assert.equal(scans, 2);
});

test("terminal failure retains completed counts and partial progress", async (t) => {
  const progress = { stage: "embedding", current: 3, total: 10, documents: 1, chunks: 10, percent: 0.3 };
  const job = { id: "job", ownerType: "knowledge_document", ownerId: "doc", jobType: "rebuild",
    status: "running", payloadJson: JSON.stringify({ progress }) };
  stubDatabaseMethod(t, prisma.ragIndexJob, "findUnique", async () => ({ ...job }));
  stubDatabaseMethod(t, prisma.ragIndexJob, "update", async ({ data }) => { Object.assign(job, data); return { ...job }; });
  stubDatabaseMethod(t, prisma.knowledgeDocument, "updateMany", async () => ({ count: 1 }));
  await new RagIndexService({}, {}).updateJobStatus("job", { status: "failed", lastError: "offline timeout" });
  const saved = JSON.parse(job.payloadJson).progress;
  assert.equal(saved.current, 3);
  assert.equal(saved.total, 10);
  assert.equal(saved.percent, 0.3);
  assert.equal(saved.stage, "failed");
});

test("staging rollback failure stops the worker even when retries remain", async (t) => {
  const f = fixture(t, { maxAttempts: 8 });
  f.port.processJob = async () => { throw new RagIndexRollbackError("partial upsert", "injected rollback failure"); };
  f.worker.start(); await flush();
  assert.equal(f.job.status, "failed"); assert.equal(f.job.attempts, 1);
  assert.equal(f.calls.filter((call) => call === "queued").length, 0);
  await f.worker.tick();
  assert.equal(f.job.attempts, 1);
});
