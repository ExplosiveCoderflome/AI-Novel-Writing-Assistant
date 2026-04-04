const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorAutoExecutionRuntime,
} = require("../dist/services/novel/director/novelDirectorAutoExecutionRuntime.js");

function buildRequest() {
  return {
    idea: "一个普通人被卷入命运谜局",
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
      progressionLoop: "调查推进、反噬升级、关系重排",
      whyItFits: "适合自动导演快速启动",
      toneKeywords: ["悬疑", "压迫感"],
      targetChapterCount: 80,
    },
    runMode: "auto_to_execution",
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

  assert.deepEqual(calls, [
    ["bootstrapTask", 0],
    ["recordCheckpoint", "task-auto-exec", "workflow_completed", "前 2 章自动执行完成", 0],
  ]);
});
