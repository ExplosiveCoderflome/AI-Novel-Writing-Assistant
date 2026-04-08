const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { prisma } = require("../dist/db/prisma.js");
const { BookAnalysisSourceCacheService } = require("../dist/services/bookAnalysis/bookAnalysis.cache.js");
const { BookAnalysisGenerationService } = require("../dist/services/bookAnalysis/bookAnalysis.generation.js");
const { BookAnalysisTaskQueue } = require("../dist/services/bookAnalysis/bookAnalysis.queue.js");
const { resolveLiveBookAnalysisStatus } = require("../dist/services/bookAnalysis/bookAnalysis.status.js");
const { buildSourceSegments } = require("../dist/services/bookAnalysis/bookAnalysis.utils.js");
const { BookAnalysisWatchdogService } = require("../dist/services/bookAnalysis/BookAnalysisWatchdogService.js");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 1500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(10);
  }
  throw new Error("Timed out waiting for condition.");
}

function matchCacheIdentity(row, key) {
  return row.documentVersionId === key.documentVersionId
    && row.provider === key.provider
    && row.model === key.model
    && row.temperature === key.temperature
    && row.notesMaxTokens === key.notesMaxTokens
    && row.segmentVersion === key.segmentVersion;
}

test("buildSourceSegments recognizes Chinese chapter headings before falling back to raw chunks", () => {
  const content = [
    "第一章 雪夜摸排",
    "正文".repeat(80),
    "",
    "第二章 卧底试探",
    "正文".repeat(80),
    "",
    "第三章 山场围猎",
    "正文".repeat(80),
  ].join("\n");

  const segments = buildSourceSegments(content);

  assert.equal(segments.length, 3);
  assert.equal(segments[0].label, "第一章 雪夜摸排");
  assert.equal(segments[1].label, "第二章 卧底试探");
  assert.equal(segments[2].label, "第三章 山场围猎");
});

test("resolveLiveBookAnalysisStatus promotes queued rows with live runtime signals", () => {
  assert.equal(
    resolveLiveBookAnalysisStatus({
      status: "queued",
      currentStage: "generating_sections",
      heartbeatAt: null,
    }),
    "running",
  );
  assert.equal(
    resolveLiveBookAnalysisStatus({
      status: "queued",
      currentStage: null,
      heartbeatAt: new Date("2026-04-08T13:25:06.000Z"),
    }),
    "running",
  );
  assert.equal(
    resolveLiveBookAnalysisStatus({
      status: "queued",
      currentStage: null,
      heartbeatAt: null,
    }),
    "queued",
  );
  assert.equal(
    resolveLiveBookAnalysisStatus({
      status: "failed",
      currentStage: "generating_sections",
      heartbeatAt: new Date("2026-04-08T13:25:06.000Z"),
    }),
    "failed",
  );
});

test("BookAnalysisSourceCacheService persists notes and reuses cache hits", async () => {
  const original = {
    findUnique: prisma.bookAnalysisSourceCache.findUnique,
    upsert: prisma.bookAnalysisSourceCache.upsert,
  };

  const cacheRows = [];
  const callCounts = {
    runStructuredPrompt: 0,
    upsert: 0,
  };

  const promptRunner = require("../dist/prompting/core/promptRunner.js");
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  promptRunner.runStructuredPrompt = async () => {
    callCounts.runStructuredPrompt += 1;
    return {
      output: {
        summary: `摘要 ${callCounts.runStructuredPrompt}`,
        plotPoints: ["情节点"],
        timelineEvents: ["时间点"],
        characters: ["角色"],
        worldbuilding: ["设定"],
        themes: ["主题"],
        styleTechniques: ["文风"],
        marketHighlights: ["卖点"],
        evidence: [{ label: "证据", excerpt: "片段摘录" }],
      },
      repairUsed: false,
    };
  };

  prisma.bookAnalysisSourceCache.findUnique = async ({ where }) => {
    const key = where.documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion;
    return cacheRows.find((row) => matchCacheIdentity(row, key)) ?? null;
  };

  prisma.bookAnalysisSourceCache.upsert = async ({ where, create, update }) => {
    callCounts.upsert += 1;
    const key = where.documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion;
    const index = cacheRows.findIndex((row) => matchCacheIdentity(row, key));
    if (index >= 0) {
      cacheRows[index] = {
        ...cacheRows[index],
        ...update,
        updatedAt: new Date(),
      };
      return cacheRows[index];
    }
    const nextRow = {
      id: `cache-${cacheRows.length + 1}`,
      ...create,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    cacheRows.push(nextRow);
    return nextRow;
  };

  const service = new BookAnalysisSourceCacheService();

  const baseInput = {
    documentVersionId: "version-1",
    content: "这是一本很长的小说正文。".repeat(80),
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    sectionMaxTokens: 4800,
  };

  try {
    const first = await service.getOrBuildSourceNotes(baseInput);
    assert.equal(first.cacheHit, false);
    assert.equal(first.notes.length, 1);
    assert.equal(callCounts.runStructuredPrompt, 1);
    assert.equal(callCounts.upsert, 1);

    const second = await service.getOrBuildSourceNotes(baseInput);
    assert.equal(second.cacheHit, true);
    assert.equal(second.notes.length, 1);
    assert.equal(callCounts.runStructuredPrompt, 1);
    assert.equal(callCounts.upsert, 1);
    assert.equal(second.notes[0].summary, first.notes[0].summary);

    const changedModel = await service.getOrBuildSourceNotes({
      ...baseInput,
      model: "deepseek-reasoner",
    });
    assert.equal(changedModel.cacheHit, false);
    assert.equal(callCounts.runStructuredPrompt, 2);
    assert.equal(cacheRows.length, 2);

    const changedVersion = await service.getOrBuildSourceNotes({
      ...baseInput,
      documentVersionId: "version-2",
    });
    assert.equal(changedVersion.cacheHit, false);
    assert.equal(callCounts.runStructuredPrompt, 3);
    assert.equal(cacheRows.length, 3);
  } finally {
    prisma.bookAnalysisSourceCache.findUnique = original.findUnique;
    prisma.bookAnalysisSourceCache.upsert = original.upsert;
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("BookAnalysisSourceCacheService preserves reader and weakness signals from source-note output", async () => {
  const original = {
    findUnique: prisma.bookAnalysisSourceCache.findUnique,
    upsert: prisma.bookAnalysisSourceCache.upsert,
  };
  const promptRunner = require("../dist/prompting/core/promptRunner.js");
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      summary: "片段摘要",
      plotPoints: ["杨子荣试探匪帮"],
      timelineEvents: [],
      characters: ["杨子荣潜伏"],
      worldbuilding: ["威虎山匪帮语境"],
      themes: ["忠诚与智斗"],
      styleTechniques: ["悬念推进"],
      marketHighlights: ["卧底冲突强"],
      readerSignals: ["智斗爽点明确"],
      weaknessSignals: ["对白口号感偏强"],
      evidence: [{ label: "卧底试探", excerpt: "他必须压住情绪继续套话" }],
    },
    repairUsed: false,
  });

  prisma.bookAnalysisSourceCache.findUnique = async () => null;
  prisma.bookAnalysisSourceCache.upsert = async ({ create }) => ({
    id: "cache-1",
    ...create,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const service = new BookAnalysisSourceCacheService();

  try {
    const result = await service.getOrBuildSourceNotes({
      documentVersionId: "version-reader-signals",
      content: "正文".repeat(120),
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.3,
      sectionMaxTokens: 4800,
    });

    assert.deepEqual(result.notes[0].readerSignals, ["智斗爽点明确"]);
    assert.deepEqual(result.notes[0].weaknessSignals, ["对白口号感偏强"]);
  } finally {
    prisma.bookAnalysisSourceCache.findUnique = original.findUnique;
    prisma.bookAnalysisSourceCache.upsert = original.upsert;
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("BookAnalysisGenerationService runSingleSection fetches reusable source notes once", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    sectionUpdate: prisma.bookAnalysisSection.update,
    sectionFindMany: prisma.bookAnalysisSection.findMany,
  };

  const cacheCalls = [];
  const sectionCalls = [];
  const analysisUpdates = [];
  const sectionUpdates = [];

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-1",
        status: "queued",
        summary: null,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: {
          content: "这是用于拆书的正文。".repeat(80),
        },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        sections: [{
          analysisId: "analysis-1",
          sectionKey: "overview",
          title: "拆书总览",
          frozen: false,
        }],
      };
    }
    return {
      status: "running",
      cancelRequestedAt: null,
    };
  };

  prisma.bookAnalysis.update = async (input) => {
    analysisUpdates.push(input);
    return input;
  };

  prisma.bookAnalysisSection.update = async (input) => {
    sectionUpdates.push(input);
    return input;
  };

  prisma.bookAnalysisSection.findMany = async () => ([{
    sectionKey: "overview",
    status: "succeeded",
    frozen: false,
    editedContent: null,
    aiContent: "# 拆书总览\n\n新的摘要内容",
  }]);

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async (input) => {
        cacheCalls.push(input);
        return {
          notes: [{
            sourceLabel: "片段 1",
            summary: "缓存摘要",
            plotPoints: [],
            timelineEvents: [],
            characters: [],
            worldbuilding: [],
            themes: [],
            styleTechniques: [],
            marketHighlights: [],
            evidence: [],
          }],
          segmentCount: 1,
          cacheHit: true,
        };
      },
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        return {
          markdown: "# 拆书总览\n\n新的摘要内容",
          structuredData: { ok: true },
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => {
        throw new Error("optimize should not be used in regenerate test");
      },
    },
  );

  try {
    await service.runSingleSection("analysis-1", "overview");
    assert.equal(cacheCalls.length, 1);
    assert.equal(cacheCalls[0].analysisId, "analysis-1");
    assert.equal(cacheCalls[0].documentVersionId, "version-1");
    assert.equal(sectionCalls.length, 1);
    assert.ok(analysisUpdates.some((item) => item.data.currentStage === "loading_cache"));
    assert.ok(analysisUpdates.some((item) => item.data.currentStage === "generating_sections"));
    assert.ok(analysisUpdates.some((item) => item.data.status === "running"));
    assert.ok(sectionUpdates.some((item) => item.data.status === "running"));
    assert.ok(sectionUpdates.some((item) => item.data.status === "succeeded"));
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
    prisma.bookAnalysisSection.findMany = original.sectionFindMany;
  }
});

test("BookAnalysisGenerationService keeps heartbeating during long section generation", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    bookAnalysisUpdateMany: prisma.bookAnalysis.updateMany,
    sectionUpdate: prisma.bookAnalysisSection.update,
    sectionFindMany: prisma.bookAnalysisSection.findMany,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
  };

  const heartbeatUpdates = [];
  let heartbeatTick = null;

  global.setInterval = (fn) => {
    heartbeatTick = fn;
    return {
      unref() {},
    };
  };
  global.clearInterval = () => {};

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-1",
        status: "queued",
        summary: null,
        progress: 0,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: {
          content: "book-analysis source content ".repeat(80),
        },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        sections: [{
          analysisId: "analysis-1",
          sectionKey: "overview",
          title: "Overview",
          frozen: false,
        }],
      };
    }
    return {
      status: "running",
      cancelRequestedAt: null,
    };
  };

  prisma.bookAnalysis.update = async (input) => input;
  prisma.bookAnalysis.updateMany = async (input) => {
    heartbeatUpdates.push(input);
    return { count: 1 };
  };
  prisma.bookAnalysisSection.update = async (input) => input;
  prisma.bookAnalysisSection.findMany = async () => ([{
    sectionKey: "overview",
    status: "succeeded",
    frozen: false,
    editedContent: null,
    aiContent: "# Overview\n\nGenerated summary",
  }]);

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [{
          sourceLabel: "segment-1",
          summary: "cached summary",
          plotPoints: [],
          timelineEvents: [],
          characters: [],
          worldbuilding: [],
          themes: [],
          styleTechniques: [],
          marketHighlights: [],
          evidence: [],
        }],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async () => {
        assert.ok(heartbeatTick, "heartbeat timer should be registered before section generation");
        heartbeatTick();
        return {
          markdown: "# Overview\n\nGenerated summary",
          structuredData: { ok: true },
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => {
        throw new Error("optimize should not be used in heartbeat test");
      },
    },
  );

  try {
    await service.runSingleSection("analysis-1", "overview");
    assert.ok(heartbeatUpdates.length >= 1);
    assert.equal(heartbeatUpdates[0].where.id, "analysis-1");
    assert.equal(heartbeatUpdates[0].data.status, "running");
    assert.ok(heartbeatUpdates[0].data.heartbeatAt instanceof Date);
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysis.updateMany = original.bookAnalysisUpdateMany;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
    prisma.bookAnalysisSection.findMany = original.sectionFindMany;
    global.setInterval = original.setInterval;
    global.clearInterval = original.clearInterval;
  }
});

test("BookAnalysisGenerationService optimizeSectionPreview reuses cached source notes", async () => {
  const originalFindFirst = prisma.bookAnalysisSection.findFirst;
  const cacheCalls = [];
  const optimizeCalls = [];

  prisma.bookAnalysisSection.findFirst = async () => ({
    analysisId: "analysis-1",
    sectionKey: "themes",
    frozen: false,
    editedContent: null,
    aiContent: "当前草稿",
    analysis: {
      status: "queued",
      documentVersionId: "version-1",
      documentVersion: {
        content: "这是用于优化草稿的正文。".repeat(80),
      },
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.4,
      maxTokens: 4096,
    },
  });

  const fakeNotes = [{
    sourceLabel: "片段 1",
    summary: "缓存摘要",
    plotPoints: [],
    timelineEvents: [],
    characters: [],
    worldbuilding: [],
    themes: ["主题"],
    styleTechniques: [],
    marketHighlights: [],
    evidence: [],
  }];

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async (input) => {
        cacheCalls.push(input);
        return {
          notes: fakeNotes,
          segmentCount: 1,
          cacheHit: true,
        };
      },
    },
    {
      generateSection: async () => {
        throw new Error("generateSection should not be used in optimize preview test");
      },
      generateOptimizedDraft: async (input) => {
        optimizeCalls.push(input);
        return "优化后的草稿";
      },
    },
  );

  try {
    const optimized = await service.optimizeSectionPreview({
      analysisId: "analysis-1",
      sectionKey: "themes",
      currentDraft: "",
      instruction: "请压缩重复表达",
    });
    assert.equal(optimized, "优化后的草稿");
    assert.equal(cacheCalls.length, 1);
    assert.deepEqual(optimizeCalls[0].notes, fakeNotes);
    assert.equal(optimizeCalls[0].currentDraft, "当前草稿");
    assert.equal(optimizeCalls[0].instruction, "请压缩重复表达");
  } finally {
    prisma.bookAnalysisSection.findFirst = originalFindFirst;
  }
});

test("BookAnalysisTaskQueue limits concurrency and keeps the same analysis serialized", async () => {
  const started = [];
  const gates = new Map();
  let runningCount = 0;
  let maxRunningCount = 0;

  const queue = new BookAnalysisTaskQueue({
    getMaxConcurrentTasks: () => 2,
    onRunTask: async (task) => {
      const label = task.kind === "full"
        ? `${task.analysisId}:full`
        : `${task.analysisId}:section:${task.sectionKey}`;
      const gate = createDeferred();
      gates.set(label, gate);
      started.push(label);
      runningCount += 1;
      maxRunningCount = Math.max(maxRunningCount, runningCount);
      await gate.promise;
      runningCount -= 1;
    },
  });

  queue.enqueue({ analysisId: "analysis-1", kind: "section", sectionKey: "overview" });
  queue.enqueue({ analysisId: "analysis-2", kind: "full" });
  queue.enqueue({ analysisId: "analysis-1", kind: "section", sectionKey: "themes" });
  queue.enqueue({ analysisId: "analysis-3", kind: "full" });

  await waitFor(() => started.length === 2);
  assert.deepEqual(started, ["analysis-1:section:overview", "analysis-2:full"]);
  assert.equal(maxRunningCount, 2);

  gates.get("analysis-2:full").resolve();
  await waitFor(() => started.length === 3);
  assert.equal(started[2], "analysis-3:full");

  gates.get("analysis-1:section:overview").resolve();
  await waitFor(() => started.length === 4);
  assert.equal(started[3], "analysis-1:section:themes");

  gates.get("analysis-1:section:themes").resolve();
  gates.get("analysis-3:full").resolve();
  await waitFor(() => runningCount === 0);
});

test("BookAnalysisTaskQueue drops queued section tasks once a full rebuild is queued", async () => {
  const started = [];
  const gates = new Map();

  const queue = new BookAnalysisTaskQueue({
    getMaxConcurrentTasks: () => 1,
    onRunTask: async (task) => {
      const label = task.kind === "full"
        ? `${task.analysisId}:full`
        : `${task.analysisId}:section:${task.sectionKey}`;
      const gate = createDeferred();
      gates.set(label, gate);
      started.push(label);
      await gate.promise;
    },
  });

  queue.enqueue({ analysisId: "analysis-1", kind: "section", sectionKey: "overview" });
  await waitFor(() => started.length === 1);

  queue.enqueue({ analysisId: "analysis-1", kind: "section", sectionKey: "themes" });
  queue.enqueue({ analysisId: "analysis-1", kind: "full" });
  queue.enqueue({ analysisId: "analysis-1", kind: "section", sectionKey: "worldbuilding" });

  gates.get("analysis-1:section:overview").resolve();
  await waitFor(() => started.length === 2);
  assert.deepEqual(started, ["analysis-1:section:overview", "analysis-1:full"]);

  gates.get("analysis-1:full").resolve();
});

test("BookAnalysisWatchdogService requeues stale analyses within retry budget and fails exhausted ones", async () => {
  const original = {
    findMany: prisma.bookAnalysis.findMany,
    update: prisma.bookAnalysis.update,
    transaction: prisma.$transaction,
  };

  const requeued = [];
  const transactionCalls = [];
  const failedUpdates = [];

  prisma.bookAnalysis.findMany = async () => ([
    { id: "analysis-requeue", attemptCount: 0, maxAttempts: 1 },
    { id: "analysis-fail", attemptCount: 1, maxAttempts: 1 },
  ]);

  prisma.$transaction = async (callback) => callback({
    bookAnalysis: {
      update: async (input) => {
        transactionCalls.push({ type: "analysis", input });
        return input;
      },
    },
    bookAnalysisSection: {
      updateMany: async (input) => {
        transactionCalls.push({ type: "sections", input });
        return input;
      },
    },
  });

  prisma.bookAnalysis.update = async (input) => {
    failedUpdates.push(input);
    return input;
  };

  const service = new BookAnalysisWatchdogService((analysisId) => {
    requeued.push(analysisId);
  });

  try {
    await service.recoverTimedOutAnalyses();
    assert.deepEqual(requeued, ["analysis-requeue"]);
    assert.ok(transactionCalls.some((item) => item.type === "analysis" && item.input.where.id === "analysis-requeue"));
    assert.ok(transactionCalls.some((item) => item.type === "sections" && item.input.where.analysisId === "analysis-requeue"));
    assert.equal(failedUpdates.length, 1);
    assert.equal(failedUpdates[0].where.id, "analysis-fail");
    assert.equal(failedUpdates[0].data.status, "failed");
  } finally {
    prisma.bookAnalysis.findMany = original.findMany;
    prisma.bookAnalysis.update = original.update;
    prisma.$transaction = original.transaction;
  }
});
