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
  };
  const calls = [];

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
  }
});

test("syncAutoDirectorChapterBatchCheckpoint marks workflow completed once all repaired chapters are approved", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
  };
  const calls = [];

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
  }
});

test("syncAutoDirectorChapterBatchCheckpoint keeps repaired chapters without content as remaining work", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
  };
  const calls = [];

  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, content: "正文1", generationState: "approved", chapterStatus: "completed" },
    { id: "chapter-2", order: 2, content: null, generationState: "repaired", chapterStatus: "completed" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(data);
    return data;
  };

  try {
    const changed = await syncAutoDirectorChapterBatchCheckpoint({
      taskId: "task-repaired-without-content",
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
        lastError: "前 2 章自动执行未能全部通过质量要求。",
        finishedAt: null,
        milestonesJson: null,
      },
    });

    assert.equal(changed, true);
    assert.equal(calls.length, 1);
    const patch = calls[0];
    const resumeTarget = JSON.parse(patch.resumeTargetJson);
    const seedPayload = JSON.parse(patch.seedPayloadJson);

    assert.equal(patch.status, undefined);
    assert.equal(patch.currentItemLabel, "前 2 章自动执行已暂停");
    assert.equal(resumeTarget.chapterId, "chapter-2");
    assert.equal(seedPayload.autoExecution.remainingChapterCount, 1);
    assert.equal(seedPayload.autoExecution.nextChapterId, "chapter-2");
    assert.equal(seedPayload.autoExecution.nextChapterOrder, 2);
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
  }
});

test("syncAutoDirectorChapterBatchCheckpoint does not overwrite actively running resumed auto execution", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
  };
  const calls = [];

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
  }
});
