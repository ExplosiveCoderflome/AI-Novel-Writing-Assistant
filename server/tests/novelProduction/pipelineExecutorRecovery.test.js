const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../../dist/db/prisma.js");
const { novelEventBus } = require("../../dist/events/index.js");
const {
  ChapterContentPersistenceError,
} = require("../../dist/services/novel/runtime/lifecycle/ChapterLifecycleService.js");
const {
  NovelPipelineExecutor,
} = require("../../dist/services/novel/production/NovelPipelineExecutor.js");

function createExecutorHarness({
  used = 0,
  usedError = null,
  executionOwner = null,
  currentExecutionOwner = executionOwner,
  cancelAfterChapter = false,
  executeOptions = options,
  runChapter,
}) {
  const originals = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    generationUpdateMany: prisma.generationJob.updateMany,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    emit: novelEventBus.emit,
  };
  const updates = [];
  const claims = [];
  let chapterCalls = 0;
  let receivedMaxRetries = null;
  const jobState = {
    status: "running",
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    executionOwner: currentExecutionOwner,
    executionLeaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
  };

  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: null,
        completedCount: 0,
        totalCount: 1,
        retryCount: used,
        payload: JSON.stringify({
          provider: "deepseek",
          model: "deepseek-chat",
          maxRetries: 1,
          runMode: "fast",
          autoReview: true,
          autoRepair: true,
          skipCompleted: true,
          qualityThreshold: 75,
          repairMode: "light_repair",
          controlPolicy: { advanceMode: "full_book_autopilot" },
        }),
      };
    }
    if (input.select?.status) {
      return { ...jobState };
    }
    throw new Error(`Unexpected generationJob lookup: ${JSON.stringify(input)}`);
  };
  prisma.generationJob.update = async (input) => {
    updates.push(input);
    Object.assign(jobState, input.data);
    return input;
  };
  prisma.generationJob.updateMany = async (input) => {
    if (input.where.executionOwner) {
      assert.ok(input.where.executionLeaseExpiresAt?.gt instanceof Date);
    }
    if (input.where.executionOwner && input.where.executionOwner !== currentExecutionOwner) {
      return { count: 0 };
    }
    if (input.where.status?.in && !input.where.status.in.includes(jobState.status)) {
      return { count: 0 };
    }
    if (input.where.pendingManualRecovery !== undefined
      && input.where.pendingManualRecovery !== jobState.pendingManualRecovery) {
      return { count: 0 };
    }
    if (input.where.cancelRequestedAt === null && jobState.cancelRequestedAt !== null) {
      return { count: 0 };
    }
    if (input.where.OR) {
      const cancellationMatches = input.where.OR.some((condition) => (
        condition.status === jobState.status
        || (condition.cancelRequestedAt?.not === null && jobState.cancelRequestedAt !== null)
      ));
      if (!cancellationMatches) return { count: 0 };
    }
    updates.push(input);
    Object.assign(jobState, input.data);
    return { count: 1 };
  };
  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "测试小说",
    estimatedChapterCount: 1,
  });
  prisma.chapter.findMany = async () => [{
    id: "chapter-1",
    order: 1,
    title: "第一章",
    content: "已保存草稿",
  }];
  novelEventBus.emit = async () => undefined;

  const attempts = {
    async used() {
      if (usedError) throw usedError;
      return used;
    },
    async claim(_jobId, _chapterId, kind) {
      claims.push(kind);
      return claims.length === 1;
    },
  };
  const executor = new NovelPipelineExecutor({
    async runPipelineChapter(_novelId, _chapterId, options, hooks) {
      chapterCalls += 1;
      receivedMaxRetries = options.maxRetries;
      const result = await runChapter({ hooks, chapterCalls });
      if (cancelAfterChapter) {
        jobState.status = "cancelled";
        jobState.cancelRequestedAt = new Date();
      }
      return result;
    },
  }, attempts);

  return {
    execute: () => executor.execute("job-1", "novel-1", executeOptions, executionOwner || undefined),
    updates,
    claims,
    get chapterCalls() { return chapterCalls; },
    get receivedMaxRetries() { return receivedMaxRetries; },
    get jobState() { return jobState; },
    restore() {
      prisma.generationJob.findUnique = originals.generationFindUnique;
      prisma.generationJob.update = originals.generationUpdate;
      prisma.generationJob.updateMany = originals.generationUpdateMany;
      prisma.novel.findUnique = originals.novelFindUnique;
      prisma.chapter.findMany = originals.chapterFindMany;
      novelEventBus.emit = originals.emit;
    },
  };
}

const options = {
  startOrder: 1,
  endOrder: 1,
  provider: "deepseek",
  model: "deepseek-chat",
  temperature: 0.7,
  maxRetries: 1,
  runMode: "fast",
  autoReview: true,
  autoRepair: true,
  skipCompleted: true,
  qualityThreshold: 75,
  repairMode: "light_repair",
  controlPolicy: { advanceMode: "full_book_autopilot" },
};

test("pipeline recovery gives an already-reserved chapter no second automatic attempt", async () => {
  const harness = createExecutorHarness({
    used: 1,
    runChapter: async () => { throw new Error("repair interrupted"); },
  });
  try {
    await harness.execute();

    assert.equal(harness.chapterCalls, 1);
    assert.equal(harness.receivedMaxRetries, 0);
    assert.deepEqual(harness.claims, []);
    assert.equal(harness.updates.at(-1).data.status, "failed");
  } finally {
    harness.restore();
  }
});

test("pipeline does not add an outer retry after repair reserved its attempt and failed", async () => {
  const harness = createExecutorHarness({
    used: 0,
    runChapter: async ({ hooks }) => {
      assert.equal(await hooks.onRetryConsumed(), true);
      throw new Error("repair provider disconnected");
    },
  });
  try {
    await harness.execute();

    assert.equal(harness.chapterCalls, 1);
    assert.deepEqual(harness.claims, ["quality_repair"]);
    assert.equal(harness.updates.at(-1).data.status, "failed");
  } finally {
    harness.restore();
  }
});

test("pipeline stops before chapter model work when attempt persistence cannot be read", async () => {
  const harness = createExecutorHarness({
    usedError: new ChapterContentPersistenceError("chapter-1", "无法读取章节自动处理额度，请检查数据库迁移和连接。"),
    runChapter: async () => { throw new Error("must not run"); },
  });
  try {
    await harness.execute();

    assert.equal(harness.chapterCalls, 0);
    assert.deepEqual(harness.claims, []);
    assert.equal(harness.updates.at(-1).data.status, "failed");
    assert.match(harness.updates.at(-1).data.error, /数据库迁移和连接/);
  } finally {
    harness.restore();
  }
});

test("pipeline lease: an old execution owner stops before chapter model work and cannot fail the job", async () => {
  const harness = createExecutorHarness({
    executionOwner: "owner-old",
    currentExecutionOwner: "owner-new",
    runChapter: async () => { throw new Error("must not run"); },
  });
  try {
    await harness.execute();

    assert.equal(harness.chapterCalls, 0);
    assert.deepEqual(harness.updates, []);
  } finally {
    harness.restore();
  }
});

test("pipeline lease: the active owner can still publish a successful terminal state", async () => {
  const harness = createExecutorHarness({
    executionOwner: "owner-a",
    executeOptions: { ...options, autoReview: false },
    runChapter: async () => ({
      reviewExecuted: false,
      pass: true,
      score: { overall: 100 },
      issues: [],
      runtimePackage: null,
      retryCountUsed: 0,
    }),
  });
  try {
    await harness.execute();

    assert.equal(harness.jobState.status, "succeeded");
    assert.equal(harness.updates.at(-1).data.status, "succeeded");
  } finally {
    harness.restore();
  }
});

test("pipeline lease: cancellation after chapter work cannot be overwritten by success", async () => {
  const harness = createExecutorHarness({
    executionOwner: "owner-a",
    cancelAfterChapter: true,
    executeOptions: { ...options, autoReview: false },
    runChapter: async () => ({
      reviewExecuted: false,
      pass: true,
      score: { overall: 100 },
      issues: [],
      runtimePackage: null,
      retryCountUsed: 0,
    }),
  });
  try {
    await harness.execute();

    assert.equal(harness.chapterCalls, 1);
    assert.equal(harness.jobState.status, "cancelled");
    assert.equal(harness.updates.some((update) => update.data.status === "succeeded"), false);
  } finally {
    harness.restore();
  }
});
