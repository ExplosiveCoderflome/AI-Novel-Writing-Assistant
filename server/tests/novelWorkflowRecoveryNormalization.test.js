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
