const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma");
const {
  DirectorStateReader,
} = require("../dist/services/novel/director/state/DirectorStateReader.js");

test("DirectorStateReader suppresses stale active step while task is waiting at checkpoint", async () => {
  const originals = {
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    stepFindFirst: prisma.directorStepRun.findFirst,
  };
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    status: "waiting_approval",
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    currentItemLabel: "等待处理重规划建议",
    progress: 0.98,
    checkpointType: "replan_required",
    checkpointSummary: "第 3 章需要重规划。",
    lastError: null,
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    seedPayloadJson: null,
  });
  prisma.directorRun.findUnique = async () => ({
    id: "run-1",
    novelId: "novel-1",
    entrypoint: "resume_from_checkpoint",
  });
  prisma.directorRunCommand.findFirst = async () => ({
    id: "command-1",
    commandType: "continue",
    status: "succeeded",
  });
  prisma.directorStepRun.findFirst = async () => ({
    idempotencyKey: "task-1:chapter_execution_node",
    nodeKey: "chapter_execution_node",
    label: "章节执行",
    status: "running",
  });

  try {
    const reader = new DirectorStateReader({
      inspectNovel: async () => null,
    });
    const state = await reader.readByTaskId("task-1");

    assert.equal(state.activeStep, null);
    assert.equal(state.runtime.currentStep, "quality_repair");
    assert.equal(state.runtime.status, "waiting_approval");
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorStepRun.findFirst = originals.stepFindFirst;
  }
});
