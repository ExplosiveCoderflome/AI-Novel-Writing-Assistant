const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorAutoExecutionRuntime,
} = require("../dist/services/novel/director/novelDirectorAutoExecutionRuntime.js");

function buildRequest(overrides = {}) {
  return {
    idea: "一个普通人被卷入命运迷局",
    candidate: {
      id: "candidate-1",
      workingTitle: "命运谜局",
      titleOptions: [],
      logline: "一个普通人误入更大的秘密链条。",
      positioning: "都市悬疑成长",
      sellingPoint: "强钩子与高压追更感",
      coreConflict: "主角必须在真相与自保之间抉择",
      protagonistPath: "从被动卷入到主动破局",
      endingDirection: "主角以代价换来新秩序",
      hookStrategy: "用反常事件做开局钩子",
      progressionLoop: "调查推进、反噬升级、关系重组",
      whyItFits: "适合自动导演快速启动",
      toneKeywords: ["悬疑", "压迫感"],
      targetChapterCount: 80,
    },
    runMode: "auto_to_execution",
    ...overrides,
  };
}

test("runFromReady completes immediately when repaired chapters leave no remaining auto-execution work", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "approved" },
          { id: "chapter-2", order: 2, generationState: "published" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        throw new Error("should not start a new pipeline job");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        throw new Error("should not inspect a pipeline job");
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.remainingChapterCount]);
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.itemLabel,
          input.seedPayload.autoExecution.remainingChapterCount,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: "job-failed",
      pipelineStatus: "failed",
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["bootstrapTask", 0]);
  assert.deepEqual(calls[1].slice(0, 3), ["recordCheckpoint", "task-auto-exec", "workflow_completed"]);
  assert.match(String(calls[1][3]), /前 ?2 章自动执行完成/);
  assert.equal(calls[1][4], 0);
});

test("runFromReady reuses an existing active range job before starting a new pipeline", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "draft" },
          { id: "chapter-2", order: 2, generationState: "draft" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        throw new Error("should not start a new pipeline job");
      },
      async findActivePipelineJobForRange(novelId, startOrder, endOrder, preferredJobId) {
        calls.push(["findActivePipelineJobForRange", novelId, startOrder, endOrder, preferredJobId]);
        return { id: "job-active", status: "running" };
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        if (jobId === "job-active") {
          return {
            id: "job-active",
            status: "succeeded",
            progress: 1,
            currentStage: null,
            currentItemLabel: null,
            error: null,
          };
        }
        return null;
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineJobId, input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push(["recordCheckpoint", taskId, input.seedPayload.autoExecution.pipelineJobId, input.seedPayload.autoExecution.pipelineStatus]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: "job-stale",
      pipelineStatus: "queued",
    },
    existingPipelineJobId: "job-stale",
  });

  assert.deepEqual(calls, [
    ["bootstrapTask", "job-stale", "running"],
    ["getPipelineJobById", "job-stale"],
    ["findActivePipelineJobForRange", "novel-1", 1, 2, null],
    ["bootstrapTask", "job-active", "running"],
    ["getPipelineJobById", "job-active"],
    ["recordCheckpoint", "task-auto-exec", "job-active", "succeeded"],
  ]);
});

test("runFromReady records a normal checkpoint when pipeline completes with quality notices", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "planned" },
          { id: "chapter-2", order: 2, generationState: "planned" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        return { id: "job-quality", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: "job-quality",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: "以下章节未达到质量阈值：第 1 章",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.checkpointSummary,
          input.seedPayload.autoExecution.pipelineStatus,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.equal(calls.length, 7);
  assert.deepEqual(calls[0], ["bootstrapTask", "queued"]);
  assert.deepEqual(calls[1], ["markTaskRunning"]);
  assert.deepEqual(calls[2], ["startPipelineJob"]);
  assert.deepEqual(calls[3], ["bootstrapTask", "queued"]);
  assert.deepEqual(calls[4], ["getPipelineJobById", "job-quality"]);
  assert.equal(calls[5][0], "recordCheckpoint");
  assert.equal(calls[5][1], "task-auto-exec");
  assert.equal(calls[5][2], "chapter_batch_ready");
  assert.ok(String(calls[5][3]).length > 0);
  assert.equal(calls[5][4], "succeeded");
  assert.deepEqual(calls[6], ["bootstrapTask", "succeeded"]);
});

test("runFromReady records replan_required when pipeline completes with replan notice", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "planned" },
          { id: "chapter-2", order: 2, generationState: "planned" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        return { id: "job-replan", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: "job-replan",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeCode: "PIPELINE_REPLAN_REQUIRED",
          noticeSummary: "State-driven replan is required before continuing: 第2章需要重规划",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.itemLabel,
          input.checkpointSummary,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.equal(calls[5][0], "recordCheckpoint");
  assert.equal(calls[5][2], "replan_required");
  assert.match(String(calls[5][3]), /等待处理重规划建议/);
  assert.match(String(calls[5][4]), /replan/i);
});

test("runFromReady uses the latest auto-execution review toggles instead of stale saved state when starting a new batch", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "planned" },
          { id: "chapter-2", order: 2, generationState: "planned" },
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.autoReview, options.autoRepair]);
        return { id: "job-no-review", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: jobId,
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: null,
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push([
          "bootstrapTask",
          input.seedPayload.autoExecution?.autoReview ?? null,
          input.seedPayload.autoExecution?.autoRepair ?? null,
        ]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.seedPayload.autoExecution?.autoReview ?? null,
          input.seedPayload.autoExecution?.autoRepair ?? null,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest({
      autoExecutionPlan: {
        mode: "front10",
        autoReview: false,
        autoRepair: false,
      },
    }),
    existingState: {
      enabled: true,
      mode: "front10",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      autoReview: true,
      autoRepair: true,
      pipelineJobId: "old-job",
      pipelineStatus: "succeeded",
    },
  });

  assert.deepEqual(calls[0], ["bootstrapTask", false, false]);
  assert.deepEqual(calls[1], ["markTaskRunning"]);
  assert.deepEqual(calls[2], ["startPipelineJob", false, false]);
  assert.deepEqual(calls[3], ["bootstrapTask", false, false]);
  assert.deepEqual(calls[4], ["getPipelineJobById", "job-no-review"]);
  assert.deepEqual(calls[5], ["recordCheckpoint", "task-auto-exec", false, false]);
});

test("runFromReady skips the current review-blocked chapter when continuing explicit auto execution", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "reviewed", chapterStatus: "needs_repair" },
          { id: "chapter-2", order: 2, generationState: "planned" },
          { id: "chapter-3", order: 3, generationState: "planned" },
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push([
          "startPipelineJob",
          options.startOrder,
          options.endOrder,
        ]);
        return { id: "job-skip-review", status: "queued" };
      },
      async findActivePipelineJobForRange(_novelId, startOrder, endOrder, preferredJobId) {
        calls.push(["findActivePipelineJobForRange", startOrder, endOrder, preferredJobId]);
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: jobId,
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: null,
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push([
          "bootstrapTask",
          input.seedPayload.autoExecution?.nextChapterOrder ?? null,
          input.seedPayload.autoExecution?.skippedChapterOrders ?? [],
        ]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.seedPayload.autoExecution?.skippedChapterOrders ?? [],
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      mode: "front10",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 3,
      totalChapterCount: 3,
      nextChapterId: "chapter-1",
      nextChapterOrder: 1,
      pipelineJobId: "job-failed",
      pipelineStatus: "failed",
    },
    previousFailureMessage: "Chapter generation is blocked until review is resolved. 4 pending state proposal(s)",
    allowSkipReviewBlockedChapter: true,
  });

  assert.deepEqual(calls[0], ["bootstrapTask", 2, [1]]);
  assert.deepEqual(calls[1], ["findActivePipelineJobForRange", 2, 3, null]);
  assert.deepEqual(calls[2], ["markTaskRunning"]);
  assert.deepEqual(calls[3], ["startPipelineJob", 2, 3]);
  assert.deepEqual(calls[4], ["bootstrapTask", 2, [1]]);
  assert.deepEqual(calls[5], ["getPipelineJobById", "job-skip-review"]);
  assert.deepEqual(calls[6], ["recordCheckpoint", "task-auto-exec", [1]]);
});
