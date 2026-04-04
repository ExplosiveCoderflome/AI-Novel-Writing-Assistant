const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

test("healHistoricalAutoDirectorRecoveryFailure restores legacy restart failures back to checkpoint state", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_front10",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.93,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "正在自动执行前 10 章",
    checkpointType: "front10_ready",
    checkpointSummary: "《示例》已生成第 1 卷节奏板，并准备好前 10 章细化。",
    resumeTargetJson: null,
    lastError: "服务重启后恢复失败：当前导演产物已经完整，无需继续自动导演。",
    finishedAt: new Date("2026-04-03T11:55:37.000Z"),
    heartbeatAt: new Date("2026-04-03T11:55:37.000Z"),
    cancelRequestedAt: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;

  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status,
      progress: data.progress,
      currentStage: data.currentStage,
      currentItemKey: data.currentItemKey,
      currentItemLabel: data.currentItemLabel,
      resumeTargetJson: data.resumeTargetJson,
      lastError: data.lastError,
      finishedAt: data.finishedAt,
      heartbeatAt: data.heartbeatAt,
      cancelRequestedAt: data.cancelRequestedAt,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healHistoricalAutoDirectorRecoveryFailure("task_front10");
    assert.equal(healed, true);

    assert.equal(currentRow.status, "waiting_approval");
    assert.equal(currentRow.currentStage, "章节执行");
    assert.equal(currentRow.currentItemLabel, "前 10 章已可进入章节执行");
    assert.equal(currentRow.lastError, null);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState also reconciles chapter batch checkpoints when task detail loads without a preloaded row", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_batch_ready",
    title: "示例项目",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.98,
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    currentItemLabel: "前 3 章自动执行已暂停",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "旧摘要",
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        enabled: true,
        firstChapterId: "chapter-1",
        startOrder: 1,
        endOrder: 3,
        totalChapterCount: 3,
        pipelineJobId: "job-3",
        pipelineStatus: "failed",
      },
    }),
    lastError: "前 10 章自动执行未能全部通过质量要求。",
    finishedAt: new Date("2026-04-04T10:00:00.000Z"),
    heartbeatAt: new Date("2026-04-04T10:00:00.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "reviewed" },
    { id: "chapter-3", order: 3, generationState: "approved" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      currentStage: data.currentStage ?? currentRow.currentStage,
      currentItemKey: data.currentItemKey ?? currentRow.currentItemKey,
      currentItemLabel: data.currentItemLabel ?? currentRow.currentItemLabel,
      checkpointType: data.checkpointType ?? currentRow.checkpointType,
      checkpointSummary: data.checkpointSummary ?? currentRow.checkpointSummary,
      resumeTargetJson: data.resumeTargetJson ?? currentRow.resumeTargetJson,
      seedPayloadJson: data.seedPayloadJson ?? currentRow.seedPayloadJson,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      status: data.status ?? currentRow.status,
      progress: data.progress ?? currentRow.progress,
      finishedAt: data.finishedAt ?? currentRow.finishedAt,
      cancelRequestedAt: data.cancelRequestedAt ?? currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
      milestonesJson: data.milestonesJson ?? currentRow.milestonesJson,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_batch_ready");

    assert.equal(healed, true);
    assert.match(currentRow.checkpointSummary, /当前仍有 1 章待继续/);
    assert.equal(JSON.parse(currentRow.resumeTargetJson).chapterId, "chapter-2");
    assert.equal(JSON.parse(currentRow.seedPayloadJson).autoExecution.remainingChapterCount, 1);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.update;
  }
});
