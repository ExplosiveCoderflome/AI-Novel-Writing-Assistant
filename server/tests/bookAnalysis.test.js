const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { prisma } = require("../dist/db/prisma.js");
const { buildPublishMarkdown } = require("../dist/services/bookAnalysis/bookAnalysis.export.js");
const { publishAnalysisToNovel } = require("../dist/services/bookAnalysis/bookAnalysis.publish.js");
const { BookAnalysisSourceCacheService } = require("../dist/services/bookAnalysis/bookAnalysis.cache.js");
const { BookAnalysisCommandService } = require("../dist/services/bookAnalysis/BookAnalysisCommandService.js");
const { BookAnalysisGenerationService } = require("../dist/services/bookAnalysis/bookAnalysis.generation.js");
const { BookAnalysisQueryService } = require("../dist/services/bookAnalysis/BookAnalysisQueryService.js");
const { BookAnalysisTaskQueue } = require("../dist/services/bookAnalysis/bookAnalysis.queue.js");
const { NovelReferenceService } = require("../dist/services/novel/NovelReferenceService.js");
const { resolveLiveBookAnalysisStatus } = require("../dist/services/bookAnalysis/bookAnalysis.status.js");
const { serializeSectionRow } = require("../dist/services/bookAnalysis/bookAnalysis.serialization.js");
const {
  buildSourceSegments,
  normalizeBookAnalysisEvidence,
  normalizeBookAnalysisStructuredData,
  normalizeBookAnalysisStructuredDataWithWarnings,
  renderNotesForPrompt,
  selectNotesForBookAnalysisSection,
} = require("../dist/services/bookAnalysis/bookAnalysis.utils.js");
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

test("selectNotesForBookAnalysisSection keeps section prompts focused on relevant note signals", () => {
  const notes = [
    {
      sourceLabel: "片段 1",
      summary: "人物冲突",
      plotPoints: [],
      timelineEvents: [],
      characters: ["主角被迫站队"],
      worldbuilding: [],
      themes: [],
      styleTechniques: [],
      marketHighlights: [],
      readerSignals: [],
      weaknessSignals: [],
      evidence: [],
    },
    {
      sourceLabel: "片段 2",
      summary: "世界设定",
      plotPoints: [],
      timelineEvents: [],
      characters: [],
      worldbuilding: ["边境禁区由宗门管辖"],
      themes: [],
      styleTechniques: [],
      marketHighlights: [],
      readerSignals: [],
      weaknessSignals: [],
      evidence: [],
    },
    {
      sourceLabel: "片段 3",
      summary: "文风信号",
      plotPoints: [],
      timelineEvents: [],
      characters: [],
      worldbuilding: [],
      themes: [],
      styleTechniques: ["短句推进追逃压迫感"],
      marketHighlights: [],
      readerSignals: [],
      weaknessSignals: [],
      evidence: [],
    },
  ];

  assert.deepEqual(
    selectNotesForBookAnalysisSection("character_system", notes).map((note) => note.sourceLabel),
    ["片段 1"],
  );
  assert.deepEqual(
    selectNotesForBookAnalysisSection("worldbuilding", notes).map((note) => note.sourceLabel),
    ["片段 2"],
  );
  assert.deepEqual(
    selectNotesForBookAnalysisSection("style_technique", notes).map((note) => note.sourceLabel),
    ["片段 3"],
  );
  assert.equal(selectNotesForBookAnalysisSection("timeline", notes).length, notes.length);
});

test("renderNotesForPrompt only renders fields needed by the target section", () => {
  const notes = [{
    sourceLabel: "片段 1",
    summary: "主角在禁区边境暴露身份",
    plotPoints: ["主角身份被试探"],
    timelineEvents: ["入夜后发生追逃"],
    characters: ["主角被迫暴露底牌"],
    worldbuilding: ["禁区边境由宗门封锁"],
    themes: ["信任裂痕"],
    styleTechniques: ["短句推进压迫感"],
    marketHighlights: ["身份反转"],
    readerSignals: ["智斗爽点"],
    weaknessSignals: ["说明略密"],
    evidence: [{ label: "身份试探", excerpt: "他没有立刻承认", sourceLabel: "片段 1" }],
  }];

  const characterPromptNotes = renderNotesForPrompt(notes, "character_system");
  assert.match(characterPromptNotes, /人物信息：主角被迫暴露底牌/);
  assert.match(characterPromptNotes, /剧情要点：主角身份被试探/);
  assert.doesNotMatch(characterPromptNotes, /设定信息：/);
  assert.doesNotMatch(characterPromptNotes, /商业卖点：/);
  assert.doesNotMatch(characterPromptNotes, /文风技法：/);

  const overviewPromptNotes = renderNotesForPrompt(notes, "overview");
  assert.match(overviewPromptNotes, /设定信息：禁区边境由宗门封锁/);
  assert.match(overviewPromptNotes, /商业卖点：身份反转/);
  assert.match(overviewPromptNotes, /文风技法：短句推进压迫感/);
});

test("normalizeBookAnalysisStructuredData keeps fixed section fields and drops aliases", () => {
  const normalized = normalizeBookAnalysisStructuredData("overview", {
    oneLinePositioning: "  强冲突权谋开局  ",
    genreTags: "权谋",
    sellingPointTags: ["身份悬念", "", "权力博弈"],
    targetReaders: ["喜欢智斗的读者"],
    extraField: "不应保留",
  });

  assert.deepEqual(normalized, {
    oneLinePositioning: "强冲突权谋开局",
    genreTags: ["权谋"],
    sellingPointTags: ["身份悬念", "权力博弈"],
    targetReaders: ["喜欢智斗的读者"],
    strengths: [],
    weaknesses: [],
  });
});

test("normalizeBookAnalysisStructuredDataWithWarnings reports truncated array fields", () => {
  const fifteenItems = Array.from({ length: 15 }, (_, index) => `卖点 ${index + 1}`);
  const normalized = normalizeBookAnalysisStructuredDataWithWarnings("overview", {
    genreTags: Array.from({ length: 8 }, (_, index) => `题材 ${index + 1}`),
    sellingPointTags: fifteenItems,
  });

  assert.deepEqual(normalized.structuredData.sellingPointTags, fifteenItems.slice(0, 12));
  assert.deepEqual(normalized.normalizationWarnings, ["sellingPointTags"]);

  const short = normalizeBookAnalysisStructuredDataWithWarnings("overview", {
    sellingPointTags: Array.from({ length: 8 }, (_, index) => `卖点 ${index + 1}`),
  });
  assert.deepEqual(short.normalizationWarnings, []);

  const multiField = normalizeBookAnalysisStructuredDataWithWarnings("plot_structure", {
    phaseProgressions: Array.from({ length: 13 }, (_, index) => `阶段 ${index + 1}`),
    highlightDesigns: Array.from({ length: 14 }, (_, index) => `高光 ${index + 1}`),
  });
  assert.deepEqual(multiField.normalizationWarnings, ["phaseProgressions", "highlightDesigns"]);
});

test("normalizeBookAnalysisStructuredData supports timeline nodes and legacy strings", () => {
  const normalized = normalizeBookAnalysisStructuredDataWithWarnings("timeline", {
    timeNodes: [
      "旧文本节点",
      {
        label: "主角入夜潜入山寨",
        timeHint: "第一夜",
        phase: "潜入",
        sourceRefs: ["片段 1", "", "片段 2"],
        unknownField: "不应保留",
      },
      { label: "" },
    ],
    eventOrder: Array.from({ length: 31 }, (_, index) => ({ label: `事件 ${index + 1}` })),
  });

  assert.deepEqual(normalized.structuredData.timeNodes, [
    { label: "旧文本节点" },
    {
      label: "主角入夜潜入山寨",
      timeHint: "第一夜",
      phase: "潜入",
      sourceRefs: ["片段 1", "片段 2"],
    },
  ]);
  assert.equal(normalized.structuredData.eventOrder.length, 30);
  assert.deepEqual(normalized.normalizationWarnings, ["eventOrder"]);
});

test("serializeSectionRow defaults missing normalization warnings to an empty list", () => {
  const serialized = serializeSectionRow({
    id: "section-legacy",
    analysisId: "analysis-legacy",
    sectionKey: "overview",
    title: "拆书总览",
    status: "succeeded",
    aiContent: "",
    editedContent: null,
    notes: null,
    structuredDataJson: null,
    normalizationWarningsJson: null,
    evidenceJson: null,
    frozen: false,
    sortOrder: 0,
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
  });

  assert.deepEqual(serialized.normalizationWarnings, []);
});

test("normalizeBookAnalysisEvidence keeps valid field bindings and preserves legacy evidence", () => {
  const normalized = normalizeBookAnalysisEvidence("plot_structure", [
    {
      label: "冲突升级",
      excerpt: "反派身份反转导致局势失控",
      sourceLabel: "片段 2",
      fieldKey: "escalationDesigns",
      fieldIndex: 1,
    },
    {
      label: "脏字段",
      excerpt: "这条证据仍应保留",
      sourceLabel: "片段 3",
      fieldKey: "unknownField",
      fieldIndex: 0,
    },
    {
      label: "旧证据",
      excerpt: "没有字段绑定的历史数据",
      sourceLabel: "片段 4",
    },
  ]);

  assert.deepEqual(normalized, [
    {
      label: "冲突升级",
      excerpt: "反派身份反转导致局势失控",
      sourceLabel: "片段 2",
      fieldKey: "escalationDesigns",
      fieldIndex: 1,
    },
    {
      label: "脏字段",
      excerpt: "这条证据仍应保留",
      sourceLabel: "片段 3",
    },
    {
      label: "旧证据",
      excerpt: "没有字段绑定的历史数据",
      sourceLabel: "片段 4",
    },
  ]);

  assert.deepEqual(normalizeBookAnalysisEvidence("overview", [{
    label: "定位",
    excerpt: "一句话定位证据",
    sourceLabel: "片段 1",
    fieldKey: "oneLinePositioning",
    fieldIndex: 2,
  }]), [{
    label: "定位",
    excerpt: "一句话定位证据",
    sourceLabel: "片段 1",
    fieldKey: "oneLinePositioning",
  }]);

  const structured = normalizeBookAnalysisStructuredData("plot_structure", {
    escalationDesigns: Array.from({ length: 15 }, (_, index) => `升级 ${index + 1}`),
  });
  assert.equal(structured.escalationDesigns.length, 12);
  assert.deepEqual(normalizeBookAnalysisEvidence("plot_structure", [{
    label: "越界证据",
    excerpt: "证据本身保留",
    sourceLabel: "片段 5",
    fieldKey: "escalationDesigns",
    fieldIndex: 15,
  }], structured), [{
    label: "越界证据",
    excerpt: "证据本身保留",
    sourceLabel: "片段 5",
    fieldKey: "escalationDesigns",
  }]);
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

test("BookAnalysisQueryService listAnalyses filters by selected document", async () => {
  const originalFindMany = prisma.bookAnalysis.findMany;
  const capturedQueries = [];
  const now = new Date("2026-06-03T00:00:00.000Z");

  prisma.bookAnalysis.findMany = async (query) => {
    capturedQueries.push(query);
    return [{
      id: "analysis-1",
      documentId: "document-1",
      documentVersionId: "version-1",
      title: "测试拆书",
      status: "succeeded",
      summary: "摘要",
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.7,
      maxTokens: null,
      progress: 1,
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      attemptCount: 0,
      maxAttempts: 1,
      lastError: null,
      lastRunAt: now,
      publishedDocumentId: null,
      createdAt: now,
      updatedAt: now,
      document: {
        id: "document-1",
        title: "测试文档",
        fileName: "test.txt",
        activeVersionId: "version-1",
        activeVersionNumber: 1,
      },
      documentVersion: {
        id: "version-1",
        versionNumber: 1,
      },
    }];
  };

  try {
    const service = new BookAnalysisQueryService();
    const rows = await service.listAnalyses({ documentId: "document-1" });

    assert.equal(capturedQueries.length, 1);
    assert.equal(capturedQueries[0].where.documentId, "document-1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].documentId, "document-1");
  } finally {
    prisma.bookAnalysis.findMany = originalFindMany;
  }
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

test("BookAnalysisCommandService createAnalysis freezes sections outside enabledSectionKeys", async () => {
  const originalTransaction = prisma.$transaction;
  const originalEnqueue = BookAnalysisTaskQueue.prototype.enqueue;
  let createdSections = [];

  prisma.$transaction = async (callback) => callback({
    knowledgeDocument: {
      findUnique: async () => ({
        id: "document-1",
        status: "enabled",
        activeVersionId: "version-1",
        title: "测试文档",
        versions: [{ id: "version-1", versionNumber: 1 }],
      }),
    },
    bookAnalysis: {
      create: async () => ({
        id: "analysis-1",
      }),
    },
    bookAnalysisSection: {
      createMany: async ({ data }) => {
        createdSections = data;
        return { count: data.length };
      },
    },
  });
  BookAnalysisTaskQueue.prototype.enqueue = () => {};

  const service = new BookAnalysisCommandService({
    ensureAnalysisSections: async () => {},
    getAnalysisById: async () => ({
      id: "analysis-1",
      sections: [],
    }),
  });

  try {
    await service.createAnalysis({
      documentId: "document-1",
      provider: "deepseek",
      model: "deepseek-chat",
      enabledSectionKeys: ["overview", "plot_structure", "character_system"],
    });

    const sectionState = new Map(createdSections.map((section) => [section.sectionKey, section.frozen]));
    assert.equal(sectionState.get("overview"), false);
    assert.equal(sectionState.get("plot_structure"), false);
    assert.equal(sectionState.get("character_system"), false);
    assert.equal(sectionState.get("timeline"), true);
    assert.equal(sectionState.get("worldbuilding"), true);
    assert.equal(sectionState.get("market_highlights"), true);
  } finally {
    prisma.$transaction = originalTransaction;
    BookAnalysisTaskQueue.prototype.enqueue = originalEnqueue;
  }
});

test("buildPublishMarkdown includes structured key conclusions as publishable content", () => {
  const published = buildPublishMarkdown({
    id: "analysis-structured",
    title: "测试拆书",
    status: "succeeded",
    documentTitle: "测试文档",
    documentFileName: "test.txt",
    documentVersionNumber: 1,
    currentDocumentVersionNumber: 1,
    sections: [{
      id: "section-1",
      analysisId: "analysis-structured",
      sectionKey: "overview",
      title: "拆书总览",
      status: "succeeded",
      aiContent: "",
      editedContent: "",
      notes: "",
      structuredData: {
        oneLinePositioning: "一个以身份反转推动主线的权谋故事",
        sellingPointTags: ["身份悬念", "权谋博弈"],
      },
      evidence: [],
      frozen: false,
      sortOrder: 0,
      updatedAt: new Date().toISOString(),
    }],
  }, "2026-06-03T00:00:00.000Z");

  assert.equal(published.hasPublishableContent, true);
  assert.match(published.content, /### 关键结论/);
  assert.match(published.content, /一句话定位：一个以身份反转推动主线的权谋故事/);
  assert.match(published.content, /卖点标签：身份悬念；权谋博弈/);
});

test("publishAnalysisToNovel replaces only bindings from the same source analysis", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
    transaction: prisma.$transaction,
  };
  const operations = [];
  const detail = {
    id: "analysis-publish",
    title: "测试拆书",
    status: "succeeded",
    documentTitle: "测试文档",
    documentFileName: "test.txt",
    documentVersionNumber: 1,
    currentDocumentVersionNumber: 1,
    sections: [{
      id: "section-1",
      analysisId: "analysis-publish",
      sectionKey: "overview",
      title: "拆书总览",
      status: "succeeded",
      aiContent: "可发布正文",
      editedContent: null,
      notes: null,
      structuredData: null,
      evidence: [],
      frozen: false,
      sortOrder: 0,
      updatedAt: new Date().toISOString(),
    }],
  };

  prisma.novel.findUnique = async () => ({ id: "novel-1" });
  prisma.$transaction = async (callback) => callback({
    knowledgeBinding: {
      deleteMany: async (input) => {
        operations.push({ type: "deleteMany", input });
        return { count: 2 };
      },
      create: async (input) => {
        operations.push({ type: "create", input });
        return input.data;
      },
      count: async (input) => {
        operations.push({ type: "count", input });
        return 3;
      },
    },
    bookAnalysis: {
      update: async (input) => {
        operations.push({ type: "analysisUpdate", input });
        return input.data;
      },
    },
  });

  try {
    const result = await publishAnalysisToNovel({
      analysisId: "analysis-publish",
      novelId: "novel-1",
      knowledgeService: {
        createDocument: async () => ({
          id: "published-document-3",
          activeVersionNumber: 1,
        }),
      },
      getAnalysisById: async () => detail,
    });

    assert.equal(result.knowledgeDocumentId, "published-document-3");
    assert.equal(result.bindingCount, 3);
    assert.deepEqual(operations[0], {
      type: "deleteMany",
      input: {
        where: {
          targetType: "novel",
          targetId: "novel-1",
          sourceAnalysisId: "analysis-publish",
        },
      },
    });
    assert.deepEqual(operations[1], {
      type: "create",
      input: {
        data: {
          targetType: "novel",
          targetId: "novel-1",
          documentId: "published-document-3",
          sourceAnalysisId: "analysis-publish",
        },
      },
    });
    assert.equal(operations[2].input.data.publishedDocumentId, "published-document-3");
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.$transaction = original.transaction;
  }
});

test("NovelReferenceService formats structured timeline nodes by phase", async () => {
  const original = {
    knowledgeBindingFindMany: prisma.knowledgeBinding.findMany,
    knowledgeDocumentFindMany: prisma.knowledgeDocument.findMany,
    bookAnalysisFindMany: prisma.bookAnalysis.findMany,
    novelFindUnique: prisma.novel.findUnique,
  };

  prisma.novel.findUnique = async () => null;
  prisma.knowledgeBinding.findMany = async () => ([{ documentId: "document-1" }]);
  prisma.knowledgeDocument.findMany = async (input) => {
    if (input.include) {
      return [];
    }
    return [{ id: "document-1" }];
  };
  prisma.bookAnalysis.findMany = async () => ([{
    id: "analysis-1",
    title: "测试拆书",
    document: { title: "参考书" },
    documentVersion: { versionNumber: 1 },
    sections: [{
      sectionKey: "timeline",
      title: "故事时间线",
      structuredDataJson: JSON.stringify({
        timeNodes: [
          { label: "主角入夜潜入山寨", timeHint: "第一夜", phase: "潜入", sourceRefs: ["片段 1"] },
          { label: "反派身份暴露", timeHint: "第三幕", phase: "反转", sourceRefs: ["片段 8"] },
        ],
      }),
      aiContent: null,
      editedContent: null,
    }],
  }]);

  try {
    const service = new NovelReferenceService();
    const reference = await service.buildReferenceForStage("novel-1", "chapter");

    assert.match(reference, /\[analysis\.reference\] 测试拆书/);
    assert.match(reference, /### 潜入/);
    assert.match(reference, /主角入夜潜入山寨 \(时间=第一夜; 来源=片段 1\)/);
    assert.match(reference, /### 反转/);
  } finally {
    prisma.knowledgeBinding.findMany = original.knowledgeBindingFindMany;
    prisma.knowledgeDocument.findMany = original.knowledgeDocumentFindMany;
    prisma.bookAnalysis.findMany = original.bookAnalysisFindMany;
    prisma.novel.findUnique = original.novelFindUnique;
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
