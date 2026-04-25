const test = require("node:test");
const assert = require("node:assert/strict");

const {
  syncAutoDirectorChapterBatchCheckpoint,
} = require("../dist/services/novel/workflow/novelWorkflowAutoDirectorReconciliation.js");
const { prisma } = require("../dist/db/prisma.js");

test("syncAutoDirectorChapterBatchCheckpoint refreshes resume target to the first remaining chapter", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "failed" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "repaired" },
    { id: "chapter-3", order: 3, generationState: "planned" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-batch-ready",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "failed",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 3 章自动执行已暂停",
        checkpointSummary: "旧摘要",
        resumeTargetJson: null,
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 3,
            totalChapterCount: 3,
            pipelineJobId: "job-1",
            pipelineStatus: "failed",
          },
        }),
        lastError: "前 10 章自动执行未能全部通过质量要求。",
        finishedAt: new Date("2026-04-04T10:00:00.000Z"),
        milestonesJson: null,
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    const patch = calls[0];
    const resumeTarget = JSON.parse(patch.resumeTargetJson);
    const seedPayload = JSON.parse(patch.seedPayloadJson);

    assert.equal(resumeTarget.chapterId, "chapter-2");
    assert.equal(patch.currentItemLabel, "前 3 章自动执行已暂停");
    assert.match(patch.checkpointSummary, /当前仍有 2 章待继续/);
    assert.equal(seedPayload.autoExecution.remainingChapterCount, 2);
    assert.equal(seedPayload.autoExecution.nextChapterId, "chapter-2");
    assert.equal(seedPayload.autoExecution.nextChapterOrder, 2);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint marks workflow completed once all repaired chapters are approved", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "failed" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "published" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-finished",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "failed",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 2 章自动执行已暂停",
        checkpointSummary: "旧摘要",
        resumeTargetJson: null,
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            pipelineJobId: "job-2",
            pipelineStatus: "failed",
          },
        }),
        lastError: "前 10 章自动执行未能全部通过质量要求。",
        finishedAt: null,
        milestonesJson: null,
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    const patch = calls[0];
    const seedPayload = JSON.parse(patch.seedPayloadJson);

    assert.equal(patch.status, "succeeded");
    assert.equal(patch.checkpointType, "workflow_completed");
    assert.equal(patch.currentItemLabel, "前 2 章自动执行完成");
    assert.equal(seedPayload.autoExecution.remainingChapterCount, 0);
    assert.equal(seedPayload.autoExecution.nextChapterId, null);
    assert.equal(patch.lastError, null);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint does not overwrite actively running resumed auto execution", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "running" });
  prisma.chapter.findMany = async () => {
    calls.push("chapterFindMany");
    return [
      { id: "chapter-1", order: 1, generationState: "reviewed" },
      { id: "chapter-2", order: 2, generationState: "planned" },
    ];
  };
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-running-batch",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "running",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "正在自动执行前 2 章",
        checkpointSummary: "旧摘要",
        resumeTargetJson: null,
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            pipelineJobId: "job-running",
            pipelineStatus: "running",
          },
        }),
        lastError: null,
        finishedAt: null,
        milestonesJson: null,
      },
    });

    assert.equal(changed, false);
    assert.deepEqual(calls, []);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint ignores a persisted pipeline job that belongs to another novel", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "running", novelId: "novel-foreign" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "planned" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-foreign-job",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "running",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 2 章自动执行已暂停",
        checkpointSummary: "旧摘要",
        resumeTargetJson: null,
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            pipelineJobId: "job-foreign",
            pipelineStatus: "running",
          },
        }),
        lastError: "旧错误",
        finishedAt: new Date("2026-04-04T10:00:00.000Z"),
        milestonesJson: null,
        progress: 0.1,
        currentStage: "章节执行",
        currentItemKey: "chapter_execution",
        cancelRequestedAt: new Date("2026-04-04T10:05:00.000Z"),
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "waiting_approval");
    assert.equal(JSON.parse(calls[0].seedPayloadJson).autoExecution.pipelineJobId, null);
    assert.equal(JSON.parse(calls[0].seedPayloadJson).autoExecution.pipelineStatus, null);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint preserves the specific pause reason after lastError has been cleared", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "failed" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "planned" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-preserve-reason",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "waiting_approval",
        progress: 0.98,
        currentStage: "质量修复",
        currentItemKey: "quality_repair",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 2 章自动执行已暂停",
        checkpointSummary: "前 2 章已进入自动执行，但当前批量任务未完全完成：以下章节未达到质量阈值：第 1 章 当前仍有 1 章待继续，建议从第 2 章继续。",
        resumeTargetJson: JSON.stringify({
          route: "/novels/:id/edit",
          novelId: "novel-1",
          taskId: "task-preserve-reason",
          stage: "pipeline",
          chapterId: "chapter-2",
          volumeId: null,
        }),
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            mode: "front10",
            scopeLabel: "前 2 章",
            volumeTitle: null,
            preparedVolumeIds: [],
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            completedChapterCount: 1,
            remainingChapterCount: 1,
            remainingChapterIds: ["chapter-2"],
            remainingChapterOrders: [2],
            nextChapterId: "chapter-2",
            nextChapterOrder: 2,
            pipelineJobId: "job-failed",
            pipelineStatus: "failed",
          },
        }),
        lastError: null,
        finishedAt: null,
        cancelRequestedAt: null,
        milestonesJson: null,
      },
    });

    assert.equal(changed, false);
    assert.equal(calls.length, 0);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint refreshes progress even when the paused reason is already preserved", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  prisma.generationJob.findUnique = async () => ({ status: "failed", novelId: "novel-1" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "approved" },
    { id: "chapter-3", order: 3, generationState: "planned" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-refresh-progress",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "waiting_approval",
        progress: 0.98,
        currentStage: "质量修复",
        currentItemKey: "quality_repair",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 3 章自动执行已暂停",
        checkpointSummary: "前 3 章已进入自动执行，但当前批量任务未完全完成：以下章节未达到质量阈值：第 1 章 当前仍有 1 章待继续，建议从第 2 章继续。",
        resumeTargetJson: JSON.stringify({
          route: "/novels/novel-1/edit",
          mode: "workflow",
          stage: "pipeline",
          novelId: "novel-1",
          taskId: "task-refresh-progress",
          chapterId: "chapter-2",
          volumeId: null,
        }),
        seedPayloadJson: JSON.stringify({
          autoExecution: {
            enabled: true,
            firstChapterId: "chapter-1",
            startOrder: 1,
            endOrder: 3,
            totalChapterCount: 3,
            pipelineJobId: "job-failed",
            pipelineStatus: "failed",
            remainingChapterCount: 1,
            nextChapterId: "chapter-2",
            nextChapterOrder: 2,
          },
        }),
        lastError: null,
        finishedAt: null,
        cancelRequestedAt: null,
        milestonesJson: null,
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].resumeTargetJson).chapterId, "chapter-3");
    assert.equal(JSON.parse(calls[0].seedPayloadJson).autoExecution.remainingChapterCount, 1);
    assert.equal(JSON.parse(calls[0].seedPayloadJson).autoExecution.nextChapterId, "chapter-3");
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint heals stale running auto execution when only task status fields are stale", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationJobFindUnique: prisma.generationJob.findUnique,
  };
  const calls = [];

  const healedSeedPayloadJson = JSON.stringify({
    autoExecution: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: "job-succeeded",
      pipelineStatus: "succeeded",
      remainingChapterCount: 1,
      nextChapterId: "chapter-2",
      nextChapterOrder: 2,
    },
  });
  const healedSummary = "前 2 章已进入自动执行，但当前批量任务未完全完成：旧错误 当前仍有 1 章待继续，建议从第 2 章继续。";

  prisma.generationJob.findUnique = async () => ({ status: "succeeded" });
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "planned" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-running-terminal",
      row: {
        title: "示例项目",
        novelId: "novel-1",
        status: "running",
        checkpointType: "chapter_batch_ready",
        currentItemLabel: "前 2 章自动执行已暂停",
        checkpointSummary: healedSummary,
        resumeTargetJson: JSON.stringify({
          route: "/novels/novel-1/edit",
          mode: "workflow",
          stage: "pipeline",
          novelId: "novel-1",
          taskId: "task-running-terminal",
          chapterId: "chapter-2",
          volumeId: null,
        }),
        seedPayloadJson: healedSeedPayloadJson,
        lastError: "旧错误",
        finishedAt: new Date("2026-04-04T10:00:00.000Z"),
        milestonesJson: null,
        progress: 0.1,
        currentStage: "章节执行",
        currentItemKey: "chapter_execution",
        cancelRequestedAt: new Date("2026-04-04T10:05:00.000Z"),
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "waiting_approval");
    assert.equal(calls[0].checkpointType, "chapter_batch_ready");
    assert.equal(calls[0].finishedAt, null);
    assert.equal(calls[0].lastError, null);
    assert.equal(calls[0].progress, 0.98);
    assert.equal(calls[0].checkpointSummary, healedSummary);
    assert.equal(JSON.parse(calls[0].seedPayloadJson).autoExecution.pipelineStatus, "succeeded");
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
  }
});
