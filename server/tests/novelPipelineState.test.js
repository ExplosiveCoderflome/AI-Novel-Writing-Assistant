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

test("startPipelineJob persists maxRetries as a single repair pass", async () => {
  const original = {
    characterCount: prisma.character.count,
    generationFindMany: prisma.generationJob.findMany,
    generationCreate: prisma.generationJob.create,
    chapterAggregate: prisma.chapter.aggregate,
    chapterFindMany: prisma.chapter.findMany,
  };

  let createdInput = null;
  let capturedChapterQuery = null;
  let scheduledOptions = null;
  prisma.character.count = async () => 1;
  prisma.generationJob.findMany = async () => [];
  prisma.chapter.aggregate = async () => ({
    _min: { order: 1 },
    _max: { order: 3 },
    _count: { order: 3 },
  });
  prisma.chapter.findMany = async (input) => {
    capturedChapterQuery = input;
    return [
    { id: "chapter-1" },
    { id: "chapter-2" },
    ];
  };
  prisma.generationJob.create = async (input) => {
    createdInput = input;
    return {
      id: "job-clamped",
      status: "queued",
      progress: 0,
      completedCount: 0,
      totalCount: input.data.totalCount,
      retryCount: 0,
      maxRetries: input.data.maxRetries,
      payload: input.data.payload,
    };
  };

  const service = new NovelCorePipelineService();
  service.schedulePipelineExecution = (_jobId, _novelId, options) => {
    scheduledOptions = options;
  };

  try {
    await service.startPipelineJob("novel-1", {
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
      maxRetries: 5,
    });

    assert.equal(createdInput.data.maxRetries, 1);
    assert.equal(JSON.parse(createdInput.data.payload).maxRetries, 1);
    assert.equal(scheduledOptions.maxRetries, 1);
    const terminalContinueCondition = capturedChapterQuery.where.NOT.AND[2].OR.find((condition) => Array.isArray(condition.AND));
    assert.equal(terminalContinueCondition.AND[0].riskFlags.not, null);
    assert.equal(terminalContinueCondition.AND[1].riskFlags.contains, '"terminalAction":"defer_and_continue"');
    assert.equal(terminalContinueCondition.AND[2].riskFlags.not.contains, '"rootCauseCode":"replan_required"');
    assert.equal(terminalContinueCondition.AND[3].riskFlags.not.contains, '"recommendedAction":"replan"');
  } finally {
    prisma.character.count = original.characterCount;
    prisma.generationJob.findMany = original.generationFindMany;
    prisma.generationJob.create = original.generationCreate;
    prisma.chapter.aggregate = original.chapterAggregate;
    prisma.chapter.findMany = original.chapterFindMany;
  }
});

test("executePipeline skips chapters already marked for deferred continue when skipCompleted is enabled", async () => {
  const original = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    createQualityReport: reviewService.createQualityReport,
    emit: novelEventBus.emit,
  };

  const updates = [];
  let capturedChapterQuery = null;
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
          temperature: 0.8,
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
  prisma.chapter.findMany = async (input) => {
    capturedChapterQuery = input;
    return [
      { id: "chapter-terminal", order: 4, title: "第四章", content: "正文", chapterStatus: "pending_review" },
    ];
  };
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
    await service.executePipeline("job-terminal", "novel-1", {
      startOrder: 4,
      endOrder: 4,
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.8,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
      maxRetries: 5,
    });

    const skipConditions = capturedChapterQuery.where.NOT.AND[2].OR;
    const terminalContinueCondition = skipConditions.find((condition) => Array.isArray(condition.AND));
    assert.equal(terminalContinueCondition.AND[0].riskFlags.not, null);
    assert.equal(terminalContinueCondition.AND[1].riskFlags.contains, '"terminalAction":"defer_and_continue"');
    assert.equal(terminalContinueCondition.AND[2].riskFlags.not.contains, '"rootCauseCode":"replan_required"');
    assert.equal(terminalContinueCondition.AND[3].riskFlags.not.contains, '"recommendedAction":"replan"');
    const finalUpdate = updates[updates.length - 1];
    assert.equal(finalUpdate.data.status, "succeeded");
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    reviewService.createQualityReport = original.createQualityReport;
    novelEventBus.emit = original.emit;
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

test("decoratePipelineJob describes replan notices without completed-range wording", () => {
  const decorated = decoratePipelineJob({
    id: "job-replan",
    status: "succeeded",
    payload: JSON.stringify({
      replanAlertDetails: ["第9章需要重规划（影响章节=9,10,11；原因=缺失比武环节）"],
    }),
  });

  assert.equal(decorated.noticeCode, "PIPELINE_REPLAN_REQUIRED");
  assert.match(decorated.noticeSummary, /已执行至第 9 章，后续需重规划/);
  assert.match(decorated.noticeSummary, /第9章需要重规划/);
  assert.doesNotMatch(decorated.noticeSummary, /自动执行完成/);
});

test("executePipeline stops remaining chapters after a replan recommendation", async () => {
  const original = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    createQualityReport: reviewService.createQualityReport,
    emit: novelEventBus.emit,
  };

  const updates = [];
  const processedChapters = [];
  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: null,
        completedCount: 0,
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
  prisma.chapter.findMany = async () => [
    { id: "chapter-9", order: 9, title: "第九章", content: "", chapterStatus: "unplanned" },
    { id: "chapter-10", order: 10, title: "第十章", content: "", chapterStatus: "unplanned" },
  ];
  reviewService.createQualityReport = async () => null;
  novelEventBus.emit = async () => null;

  const service = new NovelCorePipelineService();
  service.chapterRuntimeCoordinator.runPipelineChapter = async (_novelId, chapterId) => {
    processedChapters.push(chapterId);
    return {
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
      runtimePackage: {
        replanRecommendation: {
          recommended: true,
          action: "stop_for_replan",
          affectedChapterOrders: [9, 10],
          triggerReason: "缺失比武环节",
        },
      },
    };
  };

  try {
    await service.executePipeline("job-replan-stop", "novel-1", {
      startOrder: 9,
      endOrder: 10,
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

    assert.deepEqual(processedChapters, ["chapter-9"]);
    const finalUpdate = updates[updates.length - 1];
    assert.equal(finalUpdate.data.status, "succeeded");
    assert.equal(finalUpdate.data.currentStage, null);
    const payload = JSON.parse(finalUpdate.data.payload);
    assert.deepEqual(payload.replanAlertDetails, [
      "第9章需要重规划（影响章节=9,10；原因=缺失比武环节）",
    ]);
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    reviewService.createQualityReport = original.createQualityReport;
    novelEventBus.emit = original.emit;
  }
});

test("executePipeline records local patch recommendations as quality debt and continues", async () => {
  const original = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    createQualityReport: reviewService.createQualityReport,
    emit: novelEventBus.emit,
  };

  const updates = [];
  const processedChapters = [];
  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: null,
        completedCount: 0,
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
  prisma.chapter.findMany = async () => [
    { id: "chapter-5", order: 5, title: "第五章", content: "", chapterStatus: "unplanned" },
    { id: "chapter-6", order: 6, title: "第六章", content: "", chapterStatus: "unplanned" },
  ];
  reviewService.createQualityReport = async () => null;
  novelEventBus.emit = async () => null;

  const service = new NovelCorePipelineService();
  service.chapterRuntimeCoordinator.runPipelineChapter = async (_novelId, chapterId) => {
    processedChapters.push(chapterId);
    return {
      retryCountUsed: 0,
      score: {
        coherence: 75,
        repetition: 80,
        pacing: 70,
        voice: 80,
        engagement: 78,
        overall: 73,
      },
      issues: [],
      pass: true,
      runtimePackage: chapterId === "chapter-5"
        ? {
          replanRecommendation: {
            recommended: true,
            action: "local_patch_plan",
            affectedChapterOrders: [5, 6, 7],
            triggerReason: "高优先级审计问题未解决",
          },
        }
        : null,
    };
  };

  try {
    await service.executePipeline("job-local-patch", "novel-1", {
      startOrder: 5,
      endOrder: 6,
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

    assert.deepEqual(processedChapters, ["chapter-5", "chapter-6"]);
    const finalUpdate = updates[updates.length - 1];
    assert.equal(finalUpdate.data.status, "succeeded");
    const payload = JSON.parse(finalUpdate.data.payload);
    assert.deepEqual(payload.qualityAlertDetails, [
      "第5章建议局部处理（影响章节=5,6,7；原因=高优先级审计问题未解决）",
    ]);
    assert.equal(payload.replanAlertDetails, undefined);
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    reviewService.createQualityReport = original.createQualityReport;
    novelEventBus.emit = original.emit;
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
    assert.match(finalUpdate.data.payload, /未返回可保存正文/);

    const decorated = decoratePipelineJob({
      status: "failed",
      payload: finalUpdate.data.payload,
    });
    assert.match(decorated.noticeSummary, /第3章/);
    assert.match(decorated.noticeSummary, /未返回可保存正文/);
  } finally {
    prisma.generationJob.findUnique = original.generationFindUnique;
    prisma.generationJob.update = original.generationUpdate;
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.chapter.findMany = original.chapterFindMany;
    novelEventBus.emit = original.emit;
  }
});
