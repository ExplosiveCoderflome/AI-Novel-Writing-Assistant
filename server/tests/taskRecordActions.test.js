const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskCenterService } = require("../dist/services/task/TaskCenterService.js");
const { prisma } = require("../dist/db/prisma.js");
const lifecycle = require("../dist/services/bookAnalysis/generation/lifecycle.js");

test("record deletion rejects active tasks and preserves the resource graph for finished tasks", async () => {
  const service = new TaskCenterService();
  const original = prisma.taskCenterArchive.upsert;
  const originalWorkflow = prisma.novelWorkflowTask.findUnique;
  let persistedStatus = "running";
  prisma.novelWorkflowTask.findUnique = async () => persistedStatus ? { status: persistedStatus } : null;
  const calls = [];
  prisma.taskCenterArchive.upsert = async input => { calls.push(input); return {}; };
  try {
    for (const status of ["queued", "running", "waiting_approval"]) {
      service.getTaskDetail = async () => ({ status });
      persistedStatus = status;
      await assert.rejects(service.deleteRecord("novel_workflow", "task"), /请先.*停止/);
    }
    assert.equal(calls.length, 0);
    for (const status of ["succeeded", "failed", "cancelled"]) {
      service.getTaskDetail = async () => ({ status });
      persistedStatus = status;
      await service.deleteRecord("novel_workflow", "task");
    }
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].create, { taskKind: "novel_workflow", taskId: "task" });
    service.getTaskDetail = async () => null;
    persistedStatus = null;
    await assert.rejects(service.deleteRecord("novel_workflow", "missing"), /不存在/);
  } finally {
    prisma.taskCenterArchive.upsert = original;
    prisma.novelWorkflowTask.findUnique = originalWorkflow;
  }
});

test("book stop interrupts an in-flight request and never launches the next invocation", async () => {
  let calls = 0;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const execution = lifecycle.withAnalysisHeartbeat("stop-test", async () => {
    const signal = lifecycle.analysisSignal();
    calls++;
    started();
    await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    calls++;
  });
  await ready;
  lifecycle.abortAnalysis("stop-test");
  await assert.rejects(execution, /BOOK_ANALYSIS_CANCELLED/);
    assert.equal(calls, 1);
  assert.equal(lifecycle.analysisSignal(), undefined);
});

test("a cancelled chapter-identification request cannot become a usable fallback", async () => {
  const { getDocumentChaptersSafely } = require("../dist/services/bookAnalysis/generation/documentChapters.js");
  await assert.rejects(lifecycle.withAnalysisHeartbeat("chapter-stop", async () => {
    return getDocumentChaptersSafely({ ensureChaptersForVersion: async () => {
      lifecycle.abortAnalysis("chapter-stop");
      throw new lifecycle.AnalysisCancelledError();
    } }, "version", "原文");
  }), /BOOK_ANALYSIS_CANCELLED/);
});

test("book worker observes persisted cancellation from another process", async () => {
  const original = prisma.bookAnalysis.findUnique;
  prisma.bookAnalysis.findUnique = async () => ({ status: "running", cancelRequestedAt: new Date() });
  try {
    await assert.rejects(lifecycle.withAnalysisHeartbeat("cross-process", async () => {
      const signal = lifecycle.analysisSignal();
      await new Promise((_, reject) => {
        const keepAlive = setTimeout(() => reject(new Error("Cancellation timed out")), 2000);
        signal.addEventListener("abort", () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
      });
    }), /BOOK_ANALYSIS_CANCELLED/);
  } finally { prisma.bookAnalysis.findUnique = original; }
});

test("image cancellation watcher aborts active provider work from persisted state", async () => {
  const { watchImageCancellation } = require("../dist/services/image/generation/cancellation.js");
  const original = prisma.imageGenerationTask.findUnique;
  prisma.imageGenerationTask.findUnique = async () => ({ status: "running", cancelRequestedAt: new Date() });
  const watcher = watchImageCancellation("image-stop");
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Image cancellation timed out")), 2000);
      watcher.signal.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    assert.equal(watcher.signal.aborted, true);
  } finally {
    watcher.dispose();
    prisma.imageGenerationTask.findUnique = original;
  }
});

test("archived director tasks cannot reappear through automatic approval records", async () => {
  const { AutoDirectorFollowUpService } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.js");
  const original = prisma.autoDirectorAutoApprovalRecord.findMany;
  const originalArchives = prisma.taskCenterArchive.findMany;
  prisma.taskCenterArchive.findMany = async () => [{ taskId: "removed-task" }];
  prisma.autoDirectorAutoApprovalRecord.findMany = async () => [{ taskId: "removed-task", novelId: "book" }];
  try {
    const service = new AutoDirectorFollowUpService();
    assert.deepEqual(await service.loadAutoApprovalItems([{ id: "visible", novelId: "book" }], new Map()), []);
  } finally {
    prisma.autoDirectorAutoApprovalRecord.findMany = original;
    prisma.taskCenterArchive.findMany = originalArchives;
  }
});
