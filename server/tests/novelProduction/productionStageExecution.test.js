const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterExecutionStageRunner,
} = require("../../dist/services/novel/production/ChapterExecutionStageRunner.js");
const {
  QualityRepairStageRunner,
} = require("../../dist/services/novel/production/QualityRepairStageRunner.js");

const manualPolicy = {
  kickoffMode: "manual_start",
  advanceMode: "manual",
  reviewCheckpoints: [],
};

test("production stage: a chapter stream remains an explicit completion checkpoint", async () => {
  const stream = { stream: {}, onDone: async () => undefined };
  const runner = new ChapterExecutionStageRunner({
    getCore: () => {
      throw new Error("single chapter execution must not create a pipeline job");
    },
    getCoordinator: () => ({
      createChapterStream: async () => stream,
    }),
  });

  const result = await runner.run({
    novelId: "novel-1",
    stage: "chapter_execution",
    policy: manualPolicy,
    payload: {
      mode: "single_chapter_stream",
      chapterId: "chapter-3",
      options: { model: "test-model" },
    },
  });

  assert.equal(result.status, "checkpoint");
  assert.equal(result.nextStage, null);
  assert.equal(result.payload, stream);
  assert.deepEqual(result.execution, {
    contractVersion: 1,
    stage: "chapter_execution",
    mode: "chapter_stream",
    lifecycle: "awaiting_stream_completion",
    target: { novelId: "novel-1", chapterId: "chapter-3" },
    artifactVersion: {
      kind: "retained_chapter_content",
      contentHash: null,
      state: "not_persisted",
    },
    recovery: { action: "complete_stream_from_source_page", targetId: "chapter-3" },
    budgetOwner: { kind: "chapter_runtime", id: null },
  });
});

test("production stage: a newly queued pipeline exposes its durable resume target", async () => {
  const calls = [];
  const runner = new ChapterExecutionStageRunner({
    getCoordinator: () => {
      throw new Error("pipeline execution must not create a chapter stream");
    },
    getCore: () => ({
      findActivePipelineJobForRange: async () => null,
      createNovelSnapshot: async (...args) => calls.push(["snapshot", ...args]),
      startPipelineJob: async (...args) => {
        calls.push(["start", ...args]);
        return { id: "job-9" };
      },
      resumePipelineJob: async () => {
        throw new Error("a new job must not resume an older job");
      },
    }),
  });
  const options = { startOrder: 2, endOrder: 4 };

  const result = await runner.run({
    novelId: "novel-1",
    stage: "chapter_execution",
    policy: manualPolicy,
    payload: { mode: "pipeline_job", options },
  });

  assert.deepEqual(calls.map((call) => call[0]), ["snapshot", "start"]);
  assert.equal(result.status, "checkpoint");
  assert.equal(result.nextStage, null);
  assert.deepEqual(result.execution, {
    contractVersion: 1,
    stage: "chapter_execution",
    mode: "pipeline_job",
    lifecycle: "queued",
    target: { novelId: "novel-1", pipelineJobId: "job-9", startOrder: 2, endOrder: 4 },
    artifactVersion: {
      kind: "pipeline_job",
      contentHash: null,
      state: "owned_by_pipeline_job",
    },
    recovery: { action: "resume_pipeline_job", targetId: "job-9" },
    budgetOwner: { kind: "pipeline_job", id: "job-9" },
  });
});

test("production stage: repair stream shares the source-page completion boundary", async () => {
  const stream = { stream: {}, onDone: async () => undefined };
  const runner = new QualityRepairStageRunner({
    getCore: () => ({ replanNovel: async () => undefined }),
    getCoordinator: () => ({ createRepairStream: async () => stream }),
  });

  const result = await runner.run({
    novelId: "novel-1",
    stage: "quality_repair",
    policy: manualPolicy,
    payload: { mode: "repair_chapter_stream", chapterId: "chapter-3" },
  });

  assert.equal(result.status, "checkpoint");
  assert.equal(result.nextStage, null);
  assert.equal(result.execution?.mode, "repair_stream");
  assert.equal(result.execution?.recovery.action, "complete_stream_from_source_page");
});
