const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildVolumeChapterDetailContextBlocks,
} = require("../dist/prompting/prompts/novel/volume/contextBlocks.js");
const {
  buildChapterPlanContextBlocks,
} = require("../dist/services/planner/plannerContextBlocks.js");
const {
  buildPlannerConflictLevelAnchorContext,
} = require("../dist/services/planner/plannerContextHelpers.js");
const {
  mergeChapterDetail,
  mergeChapterList,
} = require("../dist/services/novel/volume/volumeGenerationHelpers.js");

const now = new Date(0).toISOString();

function createChapter(overrides = {}) {
  return {
    id: overrides.id ?? `chapter-${overrides.chapterOrder ?? 1}`,
    volumeId: "volume-1",
    chapterId: null,
    chapterOrder: overrides.chapterOrder ?? 1,
    beatKey: overrides.beatKey ?? "beat-1",
    title: overrides.title ?? `第${overrides.chapterOrder ?? 1}章`,
    summary: overrides.summary ?? "章节摘要",
    purpose: null,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: overrides.conflictLevel ?? null,
    conflictLevelSource: overrides.conflictLevelSource ?? null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    styleContract: null,
    payoffRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createVolume(overrides = {}) {
  return {
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "卷摘要",
    openingHook: null,
    mainPromise: null,
    primaryPressureSource: null,
    coreSellingPoint: null,
    escalationMode: null,
    protagonistChange: null,
    midVolumeRisk: null,
    climax: null,
    payoffType: null,
    nextVolumeHook: null,
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters: overrides.chapters ?? [
      createChapter({ chapterOrder: 1, conflictLevel: 20, conflictLevelSource: "ai" }),
      createChapter({ chapterOrder: 2, conflictLevel: 80, conflictLevelSource: "user" }),
      createChapter({ chapterOrder: 3, conflictLevel: 60, conflictLevelSource: "ai" }),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createDocument(volume = createVolume()) {
  return {
    novelId: "novel-1",
    workspaceVersion: "v2",
    volumes: [volume],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: true,
      canGenerateBeatSheet: true,
      canGenerateChapterList: true,
      blockingReasons: [],
    },
    derivedOutline: "",
    derivedStructuredOutline: "",
    source: "volume",
    activeVersionId: null,
  };
}

const beatSheet = {
  volumeId: "volume-1",
  volumeSortOrder: 1,
  status: "generated",
  beats: [{
    key: "beat-1",
    label: "开局",
    summary: "开局节奏段",
    chapterSpanHint: "3章",
    mustDeliver: ["建立目标"],
  }],
};

test("chapter list regeneration preserves user anchored conflict levels", () => {
  const merged = mergeChapterList(
    createDocument(),
    "volume-1",
    beatSheet,
    [{
      beatKey: "beat-1",
      beatLabel: "开局",
      chapterCount: 3,
      chapters: [
        { title: "新一", summary: "新摘要一" },
        { title: "新二", summary: "新摘要二" },
        { title: "新三", summary: "新摘要三" },
      ],
    }],
  );

  const anchored = merged.volumes[0].chapters[1];
  assert.equal(anchored.conflictLevel, 80);
  assert.equal(anchored.conflictLevelSource, "user");
  assert.equal(anchored.title, "新二");
});

test("chapter detail merge keeps user anchored conflict level while applying other fields", () => {
  const merged = mergeChapterDetail({
    document: createDocument(),
    targetVolumeId: "volume-1",
    targetChapterId: "chapter-2",
    detailMode: "boundary",
    generatedDetail: {
      conflictLevel: 35,
      revealLevel: 44,
      targetWordCount: 2600,
      mustAvoid: "不要跑题",
      payoffRefs: ["payoff-1"],
    },
  });

  const anchored = merged.volumes[0].chapters[1];
  assert.equal(anchored.conflictLevel, 80);
  assert.equal(anchored.conflictLevelSource, "user");
  assert.equal(anchored.revealLevel, 44);
  assert.equal(anchored.targetWordCount, 2600);
});

test("volume chapter detail prompt context includes user anchor and adjacent trend", () => {
  const volume = createVolume();
  const blocks = buildVolumeChapterDetailContextBlocks({
    novel: {
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      estimatedChapterCount: 3,
      narrativePov: null,
      pacePreference: null,
      emotionIntensity: null,
      storyModePromptBlock: null,
      genre: null,
      characters: [],
    },
    workspace: {
      novelId: "novel-1",
      workspaceVersion: "v2",
      volumes: [volume],
      strategyPlan: null,
      critiqueReport: null,
      beatSheets: [beatSheet],
      rebalanceDecisions: [],
      readiness: createDocument().readiness,
      source: "volume",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: volume,
    targetBeatSheet: beatSheet,
    targetChapter: volume.chapters[1],
    detailMode: "boundary",
  });

  const curveBlock = blocks.find((block) => block.id === "conflict_level_curve");
  assert.ok(curveBlock);
  assert.match(curveBlock.content, /target chapter 2/);
  assert.match(curveBlock.content, /constraint=用户锚定，不可更改/);
  assert.match(curveBlock.content, /fromPrevious=rise/);
  assert.match(curveBlock.content, /toNext=fall/);
});

test("replan context carries user anchored conflict constraints", () => {
  const anchorText = buildPlannerConflictLevelAnchorContext([{
    sortOrder: 1,
    title: "第一卷",
    summary: null,
    mainPromise: null,
    climax: null,
    openPayoffs: [],
    updatedAt: now,
    chapters: [
      { chapterOrder: 1, title: "第一章", summary: null, conflictLevel: 20, conflictLevelSource: "ai" },
      { chapterOrder: 2, title: "第二章", summary: null, conflictLevel: 80, conflictLevelSource: "user" },
      { chapterOrder: 3, title: "第三章", summary: null, conflictLevel: 60, conflictLevelSource: "ai" },
    ],
  }], [2]);
  const blocks = buildChapterPlanContextBlocks({
    novelTitle: "测试小说",
    description: null,
    genreName: null,
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    narrativePov: null,
    pacePreference: null,
    emotionIntensity: null,
    styleTone: null,
    chapterExpectation: "目标",
    chapterTaskSheet: null,
    chapterTargetWordCount: null,
    bible: null,
    styleEngine: null,
    outline: null,
    structuredOutline: null,
    mappedVolumes: [],
    bookPlan: "无",
    arcPlans: "无",
    characters: "无",
    recentSummaries: "无",
    plotBeats: "无",
    stateSnapshot: "无",
    openAuditIssues: "无",
    recentDecisions: "无",
    characterDynamicsSummary: "无",
    characterVolumeAssignments: "无",
    characterRelationStages: "无",
    characterCandidateGuards: "无",
    defaultMetadata: "无",
    stateDrivenDirective: "无",
    stateDrivenGoal: "无",
    replanContext: "重规划窗口：第 2 章",
    replanConflictLevelAnchors: anchorText,
    storyMacroSummary: "无",
    currentVolumeWindow: "无",
    payoffLedgerSummary: "无",
    storyModeBlock: "无",
  });

  const replanBlock = blocks.find((block) => block.id === "replan_context");
  assert.ok(replanBlock);
  assert.match(replanBlock.content, /第2章《第二章》/);
  assert.match(replanBlock.content, /用户锚定，不可更改/);
  assert.match(replanBlock.content, /相对上一章=上升/);
  assert.match(replanBlock.content, /相对下一章=下降/);
});
