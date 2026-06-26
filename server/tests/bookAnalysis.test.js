const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { prisma } = require("../dist/db/prisma.js");
const { buildPublishMarkdown } = require("../dist/services/bookAnalysis/bookAnalysis.export.js");
const { publishAnalysisToNovel } = require("../dist/services/bookAnalysis/bookAnalysis.publish.js");
const { BookAnalysisSourceCacheService } = require("../dist/services/bookAnalysis/bookAnalysis.cache.js");
const { BookAnalysisCommandService } = require("../dist/services/bookAnalysis/BookAnalysisCommandService.js");
const { BookAnalysisGenerationService } = require("../dist/services/bookAnalysis/bookAnalysis.generation.js");
const {
  BookAnalysisBudgetExceededError,
  BookAnalysisBudgetGuard,
  normalizeBookAnalysisBudgetTokens,
} = require("../dist/services/bookAnalysis/bookAnalysis.budget.js");
const { BookAnalysisCharacterService } = require("../dist/services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterService.js");
const { BookAnalysisCharacterMediaService } = require("../dist/services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterMediaService.js");
const { BookAnalysisQueryService } = require("../dist/services/bookAnalysis/BookAnalysisQueryService.js");
const { BookAnalysisTaskQueue } = require("../dist/services/bookAnalysis/bookAnalysis.queue.js");
const { KnowledgeService } = require("../dist/services/knowledge/KnowledgeService.js");
const { KnowledgePublishService } = require("../dist/services/knowledge/KnowledgePublishService.js");
const { NovelExportService } = require("../dist/modules/export/novelExport.service.js");
const {
  bindEvidenceToDocumentChapters,
  DocumentChapterService,
} = require("../dist/services/knowledge/DocumentChapterService.js");
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

test("BookAnalysisBudgetGuard increments used tokens and throws budget_exceeded", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    update: prisma.bookAnalysis.update,
  };
  let usedTokens = 900;
  prisma.bookAnalysis.update = async ({ data }) => {
    usedTokens += data.usedTokens.increment;
    return { budgetTokens: 1000, usedTokens };
  };
  prisma.bookAnalysis.findUnique = async () => ({ budgetTokens: 1000, usedTokens });

  try {
    assert.equal(normalizeBookAnalysisBudgetTokens(2000.8), 2000);
    assert.equal(normalizeBookAnalysisBudgetTokens(0), null);

    const guard = new BookAnalysisBudgetGuard("analysis-1");
    await guard.onSectionFinished({ promptTokens: 20, completionTokens: 30, totalTokens: 50 });
    assert.equal(usedTokens, 950);

    await assert.rejects(
      () => guard.onSectionFinished({ promptTokens: 20, completionTokens: 40, totalTokens: 60 }),
      (error) =>
        error instanceof BookAnalysisBudgetExceededError &&
        error.message.includes("budget_exceeded") &&
        error.usedTokens === 1010,
    );
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.bookAnalysis.update = original.update;
  }
});

function createNoopDocumentChapterService() {
  return {
    ensureChaptersForVersion: async (documentVersionId) => ({
      documentVersionId,
      splitter: "single",
      chapters: [],
    }),
  };
}

function matchCacheIdentity(row, key) {
  if (!key) {
    return false;
  }
  return row.documentVersionId === key.documentVersionId
    && row.sourceScopeKey === key.sourceScopeKey
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

test("BookAnalysisCharacterService supports manual character CRUD without touching generation flow", async () => {
  const original = {
    analysisFindUnique: prisma.bookAnalysis.findUnique,
    characterCount: prisma.bookAnalysisCharacter.count,
    characterCreate: prisma.bookAnalysisCharacter.create,
    characterFindMany: prisma.bookAnalysisCharacter.findMany,
    characterFindFirst: prisma.bookAnalysisCharacter.findFirst,
    characterUpdate: prisma.bookAnalysisCharacter.update,
    characterDeleteMany: prisma.bookAnalysisCharacter.deleteMany,
  };
  const now = new Date("2026-06-24T10:00:00.000Z");
  const createdRows = [];
  const deleted = [];

  prisma.bookAnalysis.findUnique = async () => ({ status: "succeeded" });
  prisma.bookAnalysisCharacter.count = async () => createdRows.length;
  prisma.bookAnalysisCharacter.create = async ({ data }) => {
    const row = {
      id: `char-${createdRows.length + 1}`,
      analysisId: data.analysisId,
      name: data.name,
      role: data.role,
      generationDepth: data.generationDepth,
      selectedDimensionsJson: data.selectedDimensionsJson,
      profileJson: data.profileJson,
      evidenceJson: data.evidenceJson ?? null,
      sortOrder: data.sortOrder,
      createdAt: now,
      updatedAt: now,
      arcs: [],
      scenes: [],
    };
    createdRows.push(row);
    return row;
  };
  prisma.bookAnalysisCharacter.findMany = async () => createdRows;
  prisma.bookAnalysisCharacter.findFirst = async ({ where }) => createdRows.find((row) => row.id === where.id && row.analysisId === where.analysisId) ?? null;
  prisma.bookAnalysisCharacter.update = async ({ where, data }) => {
    const row = createdRows.find((item) => item.id === where.id);
    Object.assign(row, {
      name: data.name ?? row.name,
      role: data.role ?? row.role,
      profileJson: data.profileJson ?? row.profileJson,
      selectedDimensionsJson: data.selectedDimensionsJson ?? row.selectedDimensionsJson,
      updatedAt: now,
    });
    return { ...row, arcs: [], scenes: [] };
  };
  prisma.bookAnalysisCharacter.deleteMany = async ({ where }) => {
    deleted.push(where);
    return { count: 1 };
  };

  const service = new BookAnalysisCharacterService();

  try {
    const created = await service.createCharacter("analysis-1", {
      name: " 林秋 ",
      role: "主角",
      profile: { personality: "谨慎但敢赌", aliases: ["秋哥"] },
      selectedDimensions: ["basic", "personality"],
    });
    assert.equal(created.name, "林秋");
    assert.equal(created.profile.personality, "谨慎但敢赌");
    assert.deepEqual(created.selectedDimensions, ["basic", "personality"]);

    const listed = await service.listCharacters("analysis-1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].profile.aliases[0], "秋哥");

    const updated = await service.updateCharacter("analysis-1", "char-1", {
      role: "男主角",
      profile: { outerGoal: "查清旧案" },
    });
    assert.equal(updated.role, "男主角");
    assert.equal(updated.profile.outerGoal, "查清旧案");

    await service.deleteCharacter("analysis-1", "char-1");
    assert.deepEqual(deleted[0], { id: "char-1", analysisId: "analysis-1" });
  } finally {
    prisma.bookAnalysis.findUnique = original.analysisFindUnique;
    prisma.bookAnalysisCharacter.count = original.characterCount;
    prisma.bookAnalysisCharacter.create = original.characterCreate;
    prisma.bookAnalysisCharacter.findMany = original.characterFindMany;
    prisma.bookAnalysisCharacter.findFirst = original.characterFindFirst;
    prisma.bookAnalysisCharacter.update = original.characterUpdate;
    prisma.bookAnalysisCharacter.deleteMany = original.characterDeleteMany;
  }
});

test("BookAnalysisCharacterService persists generated profile arcs and scenes on user trigger", async () => {
  const original = {
    analysisFindUnique: prisma.bookAnalysis.findUnique,
    characterCount: prisma.bookAnalysisCharacter.count,
    characterFindMany: prisma.bookAnalysisCharacter.findMany,
    transaction: prisma.$transaction,
  };
  const now = new Date("2026-06-24T10:00:00.000Z");
  const promptInputs = [];
  const characterCreates = [];
  const arcCreates = [];
  const sceneCreates = [];

  prisma.bookAnalysis.findUnique = async () => ({
    id: "analysis-1",
    status: "succeeded",
    documentVersionId: "version-1",
    documentVersion: { content: "第一章 开局\n林秋决定查清旧案。" },
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
    maxTokens: 4096,
    sections: [{
      sectionKey: "character_system",
      aiContent: "林秋：主角，谨慎但敢赌。",
      editedContent: null,
    }],
  });
  prisma.bookAnalysisCharacter.count = async () => 0;
  prisma.bookAnalysisCharacter.findMany = async () => characterCreates.map((row, index) => ({
    id: row.id,
    analysisId: row.analysisId,
    name: row.name,
    role: row.role,
    generationDepth: row.generationDepth,
    selectedDimensionsJson: row.selectedDimensionsJson,
    profileJson: row.profileJson,
    evidenceJson: row.evidenceJson,
    sortOrder: row.sortOrder,
    createdAt: now,
    updatedAt: now,
    arcs: arcCreates
      .filter((arc) => arc.characterId === row.id)
      .map((arc, arcIndex) => ({ id: `arc-${arcIndex + 1}`, ...arc, createdAt: now, updatedAt: now })),
    scenes: sceneCreates
      .filter((scene) => scene.characterId === row.id)
      .map((scene, sceneIndex) => ({ id: `scene-${sceneIndex + 1}`, ...scene, createdAt: now, updatedAt: now })),
    sortOrder: index,
  }));
  prisma.$transaction = async (callback) => callback({
    bookAnalysisCharacter: {
      create: async ({ data }) => {
        const row = { id: `char-${characterCreates.length + 1}`, ...data };
        characterCreates.push(row);
        return row;
      },
    },
    bookAnalysisCharacterArc: {
      create: async ({ data }) => {
        arcCreates.push(data);
        return data;
      },
    },
    bookAnalysisCharacterScene: {
      create: async ({ data }) => {
        sceneCreates.push(data);
        return data;
      },
    },
  });

  const service = new BookAnalysisCharacterService({
    getOrBuildSourceNotes: async () => ({
      notes: [{
        sourceLabel: "片段 1",
        summary: "林秋决定查清旧案",
        plotPoints: ["旧案出现"],
        timelineEvents: [],
        characters: ["林秋谨慎但敢赌"],
        worldbuilding: [],
        themes: [],
        styleTechniques: [],
        marketHighlights: [],
        evidence: [{ label: "目标", excerpt: "林秋决定查清旧案" }],
      }],
      segmentCount: 1,
      cacheHit: true,
    }),
  }, async ({ promptInput }) => {
    promptInputs.push(promptInput);
    return {
      output: {
        characters: [{
          name: "林秋",
          role: "主角",
          profile: {
            personality: "谨慎但敢赌",
            outerGoal: "查清旧案",
          },
          evidence: [{ label: "目标", excerpt: "林秋决定查清旧案" }],
          arcs: [{
            chapterIndex: 0,
            stageLabel: "被迫接案",
            stateSnapshot: { pressure: "高" },
            evidence: [{ label: "开局", excerpt: "第一章 开局" }],
          }],
          scenes: [{
            sceneLabel: "雪夜接案",
            sceneType: "高光",
            performance: { action: "主动追查" },
            evidence: [{ label: "决定", excerpt: "决定查清旧案" }],
          }],
        }],
      },
    };
  });

  try {
    const characters = await service.generateCharacters("analysis-1", {
      generationDepth: "standard",
      selectedDimensions: ["basic", "arc", "scenes"],
      characterNames: ["林秋"],
    });

    assert.equal(promptInputs.length, 1);
    assert.deepEqual(promptInputs[0].characterNames, ["林秋"]);
    assert.match(promptInputs[0].characterSystemContext, /林秋：主角/);
    assert.equal(characterCreates.length, 1);
    assert.equal(arcCreates.length, 1);
    assert.equal(sceneCreates.length, 1);
    assert.equal(characters[0].name, "林秋");
    assert.equal(characters[0].profile.outerGoal, "查清旧案");
    assert.equal(characters[0].arcs[0].chapterIndex, 0);
    assert.equal(characters[0].scenes[0].sceneLabel, "雪夜接案");
  } finally {
    prisma.bookAnalysis.findUnique = original.analysisFindUnique;
    prisma.bookAnalysisCharacter.count = original.characterCount;
    prisma.bookAnalysisCharacter.findMany = original.characterFindMany;
    prisma.$transaction = original.transaction;
  }
});

test("BookAnalysisCharacterMediaService queues book-analysis character image tasks", async () => {
  const original = {
    characterFindFirst: prisma.bookAnalysisCharacter.findFirst,
  };
  const now = new Date("2026-06-24T12:00:00.000Z");
  const character = {
    id: "bac-1",
    analysisId: "analysis-1",
    name: "林秋",
    role: "主角",
    profileJson: JSON.stringify({
      name: "林秋",
      role: "主角",
      appearance: "黑衣，眉眼冷静",
      personality: "谨慎但敢赌",
      outerGoal: "查清旧案",
    }),
  };
  const taskCreates = [];

  prisma.bookAnalysisCharacter.findFirst = async ({ where }) =>
    where.id === "bac-1" && where.analysisId === "analysis-1" ? character : null;
  const imageService = {
    createBookAnalysisCharacterTask: async (input) => {
      taskCreates.push(input);
      return {
        id: "task-1",
        sceneType: input.sceneType,
        baseCharacterId: null,
        novelId: null,
        bookAnalysisCharacterId: input.bookAnalysisCharacterId,
        provider: input.provider ?? "openai",
        model: "gpt-image-1",
        prompt: input.prompt,
        negativePrompt: input.negativePrompt ?? null,
        stylePreset: input.stylePreset ?? null,
        size: input.size ?? "1024x1024",
        imageCount: input.count ?? 1,
        seed: input.seed ?? null,
        status: "queued",
        progress: 0,
        retryCount: 0,
        maxRetries: input.maxRetries ?? 2,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: input.bookAnalysisCharacterId,
        currentItemLabel: "林秋",
        cancelRequestedAt: null,
        error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
        updatedAt: now,
      };
    },
  };

  const service = new BookAnalysisCharacterMediaService(imageService);

  try {
    const preview = await service.prepareImage("analysis-1", "bac-1", { provider: "openai" });
    assert.match(preview.prompt, /黑衣，眉眼冷静/);

    const task = await service.generateImage("analysis-1", "bac-1", {
      provider: "openai",
      overrides: {
        promptOverride: "完整可发送提示词",
      },
    });
    assert.equal(task.sceneType, "book_analysis_character");
    assert.equal(task.bookAnalysisCharacterId, "bac-1");
    assert.equal(taskCreates[0].sceneType, "book_analysis_character");
    assert.equal(taskCreates[0].bookAnalysisCharacterId, "bac-1");
    assert.equal(taskCreates[0].prompt, "完整可发送提示词");
  } finally {
    prisma.bookAnalysisCharacter.findFirst = original.characterFindFirst;
  }
});

test("BookAnalysisCharacterMediaService promotes a profile to BaseCharacter with source fields", async () => {
  const characterLibrarySync = require("../dist/services/character/CharacterLibrarySyncService.js");
  const original = {
    characterFindFirst: prisma.bookAnalysisCharacter.findFirst,
    baseCreate: prisma.baseCharacter.create,
    createBaseRevision: characterLibrarySync.characterLibrarySyncService.createBaseRevision,
  };
  const now = new Date("2026-06-24T12:00:00.000Z");
  const createdBaseCharacters = [];

  prisma.bookAnalysisCharacter.findFirst = async () => ({
    id: "bac-1",
    analysisId: "analysis-1",
    name: "林秋",
    role: "主角",
    profileJson: JSON.stringify({
      name: "林秋",
      role: "主角",
      appearance: "黑衣，眉眼冷静",
      personality: "谨慎但敢赌",
      outerGoal: "查清旧案",
      innerNeed: "放下自责",
      growthTrajectory: "从独行到信任同伴",
      highlightScenes: [{ sceneLabel: "雪夜接案", performance: "主动追查旧案" }],
    }),
  });
  prisma.baseCharacter.create = async ({ data }) => {
    const row = {
      id: "base-1",
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    createdBaseCharacters.push(row);
    return row;
  };
  characterLibrarySync.characterLibrarySyncService.createBaseRevision = async (...args) => ({ id: "rev-1", args });

  const service = new BookAnalysisCharacterMediaService();

  try {
    const result = await service.promoteToBaseCharacter("analysis-1", "bac-1", {
      includePrimaryImage: false,
    });

    assert.equal(result.baseCharacter.id, "base-1");
    assert.equal(createdBaseCharacters[0].sourceType, "from_book_analysis_character");
    assert.equal(createdBaseCharacters[0].sourceRefId, "bac-1");
    assert.match(createdBaseCharacters[0].background, /查清旧案/);
    assert.match(createdBaseCharacters[0].development, /信任同伴/);
    assert.match(createdBaseCharacters[0].keyEvents, /雪夜接案/);
    assert.equal(result.clonedPrimaryImageAsset, null);
  } finally {
    prisma.bookAnalysisCharacter.findFirst = original.characterFindFirst;
    prisma.baseCharacter.create = original.baseCreate;
    characterLibrarySync.characterLibrarySyncService.createBaseRevision = original.createBaseRevision;
  }
});

test("NovelExportService exports generated chapters as a knowledge document for diagnosis", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
  };
  const createdDocuments = [];
  prisma.novel.findUnique = async ({ where }) => {
    assert.equal(where.id, "novel-1");
    return {
      title: "雪夜旧案",
      description: "刑侦悬疑",
      chapters: [
        { order: 1, title: "雨夜来客", content: "主角在雨夜接到旧案线索。" },
        { order: 2, title: "反向试探", content: "同伴隐瞒关键证词，矛盾升级。" },
      ],
    };
  };

  const service = new NovelExportService();
  service.knowledgeService = {
    createDocument: async (input) => {
      createdDocuments.push(input);
      return {
        id: "doc-1",
        title: input.title,
        fileName: input.fileName,
        status: "enabled",
        activeVersionId: "version-1",
        activeVersionNumber: 1,
        latestIndexStatus: "queued",
        latestIndexError: null,
        lastIndexedAt: null,
        createdAt: new Date("2026-06-24T12:00:00.000Z"),
        updatedAt: new Date("2026-06-24T12:00:00.000Z"),
        bookAnalysisCount: 0,
        versions: [],
      };
    },
  };

  try {
    const result = await service.exportAsKnowledgeDocument("novel-1");
    assert.equal(result.id, "doc-1");
    assert.equal(createdDocuments[0].title, "雪夜旧案（诊断稿）");
    assert.match(createdDocuments[0].fileName, /^雪夜旧案-diagnosis-\d{8}-\d{6}\.txt$/);
    assert.match(createdDocuments[0].content, /第1章 雨夜来客/);
    assert.match(createdDocuments[0].content, /同伴隐瞒关键证词/);
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
  }
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
      chapterIndex: 1,
      excerptOffsetRange: { start: 120, end: 132 },
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
      chapterIndex: 1,
      excerptOffsetRange: { start: 120, end: 132 },
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

test("bindEvidenceToDocumentChapters attaches chapter index and source offsets", () => {
  const content = [
    "第一章 雪夜摸排",
    "主角在雪夜摸排山寨。",
    "",
    "第二章 卧底试探",
    "反派身份反转导致局势失控。",
  ].join("\n");
  const chapterStart = content.indexOf("第二章");
  const excerpt = "反派身份反转导致局势失控";
  const excerptStart = content.indexOf(excerpt);
  const bound = bindEvidenceToDocumentChapters(
    [{
      label: "冲突升级",
      excerpt,
      sourceLabel: "片段 2",
    }],
    [
      {
        id: "chapter-1",
        documentVersionId: "version-1",
        chapterIndex: 0,
        title: "第一章 雪夜摸排",
        startOffset: 0,
        endOffset: chapterStart,
        charCount: chapterStart,
        summary: null,
        splitter: "rule",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "chapter-2",
        documentVersionId: "version-1",
        chapterIndex: 1,
        title: "第二章 卧底试探",
        startOffset: chapterStart,
        endOffset: content.length,
        charCount: content.length - chapterStart,
        summary: null,
        splitter: "rule",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    content,
  );

  assert.equal(bound[0].chapterIndex, 1);
  assert.deepEqual(bound[0].excerptOffsetRange, {
    start: excerptStart,
    end: excerptStart + excerpt.length,
  });
});

test("DocumentChapterService splits standard Chinese chapter headings and caches rows", async () => {
  const original = {
    versionFindUnique: prisma.knowledgeDocumentVersion.findUnique,
    chapterFindMany: prisma.documentChapter.findMany,
    transaction: prisma.$transaction,
  };
  const createdRows = [];
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

  prisma.documentChapter.findMany = async () => createdRows.map((row, index) => ({
    id: `chapter-${index + 1}`,
    ...row,
    summary: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
  }));
  prisma.knowledgeDocumentVersion.findUnique = async () => ({
    id: "version-1",
    documentId: "document-1",
    content,
  });
  prisma.$transaction = async (callback) => callback({
    documentChapter: {
      deleteMany: async () => {
        createdRows.length = 0;
        return { count: 0 };
      },
      createMany: async ({ data }) => {
        createdRows.push(...data);
        return { count: data.length };
      },
    },
  });

  const service = new DocumentChapterService();

  try {
    const result = await service.rebuildChaptersForVersion("version-1", "document-1");

    assert.equal(result.splitter, "rule");
    assert.equal(result.chapters.length, 3);
    assert.deepEqual(result.chapters.map((chapter) => chapter.title), [
      "第一章 雪夜摸排",
      "第二章 卧底试探",
      "第三章 山场围猎",
    ]);
    assert.ok(result.chapters[1].startOffset > result.chapters[0].startOffset);
  } finally {
    prisma.knowledgeDocumentVersion.findUnique = original.versionFindUnique;
    prisma.documentChapter.findMany = original.chapterFindMany;
    prisma.$transaction = original.transaction;
  }
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
    const key = where.documentVersionId_sourceScopeKey_provider_model_temperature_notesMaxTokens_segmentVersion;
    return cacheRows.find((row) => matchCacheIdentity(row, key)) ?? null;
  };

  prisma.bookAnalysisSourceCache.upsert = async ({ where, create, update }) => {
    callCounts.upsert += 1;
    const key = where.documentVersionId_sourceScopeKey_provider_model_temperature_notesMaxTokens_segmentVersion;
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

test("BookAnalysisGenerationService runFullAnalysis generates overview before dependent sections", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    bookAnalysisUpdateMany: prisma.bookAnalysis.updateMany,
    sectionUpdate: prisma.bookAnalysisSection.update,
  };
  const analysisUpdates = [];
  const sectionCalls = [];
  const sectionUpdates = [];

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-full",
        status: "queued",
        summary: null,
        progress: 0,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: { content: "book-analysis source content ".repeat(80) },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        userFocusInstruction: "重点观察权谋爽点",
        sections: [
          { analysisId: "analysis-full", sectionKey: "overview", title: "拆书总览", frozen: false, focusInstruction: "总览先抓定位" },
          { analysisId: "analysis-full", sectionKey: "plot_structure", title: "剧情结构", frozen: false, focusInstruction: "剧情重点看反转" },
          { analysisId: "analysis-full", sectionKey: "character_system", title: "人物系统", frozen: false, focusInstruction: null },
        ],
      };
    }
    return { status: "running", cancelRequestedAt: null };
  };
  prisma.bookAnalysis.update = async (input) => {
    analysisUpdates.push(input);
    return input;
  };
  prisma.bookAnalysis.updateMany = async (input) => input;
  prisma.bookAnalysisSection.update = async (input) => {
    sectionUpdates.push(input);
    return input;
  };

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [{
          sourceLabel: "片段 1",
          summary: "缓存摘要",
          plotPoints: ["主线推进"],
          timelineEvents: [],
          characters: ["主角定位"],
          worldbuilding: [],
          themes: [],
          styleTechniques: [],
          marketHighlights: ["身份反转"],
          readerSignals: ["智斗爽点"],
          weaknessSignals: [],
          evidence: [],
        }],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        const sectionKey = args[0];
        if (sectionKey === "overview") {
          return {
            markdown: "# 拆书总览\n\n整本书偏强冲突权谋。",
            structuredData: {
              oneLinePositioning: "强冲突权谋开局",
              genreTags: ["权谋"],
              sellingPointTags: ["身份反转"],
              targetReaders: ["喜欢智斗的读者"],
              strengths: ["开局冲突明确"],
              weaknesses: ["说明略密"],
            },
            normalizationWarnings: [],
            evidence: [],
          };
        }
        return {
          markdown: `# ${sectionKey}\n\n生成内容`,
          structuredData: {},
          normalizationWarnings: [],
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => {
        throw new Error("optimize should not be used in full analysis test");
      },
    },
    createNoopDocumentChapterService(),
  );

  try {
    await service.runFullAnalysis("analysis-full");

    assert.equal(sectionCalls[0][0], "overview");
    assert.equal(sectionCalls[0][6].userFocusInstruction, "重点观察权谋爽点");
    assert.equal(sectionCalls[0][6].sectionFocusInstruction, "总览先抓定位");
    const dependentCalls = sectionCalls.slice(1);
    assert.deepEqual(dependentCalls.map((item) => item[0]).sort(), ["character_system", "plot_structure"]);
    for (const call of dependentCalls) {
      assert.equal(call[6].userFocusInstruction, "重点观察权谋爽点");
      assert.equal(call[6].overviewContext.oneLinePositioning, "强冲突权谋开局");
      assert.deepEqual(call[6].overviewContext.genreTags, ["权谋"]);
      assert.deepEqual(call[6].overviewContext.weaknesses, ["说明略密"]);
    }
    const plotCall = dependentCalls.find((item) => item[0] === "plot_structure");
    const characterCall = dependentCalls.find((item) => item[0] === "character_system");
    assert.equal(plotCall[6].sectionFocusInstruction, "剧情重点看反转");
    assert.equal(characterCall[6].sectionFocusInstruction, null);
    assert.ok(sectionUpdates.some((item) => item.where.analysisId_sectionKey.sectionKey === "overview" && item.data.status === "succeeded"));
    assert.ok(analysisUpdates.some((item) => item.data.currentStage === "generating_overview"));
    assert.ok(analysisUpdates.some((item) => item.data.currentStage === "generating_sections"));
    const progressValues = analysisUpdates
      .map((item) => item.data.progress)
      .filter((value) => typeof value === "number");
    for (let index = 1; index < progressValues.length; index += 1) {
      assert.ok(progressValues[index] >= progressValues[index - 1], `progress regressed at ${index}`);
    }
    assert.ok(analysisUpdates.some((item) => item.data.status === "succeeded" && item.data.progress === 1));
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysis.updateMany = original.bookAnalysisUpdateMany;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
  }
});

test("BookAnalysisGenerationService runFullAnalysis keeps old flow when overview is not enabled", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    bookAnalysisUpdateMany: prisma.bookAnalysis.updateMany,
    sectionUpdate: prisma.bookAnalysisSection.update,
  };
  const sectionCalls = [];

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-no-overview",
        status: "queued",
        summary: null,
        progress: 0,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: { content: "book-analysis source content ".repeat(80) },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        userFocusInstruction: null,
        sections: [
          { analysisId: "analysis-no-overview", sectionKey: "plot_structure", title: "剧情结构", frozen: false, focusInstruction: null },
          { analysisId: "analysis-no-overview", sectionKey: "character_system", title: "人物系统", frozen: false, focusInstruction: null },
        ],
      };
    }
    return { status: "running", cancelRequestedAt: null };
  };
  prisma.bookAnalysis.update = async (input) => input;
  prisma.bookAnalysis.updateMany = async (input) => input;
  prisma.bookAnalysisSection.update = async (input) => input;

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        return {
          markdown: `# ${args[0]}`,
          structuredData: {},
          normalizationWarnings: [],
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => "",
    },
    createNoopDocumentChapterService(),
  );

  try {
    await service.runFullAnalysis("analysis-no-overview");

    assert.deepEqual(sectionCalls.map((item) => item[0]).sort(), ["character_system", "plot_structure"]);
    assert.ok(sectionCalls.every((item) => item[6].overviewContext === null || item[6].overviewContext === undefined));
    assert.ok(sectionCalls.every((item) => item[6].userFocusInstruction === null));
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysis.updateMany = original.bookAnalysisUpdateMany;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
  }
});

test("BookAnalysisGenerationService runFullAnalysis continues after overview failure with null context", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    bookAnalysisUpdateMany: prisma.bookAnalysis.updateMany,
    sectionUpdate: prisma.bookAnalysisSection.update,
  };
  const analysisUpdates = [];
  const sectionCalls = [];
  const sectionUpdates = [];

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-overview-fail",
        status: "queued",
        summary: null,
        progress: 0,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: { content: "book-analysis source content ".repeat(80) },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        userFocusInstruction: null,
        sections: [
          { analysisId: "analysis-overview-fail", sectionKey: "overview", title: "拆书总览", frozen: false, focusInstruction: null },
          { analysisId: "analysis-overview-fail", sectionKey: "plot_structure", title: "剧情结构", frozen: false, focusInstruction: null },
        ],
      };
    }
    return { status: "running", cancelRequestedAt: null };
  };
  prisma.bookAnalysis.update = async (input) => {
    analysisUpdates.push(input);
    return input;
  };
  prisma.bookAnalysis.updateMany = async (input) => input;
  prisma.bookAnalysisSection.update = async (input) => {
    sectionUpdates.push(input);
    return input;
  };

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        if (args[0] === "overview") {
          throw new Error("overview failed");
        }
        return {
          markdown: "# 剧情结构",
          structuredData: {},
          normalizationWarnings: [],
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => "",
    },
    createNoopDocumentChapterService(),
  );

  try {
    await service.runFullAnalysis("analysis-overview-fail");

    assert.deepEqual(sectionCalls.map((item) => item[0]), ["overview", "plot_structure"]);
    assert.equal(sectionCalls[1][6].overviewContext, null);
    assert.ok(sectionUpdates.some((item) => item.where.analysisId_sectionKey.sectionKey === "overview" && item.data.status === "failed"));
    assert.ok(sectionUpdates.some((item) => item.where.analysisId_sectionKey.sectionKey === "plot_structure" && item.data.status === "succeeded"));
    const finalUpdate = analysisUpdates.find((item) => item.data.status === "failed" && item.data.progress === 1);
    assert.ok(finalUpdate);
    assert.match(finalUpdate.data.lastError, /overview failed/);
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysis.updateMany = original.bookAnalysisUpdateMany;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
  }
});

test("BookAnalysisGenerationService runFullAnalysis stops after overview when cancellation is requested", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    bookAnalysisUpdateMany: prisma.bookAnalysis.updateMany,
    sectionUpdate: prisma.bookAnalysisSection.update,
  };
  const analysisUpdates = [];
  const sectionCalls = [];
  let cancelCheckCount = 0;

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-cancel-after-overview",
        status: "queued",
        summary: null,
        progress: 0,
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: { content: "book-analysis source content ".repeat(80) },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        userFocusInstruction: null,
        sections: [
          { analysisId: "analysis-cancel-after-overview", sectionKey: "overview", title: "拆书总览", frozen: false, focusInstruction: null },
          { analysisId: "analysis-cancel-after-overview", sectionKey: "plot_structure", title: "剧情结构", frozen: false, focusInstruction: null },
        ],
      };
    }
    cancelCheckCount += 1;
    return {
      status: "running",
      cancelRequestedAt: cancelCheckCount >= 2 ? new Date("2026-06-24T00:00:00.000Z") : null,
    };
  };
  prisma.bookAnalysis.update = async (input) => {
    analysisUpdates.push(input);
    return input;
  };
  prisma.bookAnalysis.updateMany = async (input) => input;
  prisma.bookAnalysisSection.update = async (input) => input;

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        return {
          markdown: "# 拆书总览",
          structuredData: {},
          normalizationWarnings: [],
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => "",
    },
    createNoopDocumentChapterService(),
  );

  try {
    await service.runFullAnalysis("analysis-cancel-after-overview");

    assert.deepEqual(sectionCalls.map((item) => item[0]), ["overview"]);
    assert.ok(analysisUpdates.some((item) => item.data.status === "cancelled"));
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysis.updateMany = original.bookAnalysisUpdateMany;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
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
    createNoopDocumentChapterService(),
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

test("BookAnalysisGenerationService runSingleSection injects persisted overview context for dependent sections", async () => {
  const original = {
    bookAnalysisFindUnique: prisma.bookAnalysis.findUnique,
    bookAnalysisUpdate: prisma.bookAnalysis.update,
    sectionUpdate: prisma.bookAnalysisSection.update,
    sectionFindMany: prisma.bookAnalysisSection.findMany,
  };

  const sectionCalls = [];

  prisma.bookAnalysis.findUnique = async (input) => {
    if (input.include) {
      return {
        id: "analysis-single-dependent",
        status: "queued",
        summary: "旧摘要",
        cancelRequestedAt: null,
        documentVersionId: "version-1",
        documentVersion: {
          content: "这是用于拆书的正文。".repeat(80),
        },
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 4800,
        userFocusInstruction: "重点看新手可复用写法",
        sections: [
          {
            analysisId: "analysis-single-dependent",
            sectionKey: "overview",
            title: "拆书总览",
            frozen: false,
            aiContent: "# 拆书总览\n\n这是一部身份反转驱动的权谋文。",
            editedContent: null,
            structuredDataJson: JSON.stringify({
              oneLinePositioning: "身份反转驱动的权谋文",
              genreTags: ["权谋"],
              sellingPointTags: ["身份反转"],
              targetReaders: ["喜欢智斗的读者"],
              strengths: ["冲突明确"],
              weaknesses: ["信息密度偏高"],
            }),
          },
          {
            analysisId: "analysis-single-dependent",
            sectionKey: "plot_structure",
            title: "剧情结构",
            frozen: false,
            focusInstruction: "重点解释阶段推进",
          },
        ],
      };
    }
    return {
      status: "running",
      cancelRequestedAt: null,
    };
  };

  prisma.bookAnalysis.update = async (input) => input;
  prisma.bookAnalysisSection.update = async (input) => input;
  prisma.bookAnalysisSection.findMany = async () => ([{
    sectionKey: "plot_structure",
    status: "succeeded",
    frozen: false,
    editedContent: null,
    aiContent: "# 剧情结构",
  }]);

  const service = new BookAnalysisGenerationService(
    {
      getOrBuildSourceNotes: async () => ({
        notes: [],
        segmentCount: 1,
        cacheHit: true,
      }),
    },
    {
      generateSection: async (...args) => {
        sectionCalls.push(args);
        return {
          markdown: "# 剧情结构",
          structuredData: {},
          normalizationWarnings: [],
          evidence: [],
        };
      },
      generateOptimizedDraft: async () => "",
    },
    createNoopDocumentChapterService(),
  );

  try {
    await service.runSingleSection("analysis-single-dependent", "plot_structure");

    assert.equal(sectionCalls.length, 1);
    assert.equal(sectionCalls[0][0], "plot_structure");
    assert.equal(sectionCalls[0][6].userFocusInstruction, "重点看新手可复用写法");
    assert.equal(sectionCalls[0][6].sectionFocusInstruction, "重点解释阶段推进");
    assert.equal(sectionCalls[0][6].overviewContext.oneLinePositioning, "身份反转驱动的权谋文");
    assert.deepEqual(sectionCalls[0][6].overviewContext.genreTags, ["权谋"]);
    assert.deepEqual(sectionCalls[0][6].overviewContext.weaknesses, ["信息密度偏高"]);
  } finally {
    prisma.bookAnalysis.findUnique = original.bookAnalysisFindUnique;
    prisma.bookAnalysis.update = original.bookAnalysisUpdate;
    prisma.bookAnalysisSection.update = original.sectionUpdate;
    prisma.bookAnalysisSection.findMany = original.sectionFindMany;
  }
});

test("BookAnalysisCommandService createAnalysis freezes sections outside enabledSectionKeys", async () => {
  const originalTransaction = prisma.$transaction;
  const originalFindUnique = prisma.knowledgeDocument.findUnique;
  const originalEnqueue = BookAnalysisTaskQueue.prototype.enqueue;
  let createdAnalysis = null;
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
      create: async ({ data }) => {
        createdAnalysis = data;
        return {
          id: "analysis-1",
        };
      },
    },
    bookAnalysisSection: {
      createMany: async ({ data }) => {
        createdSections = data;
        return { count: data.length };
      },
    },
  });
  prisma.knowledgeDocument.findUnique = async () => ({
    id: "document-1",
    status: "enabled",
    activeVersionId: "version-1",
    title: "测试文档",
    versions: [{ id: "version-1", versionNumber: 1 }],
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
      userFocusInstruction: "重点观察开篇爽点",
      enabledSectionKeys: ["overview", "plot_structure", "character_system"],
    });

    assert.equal(createdAnalysis.userFocusInstruction, "重点观察开篇爽点");
    assert.equal(typeof createdAnalysis.budgetTokens, "number");
    assert.equal(createdAnalysis.usedTokens, 0);
    const sectionState = new Map(createdSections.map((section) => [section.sectionKey, section.frozen]));
    assert.equal(sectionState.get("overview"), false);
    assert.equal(sectionState.get("plot_structure"), false);
    assert.equal(sectionState.get("character_system"), false);
    assert.equal(sectionState.get("timeline"), true);
    assert.equal(sectionState.get("worldbuilding"), true);
    assert.equal(sectionState.get("market_highlights"), true);
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.knowledgeDocument.findUnique = originalFindUnique;
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

  prisma.novel.findUnique = async () => ({ id: "novel-1", title: "目标小说" });
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
      knowledgePublishService: {
        publishAnalysisDocument: async (input) => {
          assert.equal(input.sourceAnalysisId, "analysis-publish");
          assert.equal(input.buildTitle(3), "《目标小说》拆书 v3");
          return {
          id: "published-document-3",
          activeVersionNumber: 1,
          };
        },
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
          OR: [
            { sourceAnalysisId: "analysis-publish" },
            { documentId: "published-document-3" },
          ],
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

test("KnowledgePublishService reuses published analysis document by sourceAnalysisId", async () => {
  const originalFindUnique = prisma.knowledgeDocument.findUnique;
  const calls = [];
  let existingDocument = null;
  prisma.knowledgeDocument.findUnique = async ({ where }) => {
    calls.push({ type: "findUnique", where });
    return existingDocument;
  };

  const knowledgeService = {
    createDocument: async (input) => {
      calls.push({ type: "createDocument", input });
      return {
        id: "published-document-1",
        activeVersionNumber: 1,
      };
    },
    createDocumentVersion: async (documentId, input) => {
      calls.push({ type: "createDocumentVersion", documentId, input });
      return {
        id: documentId,
        activeVersionNumber: 3,
      };
    },
  };
  const service = new KnowledgePublishService(knowledgeService);

  try {
    await service.publishAnalysisDocument({
      sourceAnalysisId: "analysis-1",
      buildTitle: (version) => `《目标小说》拆书 v${version}`,
      fileName: "analysis.md",
      content: "发布内容",
    });
    assert.equal(calls[0].where.sourceAnalysisId, "analysis-1");
    assert.equal(calls[1].input.kind, "analysis_published");
    assert.equal(calls[1].input.sourceAnalysisId, "analysis-1");
    assert.equal(calls[1].input.title, "《目标小说》拆书 v1");

    existingDocument = {
      id: "published-document-1",
      activeVersionNumber: 2,
    };
    await service.publishAnalysisDocument({
      sourceAnalysisId: "analysis-1",
      buildTitle: (version) => `《目标小说》拆书 v${version}`,
      fileName: "analysis.md",
      content: "新版内容",
    });
    assert.equal(calls[3].documentId, "published-document-1");
    assert.equal(calls[3].input.title, "《目标小说》拆书 v3");
    assert.equal(calls[3].input.content, "新版内容");
  } finally {
    prisma.knowledgeDocument.findUnique = originalFindUnique;
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
    createNoopDocumentChapterService(),
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
    createNoopDocumentChapterService(),
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
