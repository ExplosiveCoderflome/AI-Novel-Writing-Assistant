const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isTakeoverStructuredOutlineReadyForValidation,
  resolveDirectorTakeoverPlan,
} = require("../dist/services/novel/director/runtime/novelDirectorTakeover.js");
const {
  loadDirectorTakeoverState,
} = require("../dist/services/novel/director/runtime/novelDirectorTakeoverRuntime.js");
const { prisma } = require("../dist/db/prisma.js");

function buildSnapshot(overrides = {}) {
  return {
    hasStoryMacroPlan: true,
    hasBookContract: true,
    characterCount: 5,
    chapterCount: 12,
    volumeCount: 2,
    hasVolumeStrategyPlan: true,
    firstVolumeId: "volume_1",
    firstVolumeChapterCount: 10,
    firstVolumeBeatSheetReady: true,
    firstVolumePreparedChapterCount: 10,
    generatedChapterCount: 3,
    approvedChapterCount: 2,
    pendingRepairChapterCount: 1,
    ...overrides,
  };
}

function buildSceneCards(chapterId, targetWordCount = 2800) {
  return JSON.stringify({
    targetWordCount,
    lengthBudget: {
      targetWordCount,
      softMinWordCount: 2380,
      softMaxWordCount: 3220,
      hardMaxWordCount: 3500,
    },
    scenes: [
      {
        key: `${chapterId}-scene-1`,
        title: "起势",
        purpose: "推进本章目标",
        mustAdvance: ["主线"],
        mustPreserve: ["人物动机"],
        entryState: "进入冲突",
        exitState: "压力升级",
        forbiddenExpansion: [],
        targetWordCount: 900,
      },
      {
        key: `${chapterId}-scene-2`,
        title: "交锋",
        purpose: "升级冲突",
        mustAdvance: ["冲突"],
        mustPreserve: ["设定边界"],
        entryState: "压力升级",
        exitState: "代价显形",
        forbiddenExpansion: [],
        targetWordCount: 900,
      },
      {
        key: `${chapterId}-scene-3`,
        title: "落点",
        purpose: "形成章末推进",
        mustAdvance: ["章末钩子"],
        mustPreserve: ["后续入口"],
        entryState: "代价显形",
        exitState: "进入下一章",
        forbiddenExpansion: [],
        targetWordCount: 1000,
      },
    ],
  });
}

test("continue_existing from basic prefers repair continuation when pending fixes already exist", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "basic",
    strategy: "continue_existing",
    snapshot: buildSnapshot(),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "chapter_execution",
      volumeId: "volume_1",
      chapterId: null,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 4,
      nextChapterId: "chapter_4",
      remainingChapterCount: 7,
    },
  });

  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "pipeline");
  assert.equal(plan.effectiveStage, "quality_repair");
  assert.equal(plan.usesCurrentBatch, true);
  assert.deepEqual(plan.skipSteps, ["basic", "story_macro", "character", "outline", "structured", "chapter"]);
});

test("continue_existing routes back to structured outline when target range still has unprepared chapters", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "chapter",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      pendingRepairChapterCount: 0,
      hasUnpreparedChaptersInRange: true,
      missingExecutionContractOrders: [11, 12, 13, 14, 15],
    }),
    activePipelineJob: null,
    latestCheckpoint: null,
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 11,
      nextChapterId: "chapter_11",
      remainingChapterCount: 5,
    },
  });

  // 范围内仍有未细化章节时，继续模式应先回到节奏 / 拆章补齐，而不是进入章节执行。
  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.startPhase, "structured_outline");
  // 该路径不应清空正文（接管说明同步修正）。
  assert.ok(plan.impactNotes.some((note) => note.includes("保留已有正文")));
});

test("continue_existing keeps running the active batch even if later chapters are unprepared", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "chapter",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      pendingRepairChapterCount: 0,
      hasUnpreparedChaptersInRange: true,
    }),
    activePipelineJob: {
      id: "job_1",
      status: "running",
      currentStage: "writing",
      startOrder: 1,
      endOrder: 10,
    },
    latestCheckpoint: null,
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 5,
      nextChapterId: "chapter_5",
      remainingChapterCount: 6,
    },
  });

  // 有进行中的批次时不打断它，继续执行当前批次。
  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "chapter");
});

test("chapter sync structured outline is accepted by takeover validation readiness", () => {
  assert.equal(isTakeoverStructuredOutlineReadyForValidation({
    structuredOutlineRecoveryStep: "chapter_sync",
  }), true);
  assert.equal(isTakeoverStructuredOutlineReadyForValidation({
    structuredOutlineRecoveryStep: "chapter_detail_bundle",
  }), false);
});

test("continue_existing from story macro only fills missing character step", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "story_macro",
    strategy: "continue_existing",
    snapshot: buildSnapshot({ characterCount: 0 }),
    latestCheckpoint: null,
    executableRange: null,
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "character");
  assert.equal(plan.effectiveStage, "character_setup");
  assert.equal(plan.startPhase, "character_setup");
});

test("continue_existing from structured ignores stale chapter_range checkpoint when the target range is not fully detailed", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "structured",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      firstVolumePreparedChapterCount: 4,
      structuredOutlineRecoveryStep: "chapter_detail_bundle",
      pendingRepairChapterCount: 0,
      approvedChapterCount: 0,
    }),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "chapter_execution",
      volumeId: "volume_1",
      chapterId: null,
    },
    executableRange: null,
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.effectiveStage, "structured_outline");
});

test("continue_existing from chapter backfills structured outline when repair signals exist but no executable range is ready", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "chapter",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      firstVolumePreparedChapterCount: 3,
      structuredOutlineRecoveryStep: "chapter_detail_bundle",
      pendingRepairChapterCount: 3,
    }),
    latestCheckpoint: null,
    executableRange: null,
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.effectiveStage, "structured_outline");
});

test("continue_existing from structured keeps partially detailed requested scope out of quality repair", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "structured",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      firstVolumePreparedChapterCount: 4,
      structuredOutlineRecoveryStep: "chapter_detail_bundle",
      pendingRepairChapterCount: 3,
    }),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "quality_repair",
      volumeId: "volume_1",
      chapterId: "chapter_2",
    },
    executableRange: {
      startOrder: 1,
      endOrder: 4,
      totalChapterCount: 4,
      nextChapterOrder: 2,
      nextChapterId: "chapter_2",
    },
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.effectiveStage, "structured_outline");
});

test("loadDirectorTakeoverState does not trust stale auto execution state when only part of the range is detailed", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    generationJobFindFirst: prisma.generationJob.findFirst,
  };
  const completeSceneCards = buildSceneCards("chapter_1");
  const workspace = {
    volumes: [
      {
        id: "volume_1",
        sortOrder: 1,
        title: "第一卷",
        chapters: [
          {
            id: "chapter_1",
            volumeId: "volume_1",
            chapterOrder: 1,
            title: "第一章",
            summary: "第一章摘要",
            purpose: "第一章目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开无关支线",
            taskSheet: "第一章任务单",
            sceneCards: completeSceneCards,
            payoffRefs: [],
          },
          {
            id: "chapter_2",
            volumeId: "volume_1",
            chapterOrder: 2,
            title: "第二章",
            summary: "第二章摘要",
            purpose: null,
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            taskSheet: null,
            sceneCards: null,
            payoffRefs: [],
          },
        ],
      },
    ],
    beatSheets: [
      {
        volumeId: "volume_1",
        beats: [
          {
            key: "beat_1",
            label: "起势",
            summary: "覆盖前两章",
            chapterSpanHint: "1-2章",
            expectedChapterCount: 2,
          },
        ],
      },
    ],
  };

  prisma.novel.findUnique = async () => ({
    id: "novel_takeover_demo",
    title: "Neon Archive",
    description: "A courier discovers a hidden rule-bound city underworld.",
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: "[]",
    genreId: null,
    primaryStoryModeId: null,
    secondaryStoryModeId: null,
    worldId: null,
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: null,
    emotionIntensity: "medium",
    aiFreedom: "medium",
    defaultChapterLength: 3000,
    estimatedChapterCount: 30,
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
    resourceReadyScore: null,
    sourceNovelId: null,
    sourceKnowledgeDocumentId: null,
    continuationBookAnalysisId: null,
    continuationBookAnalysisSections: null,
    bookContract: {
      id: "contract_1",
      novelId: "novel_takeover_demo",
      readingPromise: "promise",
      protagonistFantasy: "fantasy",
      coreSellingPoint: "selling",
      chapter3Payoff: "c3",
      chapter10Payoff: "c10",
      chapter30Payoff: "c30",
      escalationLadder: "ladder",
      relationshipMainline: "relation",
      absoluteRedLinesJson: "[]",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  });
  prisma.chapter.findMany = async () => [
    {
      id: "chapter_1",
      order: 1,
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      conflictLevel: 5,
      revealLevel: 3,
      targetWordCount: 2800,
      mustAvoid: "不要展开无关支线",
      taskSheet: "第一章任务单",
      sceneCards: completeSceneCards,
    },
    {
      id: "chapter_2",
      order: 2,
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: null,
      mustAvoid: null,
      taskSheet: null,
      sceneCards: null,
    },
  ];
  prisma.generationJob.findFirst = async () => null;

  try {
    const state = await loadDirectorTakeoverState({
      novelId: "novel_takeover_demo",
      getStoryMacroPlan: async () => ({
        storyInput: "story",
        decomposition: { premise: "premise" },
      }),
      getDirectorAssetSnapshot: async () => ({
        characterCount: 4,
        chapterCount: 2,
        volumeCount: 1,
        hasVolumeStrategyPlan: true,
        firstVolumeId: "volume_1",
        firstVolumeChapterCount: 2,
        volumeChapterRanges: [{ volumeOrder: 1, startOrder: 1, endOrder: 2 }],
        structuredOutlineChapterOrders: [1, 2],
      }),
      getVolumeWorkspace: async () => workspace,
      findActiveAutoDirectorTask: async () => null,
      findLatestAutoDirectorTask: async () => ({
        id: "task_stale_ready",
        checkpointType: "chapter_batch_ready",
        checkpointSummary: "旧任务认为前 2 章可执行",
        resumeTargetJson: JSON.stringify({ volumeId: "volume_1", chapterId: "chapter_1" }),
        seedPayloadJson: JSON.stringify({
          autoExecutionPlan: { mode: "chapter_range", startOrder: 1, endOrder: 2 },
          autoExecution: {
            enabled: true,
            mode: "chapter_range",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            firstChapterId: "chapter_1",
            nextChapterId: "chapter_1",
            nextChapterOrder: 1,
          },
        }),
      }),
    });

    assert.equal(state.executableRange, null);
    assert.equal(state.snapshot.structuredOutlineRecoveryStep, "chapter_detail_bundle");
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.generationJob.findFirst = originals.generationJobFindFirst;
  }
});

test("loadDirectorTakeoverState treats full-book autopilot outline seeds as JIT executable", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    generationJobFindFirst: prisma.generationJob.findFirst,
  };
  const workspace = {
    volumes: [
      {
        id: "volume_1",
        sortOrder: 1,
        title: "开局卷",
        chapters: [
          {
            id: "chapter_1",
            volumeId: "volume_1",
            chapterOrder: 1,
            title: "拾起异虫",
            summary: "主角救下濒死毛毛虫。",
            purpose: null,
            exclusiveEvent: null,
            endingState: null,
            nextChapterEntryState: null,
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            payoffRefs: [],
            taskSheet: null,
            sceneCards: null,
          },
          {
            id: "chapter_2",
            volumeId: "volume_1",
            chapterOrder: 2,
            title: "街头护虫",
            summary: "主角当众护住毛毛虫。",
            purpose: null,
            exclusiveEvent: null,
            endingState: null,
            nextChapterEntryState: null,
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            payoffRefs: [],
            taskSheet: null,
            sceneCards: null,
          },
        ],
      },
    ],
    beatSheets: [
      {
        volumeId: "volume_1",
        beats: [{ key: "beat_1", label: "开局受辱", chapterSpanHint: "1-2" }],
      },
    ],
  };

  prisma.novel.findUnique = async () => ({
    id: "novel_takeover_jit",
    title: "JIT Autopilot",
    description: "A beast-taming opening.",
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: "[]",
    genreId: null,
    primaryStoryModeId: null,
    secondaryStoryModeId: null,
    worldId: null,
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: null,
    emotionIntensity: "medium",
    aiFreedom: "medium",
    defaultChapterLength: 3000,
    estimatedChapterCount: 30,
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
    resourceReadyScore: null,
    sourceNovelId: null,
    sourceKnowledgeDocumentId: null,
    continuationBookAnalysisId: null,
    continuationBookAnalysisSections: null,
    bookContract: {
      id: "contract_jit",
      novelId: "novel_takeover_jit",
      readingPromise: "promise",
      protagonistFantasy: "fantasy",
      coreSellingPoint: "selling",
      chapter3Payoff: "c3",
      chapter10Payoff: "c10",
      chapter30Payoff: "c30",
      escalationLadder: "ladder",
      relationshipMainline: "relation",
      absoluteRedLinesJson: "[]",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  });
  prisma.chapter.findMany = async () => [
    {
      id: "chapter_1",
      order: 1,
      expectation: "主角救下濒死毛毛虫，承受全城嘲笑。",
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
      sceneCards: null,
    },
    {
      id: "chapter_2",
      order: 2,
      expectation: "反派羞辱主角，毛毛虫出现异常蜕变征兆。",
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
      sceneCards: null,
    },
  ];
  prisma.generationJob.findFirst = async () => null;

  try {
    const state = await loadDirectorTakeoverState({
      novelId: "novel_takeover_jit",
      getStoryMacroPlan: async () => ({
        storyInput: "story",
        decomposition: { premise: "premise" },
      }),
      getDirectorAssetSnapshot: async () => ({
        characterCount: 4,
        chapterCount: 2,
        volumeCount: 1,
        hasVolumeStrategyPlan: true,
        firstVolumeId: "volume_1",
        firstVolumeChapterCount: 2,
        volumeChapterRanges: [{ volumeOrder: 1, startOrder: 1, endOrder: 2 }],
        structuredOutlineChapterOrders: [1, 2],
      }),
      getVolumeWorkspace: async () => workspace,
      findActiveAutoDirectorTask: async () => null,
      findLatestAutoDirectorTask: async () => ({
        id: "task_full_book_jit",
        checkpointType: "chapter_batch_ready",
        checkpointSummary: "ready",
        resumeTargetJson: JSON.stringify({ chapterId: "chapter_1", volumeId: "volume_1" }),
        lastError: null,
        seedPayloadJson: JSON.stringify({
          runMode: "full_book_autopilot",
          autoExecutionPlan: { mode: "chapter_range", startOrder: 1, endOrder: 2 },
          autoExecution: {
            enabled: true,
            mode: "chapter_range",
            startOrder: 1,
            endOrder: 2,
            totalChapterCount: 2,
            firstChapterId: "chapter_1",
            nextChapterId: "chapter_1",
            nextChapterOrder: 1,
            skippedChapterIds: [],
            skippedChapterOrders: [],
          },
        }),
      }),
    });

    assert.equal(state.snapshot.hasUnpreparedChaptersInRange, false);
    assert.deepEqual(state.snapshot.missingExecutionContractOrders, []);
    assert.equal(state.executableRange?.startOrder, 1);
    assert.equal(state.executableRange?.endOrder, 2);
    assert.equal(state.executableRange?.nextChapterOrder, 1);
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.generationJob.findFirst = originals.generationJobFindFirst;
  }
});

test("loadDirectorTakeoverState applies requested book scope before trusting stale execution state", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    generationJobFindFirst: prisma.generationJob.findFirst,
  };
  const completeSceneCards = buildSceneCards("chapter_1");
  const workspace = {
    volumes: [
      {
        id: "volume_1",
        sortOrder: 1,
        title: "第一卷",
        chapters: [
          {
            id: "chapter_1",
            volumeId: "volume_1",
            chapterOrder: 1,
            title: "第一章",
            summary: "第一章摘要",
            purpose: "第一章目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开无关支线",
            taskSheet: "第一章任务单",
            sceneCards: completeSceneCards,
            payoffRefs: [],
          },
          {
            id: "chapter_2",
            volumeId: "volume_1",
            chapterOrder: 2,
            title: "第二章",
            summary: "第二章摘要",
            purpose: null,
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            taskSheet: null,
            sceneCards: null,
            payoffRefs: [],
          },
        ],
      },
    ],
    beatSheets: [
      {
        volumeId: "volume_1",
        beats: [
          {
            key: "beat_1",
            label: "起势",
            summary: "覆盖前两章",
            chapterSpanHint: "1-2章",
            expectedChapterCount: 2,
          },
        ],
      },
    ],
  };

  prisma.novel.findUnique = async () => ({
    id: "novel_takeover_book_scope",
    title: "Neon Archive",
    description: "A courier discovers a hidden rule-bound city underworld.",
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: "[]",
    genreId: null,
    primaryStoryModeId: null,
    secondaryStoryModeId: null,
    worldId: null,
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: null,
    emotionIntensity: "medium",
    aiFreedom: "medium",
    defaultChapterLength: 3000,
    estimatedChapterCount: 30,
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
    resourceReadyScore: null,
    sourceNovelId: null,
    sourceKnowledgeDocumentId: null,
    continuationBookAnalysisId: null,
    continuationBookAnalysisSections: null,
    bookContract: {
      id: "contract_1",
      novelId: "novel_takeover_book_scope",
      readingPromise: "promise",
      protagonistFantasy: "fantasy",
      coreSellingPoint: "selling",
      chapter3Payoff: "c3",
      chapter10Payoff: "c10",
      chapter30Payoff: "c30",
      escalationLadder: "ladder",
      relationshipMainline: "relation",
      absoluteRedLinesJson: "[]",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  });
  prisma.chapter.findMany = async () => [
    {
      id: "chapter_1",
      order: 1,
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      conflictLevel: 5,
      revealLevel: 3,
      targetWordCount: 2800,
      mustAvoid: "不要展开无关支线",
      taskSheet: "第一章任务单",
      sceneCards: completeSceneCards,
    },
    {
      id: "chapter_2",
      order: 2,
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: null,
      mustAvoid: null,
      taskSheet: null,
      sceneCards: null,
    },
  ];
  prisma.generationJob.findFirst = async () => null;

  try {
    const state = await loadDirectorTakeoverState({
      novelId: "novel_takeover_book_scope",
      autoExecutionPlan: { mode: "book" },
      getStoryMacroPlan: async () => ({
        storyInput: "story",
        decomposition: { premise: "premise" },
      }),
      getDirectorAssetSnapshot: async () => ({
        characterCount: 4,
        chapterCount: 2,
        volumeCount: 1,
        hasVolumeStrategyPlan: true,
        firstVolumeId: "volume_1",
        firstVolumeChapterCount: 2,
        volumeChapterRanges: [{ volumeOrder: 1, startOrder: 1, endOrder: 2 }],
        structuredOutlineChapterOrders: [1, 2],
      }),
      getVolumeWorkspace: async () => workspace,
      findActiveAutoDirectorTask: async () => null,
      findLatestAutoDirectorTask: async () => ({
        id: "task_stale_single_ready",
        checkpointType: "chapter_batch_ready",
        checkpointSummary: "旧任务只覆盖第 1 章",
        resumeTargetJson: JSON.stringify({ volumeId: "volume_1", chapterId: "chapter_1" }),
        seedPayloadJson: JSON.stringify({
          autoExecutionPlan: { mode: "chapter_range", startOrder: 1, endOrder: 1 },
          autoExecution: {
            enabled: true,
            mode: "chapter_range",
            startOrder: 1,
            endOrder: 1,
            totalChapterCount: 1,
            firstChapterId: "chapter_1",
            nextChapterId: "chapter_1",
            nextChapterOrder: 1,
          },
        }),
      }),
    });

    assert.equal(state.executableRange, null);
    assert.equal(state.snapshot.structuredOutlineRecoveryStep, "chapter_detail_bundle");
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.generationJob.findFirst = originals.generationJobFindFirst;
  }
});

test("loadDirectorTakeoverState advances stale no-chapters cursor to the next pending chapter", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    generationJobFindFirst: prisma.generationJob.findFirst,
  };
  const completeSceneCards = buildSceneCards("chapter_1");
  const workspace = {
    volumes: [
      {
        id: "volume_1",
        sortOrder: 1,
        title: "第一卷",
        chapters: [
          {
            id: "chapter_1",
            volumeId: "volume_1",
            chapterOrder: 1,
            title: "第一章",
            summary: "第一章摘要",
            purpose: "第一章目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开无关支线",
            taskSheet: "第一章任务单",
            sceneCards: completeSceneCards,
            payoffRefs: [],
          },
          {
            id: "chapter_2",
            volumeId: "volume_1",
            chapterOrder: 2,
            title: "第二章",
            summary: "第二章摘要",
            purpose: "第二章目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开无关支线",
            taskSheet: "第二章任务单",
            sceneCards: buildSceneCards("chapter_2"),
            payoffRefs: [],
          },
          {
            id: "chapter_3",
            volumeId: "volume_1",
            chapterOrder: 3,
            title: "第三章",
            summary: "第三章摘要",
            purpose: "第三章目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开无关支线",
            taskSheet: "第三章任务单",
            sceneCards: buildSceneCards("chapter_3"),
            payoffRefs: [],
          },
        ],
      },
    ],
    beatSheets: [
      {
        volumeId: "volume_1",
        beats: [
          {
            key: "beat_1",
            label: "起势",
            summary: "覆盖前三章",
            chapterSpanHint: "1-3章",
            expectedChapterCount: 3,
          },
        ],
      },
    ],
  };

  prisma.novel.findUnique = async () => ({
    id: "novel_takeover_continue_cursor",
    title: "Neon Archive",
    description: "A courier discovers a hidden rule-bound city underworld.",
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: "[]",
    genreId: null,
    primaryStoryModeId: null,
    secondaryStoryModeId: null,
    worldId: null,
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: null,
    emotionIntensity: "medium",
    aiFreedom: "medium",
    defaultChapterLength: 3000,
    estimatedChapterCount: 30,
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
    resourceReadyScore: null,
    sourceNovelId: null,
    sourceKnowledgeDocumentId: null,
    continuationBookAnalysisId: null,
    continuationBookAnalysisSections: null,
    bookContract: {
      id: "contract_1",
      novelId: "novel_takeover_continue_cursor",
      readingPromise: "promise",
      protagonistFantasy: "fantasy",
      coreSellingPoint: "selling",
      chapter3Payoff: "c3",
      chapter10Payoff: "c10",
      chapter30Payoff: "c30",
      escalationLadder: "ladder",
      relationshipMainline: "relation",
      absoluteRedLinesJson: "[]",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  });
  prisma.chapter.findMany = async () => [
    {
      id: "chapter_1",
      order: 1,
      generationState: "approved",
      chapterStatus: "completed",
      content: "第一章正文",
      conflictLevel: 5,
      revealLevel: 3,
      targetWordCount: 2800,
      mustAvoid: "不要展开无关支线",
      taskSheet: "第一章任务单",
      sceneCards: completeSceneCards,
    },
    {
      id: "chapter_2",
      order: 2,
      generationState: "reviewed",
      chapterStatus: "needs_repair",
      content: "第二章待修正文",
      conflictLevel: 5,
      revealLevel: 3,
      targetWordCount: 2800,
      mustAvoid: "不要展开无关支线",
      taskSheet: "第二章任务单",
      sceneCards: buildSceneCards("chapter_2"),
    },
    {
      id: "chapter_3",
      order: 3,
      generationState: "planned",
      chapterStatus: "unplanned",
      content: "",
      conflictLevel: 5,
      revealLevel: 3,
      targetWordCount: 2800,
      mustAvoid: "不要展开无关支线",
      taskSheet: "第三章任务单",
      sceneCards: buildSceneCards("chapter_3"),
    },
  ];
  prisma.generationJob.findFirst = async () => null;

  try {
    const state = await loadDirectorTakeoverState({
      novelId: "novel_takeover_continue_cursor",
      getStoryMacroPlan: async () => ({
        storyInput: "story",
        decomposition: { premise: "premise" },
      }),
      getDirectorAssetSnapshot: async () => ({
        characterCount: 4,
        chapterCount: 3,
        volumeCount: 1,
        hasVolumeStrategyPlan: true,
        firstVolumeId: "volume_1",
        firstVolumeChapterCount: 3,
        volumeChapterRanges: [{ volumeOrder: 1, startOrder: 1, endOrder: 3 }],
        structuredOutlineChapterOrders: [1, 2, 3],
      }),
      getVolumeWorkspace: async () => workspace,
      findActiveAutoDirectorTask: async () => null,
      findLatestAutoDirectorTask: async () => ({
        id: "task_stale_continue_cursor",
        checkpointType: null,
        checkpointSummary: "Too small: expected string to have >=6 characters",
        resumeTargetJson: JSON.stringify({ volumeId: "volume_1", chapterId: "chapter_2" }),
        lastError: "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。",
        seedPayloadJson: JSON.stringify({
          autoExecutionPlan: { mode: "chapter_range", startOrder: 1, endOrder: 3 },
          autoExecution: {
            enabled: true,
            mode: "chapter_range",
            startOrder: 1,
            endOrder: 3,
            totalChapterCount: 3,
            firstChapterId: "chapter_1",
            nextChapterId: "chapter_2",
            nextChapterOrder: 2,
            skippedChapterIds: [],
            skippedChapterOrders: [],
            qualityDebtChapterIds: [],
            qualityDebtChapterOrders: [],
            qualityDebtSummaries: [],
          },
        }),
      }),
    });

    assert.equal(state.executableRange?.nextChapterOrder, 3);
    assert.deepEqual(state.latestAutoExecutionState?.skippedChapterOrders, [2]);
    assert.deepEqual(state.latestAutoExecutionState?.qualityDebtChapterOrders, [2]);
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.generationJob.findFirst = originals.generationJobFindFirst;
  }
});

test("restart_current_step on pipeline clears repair outputs before rerun", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "pipeline",
    strategy: "restart_current_step",
    snapshot: buildSnapshot(),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "quality_repair",
      volumeId: "volume_1",
      chapterId: "chapter_3",
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 4,
      nextChapterId: "chapter_4",
      remainingChapterCount: 7,
    },
  });

  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "pipeline");
  assert.equal(plan.effectiveStage, "quality_repair");
  assert.equal(plan.usesCurrentBatch, false);
  assert.match(plan.effectSummary, /清空当前质量修复结果|重新审校/);
  assert.deepEqual(plan.impactNotes, ["保留当前章节正文。", "会重新进入自动审校与修复。"]);
});
