const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

test("markTaskRunning does not revive cancelled auto director tasks", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let updateCalled = false;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_cancelled",
    lane: "auto_director",
    novelId: "novel_demo",
    status: "cancelled",
    progress: 0.82,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_detail_bundle",
    currentItemLabel: "正在细化第 4/10 章",
    checkpointType: null,
    checkpointSummary: null,
    seedPayloadJson: null,
    cancelRequestedAt: new Date("2026-04-14T03:00:00.000Z"),
    startedAt: new Date("2026-04-14T02:00:00.000Z"),
  });
  prisma.novelWorkflowTask.update = async () => {
    updateCalled = true;
    throw new Error("update should not be called");
  };

  try {
    const service = new NovelWorkflowService();
    await assert.rejects(
      service.markTaskRunning("task_cancelled", {
        stage: "structured_outline",
        itemKey: "chapter_detail_bundle",
        itemLabel: "正在细化第 5/10 章",
        progress: 0.9,
      }),
      (error) => error?.message === "WORKFLOW_TASK_CANCELLED",
    );
    assert.equal(updateCalled, false);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState skips cancelled tasks instead of restoring them", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let updateCalled = false;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_cancelled_heal",
    lane: "auto_director",
    novelId: "novel_demo",
    status: "cancelled",
    progress: 0.68,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在生成第 1 卷章节列表",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    seedPayloadJson: null,
    heartbeatAt: new Date("2026-04-14T03:00:00.000Z"),
    finishedAt: new Date("2026-04-14T03:00:05.000Z"),
    milestonesJson: null,
    lastError: null,
    cancelRequestedAt: new Date("2026-04-14T03:00:00.000Z"),
  });
  prisma.novelWorkflowTask.update = async () => {
    updateCalled = true;
    throw new Error("update should not be called");
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_cancelled_heal");
    assert.equal(healed, false);
    assert.equal(updateCalled, false);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});
