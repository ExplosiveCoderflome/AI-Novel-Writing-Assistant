const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDirectorTakeoverPlan,
} = require("../dist/services/novel/director/novelDirectorTakeover.js");
const {
  loadDirectorTakeoverState,
} = require("../dist/services/novel/director/novelDirectorTakeoverRuntime.js");
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
      checkpointType: "front10_ready",
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

test("continue_existing from structured ignores stale front10 checkpoint when the target range is not fully detailed", () => {
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
      checkpointType: "front10_ready",
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
        checkpointType: "front10_ready",
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
