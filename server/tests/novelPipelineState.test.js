const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { novelEventBus } = require("../dist/events/index.js");
const reviewService = require("../dist/services/novel/novelCoreReviewService.js");
const { NovelCorePipelineService } = require("../dist/services/novel/novelCorePipelineService.js");
const { ChapterEmptyContentError } = require("../dist/services/novel/runtime/chapterEmptyContentError.js");
const { decoratePipelineJob } = require("../dist/services/novel/pipelineJobState.js");

test("listRecoverablePipelineJobs excludes cancellation-pending jobs", async () => {
  const originalFindMany = prisma.generationJob.findMany;
  let capturedInput = null;

  prisma.generationJob.findMany = async (input) => {
    capturedInput = input;
    return [];
  };

  try {
    const service = new NovelCorePipelineService();
    await service.listRecoverablePipelineJobs();
    assert.equal(capturedInput.where.cancelRequestedAt, null);
  } finally {
    prisma.generationJob.findMany = originalFindMany;
  }
});

test("retryPipelineJob rejects jobs that are still cancelling", async () => {
  const originalFindUnique = prisma.generationJob.findUnique;

  prisma.generationJob.findUnique = async () => ({
    id: "job-1",
    status: "cancelled",
    cancelRequestedAt: new Date("2026-04-03T09:00:00+08:00"),
    finishedAt: null,
  });

  try {
    const service = new NovelCorePipelineService();
    await assert.rejects(
      () => service.retryPipelineJob("job-1"),
      /任务仍在取消中/,
    );
  } finally {
    prisma.generationJob.findUnique = originalFindUnique;
  }
});

test("executePipeline preserves persisted quality alerts across resume", async () => {
  const original = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    createQualityReport: reviewService.createQualityReport,
    emit: novelEventBus.emit,
  };

  const updates = [];
  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: new Date("2026-04-03T09:00:00+08:00"),
        completedCount: 1,
        totalCount: 2,
        retryCount: 0,
        payload: JSON.stringify({
          provider: "deepseek",
          model: "deepseek-chat",
          temperature: 0.8,
          runMode: "fast",
          autoReview: true,
          autoRepair: true,
          skipCompleted: true,
          qualityThreshold: 75,
          repairMode: "light_repair",
          failedDetails: ["1章（coherence=60, repetition=10, engagement=70）"],
        }),
      };
    }
    if (input.select?.status) {
      return {
        status: "running",
        cancelRequestedAt: null,
      };
    }
    throw new Error(`Unexpected generationJob.findUnique call: ${JSON.stringify(input)}`);
  };
  prisma.generationJob.update = async (input) => {
    updates.push(input);
    return input;
  };
  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "测试小说",
  });
  prisma.chapter.findMany = async () => ([
    { id: "chapter-1", order: 1, title: "第一章", content: "已生成内容" },
    { id: "chapter-2", order: 2, title: "第二章", content: "" },
  ]);
  reviewService.createQualityReport = async () => null;
  novelEventBus.emit = async () => null;

  const service = new NovelCorePipelineService();
  service.chapterRuntimeCoordinator.runPipelineChapter = async () => ({
    retryCountUsed: 0,
    score: {
      coherence: 88,
      repetition: 88,
      pacing: 82,
      voice: 80,
      engagement: 86,
      overall: 84,
    },
    issues: [],
    pass: true,
  });

  try {
    await service.executePipeline("job-1", "novel-1", {
      startOrder: 1,
      endOrder: 2,
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.8,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
      maxRetries: 2,
    });

    const finalUpdate = updates[updates.length - 1];
    assert.equal(finalUpdate.data.status, "succeeded");
    assert.equal(finalUpdate.data.error, null);
    assert.match(finalUpdate.data.payload, /qualityAlertDetails/);
    assert.match(finalUpdate.data.payload, /1章/);
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    reviewService.createQualityReport = original.createQualityReport;
    novelEventBus.emit = original.emit;
  }
});

test("executePipeline records empty chapter output in failed job notice payload", async () => {
  const original = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    emit: novelEventBus.emit,
  };

  const updates = [];
  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: null,
        completedCount: 0,
        totalCount: 1,
        retryCount: 0,
        payload: JSON.stringify({
          provider: "deepseek",
          model: "deepseek-chat",
          runMode: "fast",
          autoReview: true,
          autoRepair: true,
          skipCompleted: true,
          qualityThreshold: 75,
          repairMode: "light_repair",
        }),
      };
    }
    if (input.select?.status) {
      return {
        status: "running",
        cancelRequestedAt: null,
      };
    }
    throw new Error(`Unexpected generationJob.findUnique call: ${JSON.stringify(input)}`);
  };
  prisma.generationJob.update = async (input) => {
    updates.push(input);
    return input;
  };
  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "测试小说",
  });
  prisma.chapter.findMany = async () => ([
    { id: "chapter-empty", order: 3, title: "第三章", content: "" },
  ]);
  novelEventBus.emit = async () => null;

  const service = new NovelCorePipelineService();
  service.chapterRuntimeCoordinator.runPipelineChapter = async (_novelId, _chapterId, _options, hooks) => {
    const error = new ChapterEmptyContentError({
      novelId: "novel-1",
      chapterId: "chapter-empty",
      chapterOrder: 3,
      source: "pipeline_chapter_writer",
      rawLength: 0,
      trimmedLength: 0,
    });
    await hooks.onEmptyContent({
      attempt: 1,
      willRetry: true,
      error,
      contentLength: 0,
      rawContentLength: 0,
    });
    await hooks.onEmptyContent({
      attempt: 2,
      willRetry: false,
      error,
      contentLength: 0,
      rawContentLength: 0,
    });
    throw error;
  };

  try {
    await service.executePipeline("job-empty", "novel-1", {
      startOrder: 3,
      endOrder: 3,
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.8,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
      maxRetries: 1,
    });

    const finalUpdate = updates[updates.length - 1];
    assert.equal(finalUpdate.data.status, "failed");
    assert.equal(finalUpdate.data.completedCount, undefined);
    assert.match(finalUpdate.data.payload, /qualityAlertDetails/);
    assert.match(finalUpdate.data.payload, /第3章/);
    assert.match(finalUpdate.data.payload, /未返回正文/);

    const decorated = decoratePipelineJob({
      status: "failed",
      payload: finalUpdate.data.payload,
    });
    assert.match(decorated.noticeSummary, /第3章/);
    assert.match(decorated.noticeSummary, /未返回正文/);
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    novelEventBus.emit = original.emit;
  }
});
