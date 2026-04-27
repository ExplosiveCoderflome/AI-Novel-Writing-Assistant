const test = require("node:test");
const assert = require("node:assert/strict");

const { runDirectorStructuredOutlinePhase } = require("../dist/services/novel/director/novelDirectorPipelinePhases.js");
const { prisma } = require("../dist/db/prisma.js");

function createChapter(id, order, title) {
  return {
    id,
    chapterOrder: order,
    title,
    summary: `${title} summary`,
    purpose: null,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBeatSheet() {
  return {
    volumeId: "volume-1",
    volumeSortOrder: 1,
    status: "generated",
    beats: [
      {
        key: "opening",
        label: "Opening",
        summary: "Opening summary",
        chapterSpanHint: "1-2章",
        mustDeliver: ["Opening"],
      },
    ],
  };
}

function createSceneCards(chapter) {
  return JSON.stringify({
    targetWordCount: chapter.targetWordCount ?? 3000,
    lengthBudget: {
      targetWordCount: chapter.targetWordCount ?? 3000,
      softMinWordCount: 2500,
      softMaxWordCount: 3400,
      hardMaxWordCount: 3800,
    },
    scenes: [
      {
        key: `${chapter.id}-scene-1`,
        title: `${chapter.title} scene 1`,
        purpose: "推进本章目标",
        mustAdvance: ["主线"],
        mustPreserve: ["人物动机"],
        entryState: "进入冲突",
        exitState: "压力升级",
        forbiddenExpansion: [],
        targetWordCount: 1000,
      },
      {
        key: `${chapter.id}-scene-2`,
        title: `${chapter.title} scene 2`,
        purpose: "升级选择压力",
        mustAdvance: ["冲突"],
        mustPreserve: ["设定边界"],
        entryState: "压力升级",
        exitState: "代价显形",
        forbiddenExpansion: [],
        targetWordCount: 1000,
      },
      {
        key: `${chapter.id}-scene-3`,
        title: `${chapter.title} scene 3`,
        purpose: "形成章末钩子",
        mustAdvance: ["章末推进"],
        mustPreserve: ["后续入口"],
        entryState: "代价显形",
        exitState: "进入下一章",
        forbiddenExpansion: [],
        targetWordCount: 1000,
      },
    ],
  });
}

function applyCompleteChapterDetail(chapter) {
  chapter.purpose = `${chapter.title} purpose`;
  chapter.exclusiveEvent = `${chapter.title} exclusive event`;
  chapter.endingState = `${chapter.title} ending state`;
  chapter.nextChapterEntryState = `${chapter.title} next entry`;
  chapter.conflictLevel = 4;
  chapter.revealLevel = 3;
  chapter.targetWordCount = 3000;
  chapter.mustAvoid = `${chapter.title} avoid`;
  chapter.taskSheet = `${chapter.title} task sheet`;
  chapter.sceneCards = createSceneCards(chapter);
}

function mapWorkspaceChapterToExecution(chapter) {
  return {
    id: chapter.id,
    order: chapter.chapterOrder,
    content: "",
    generationState: "planned",
    chapterStatus: "unplanned",
    conflictLevel: chapter.conflictLevel,
    revealLevel: chapter.revealLevel,
    targetWordCount: chapter.targetWordCount,
    mustAvoid: chapter.mustAvoid,
    taskSheet: chapter.taskSheet,
    sceneCards: chapter.sceneCards,
  };
}

test("runDirectorStructuredOutlinePhase persists chapter detail after each completed chapter", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    transaction: prisma.$transaction,
  };
  const baseWorkspace = {
    novelId: "novel-demo",
    workspaceVersion: "v2",
    source: "volume",
    activeVersionId: "version-1",
    derivedOutline: "",
    derivedStructuredOutline: "",
    readiness: {},
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [createBeatSheet()],
    rebalanceDecisions: [],
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        title: "Volume 1",
        summary: "",
        openingHook: "",
        mainPromise: "",
        primaryPressureSource: "",
        coreSellingPoint: "",
        escalationMode: "",
        protagonistChange: "",
        midVolumeRisk: "",
        climax: "",
        payoffType: "",
        nextVolumeHook: "",
        resetPoint: "",
        openPayoffs: [],
        status: "draft",
        chapters: [
          { ...createChapter("chapter-1", 1, "Chapter 1"), beatKey: "opening" },
          { ...createChapter("chapter-2", 2, "Chapter 2"), beatKey: "opening" },
        ],
      },
    ],
  };

  const syncedSnapshots = [];
  const resetFindManyCalls = [];
  const resetDeletions = [];
  let lastSyncedWorkspace = clone(baseWorkspace);
  const rebuildCalls = [];
  prisma.chapter.findMany = async (input) => {
    resetFindManyCalls.push(input);
    return [
      { id: "chapter-1" },
      { id: "chapter-2" },
    ];
  };
  prisma.$transaction = async (callback) => callback({
    chapter: {
      updateMany: async (input) => {
        resetDeletions.push(["chapter", input]);
        return { count: input.where.id.in.length };
      },
    },
    chapterSummary: { deleteMany: async (input) => resetDeletions.push(["chapterSummary", input]) },
    consistencyFact: { deleteMany: async (input) => resetDeletions.push(["consistencyFact", input]) },
    characterTimeline: { deleteMany: async (input) => resetDeletions.push(["characterTimeline", input]) },
    characterCandidate: { deleteMany: async (input) => resetDeletions.push(["characterCandidate", input]) },
    characterFactionTrack: { deleteMany: async (input) => resetDeletions.push(["characterFactionTrack", input]) },
    characterRelationStage: { deleteMany: async (input) => resetDeletions.push(["characterRelationStage", input]) },
    qualityReport: { deleteMany: async (input) => resetDeletions.push(["qualityReport", input]) },
    auditReport: { deleteMany: async (input) => resetDeletions.push(["auditReport", input]) },
    stateChangeProposal: { deleteMany: async (input) => resetDeletions.push(["stateChangeProposal", input]) },
    openConflict: { deleteMany: async (input) => resetDeletions.push(["openConflict", input]) },
    storyStateSnapshot: { deleteMany: async (input) => resetDeletions.push(["storyStateSnapshot", input]) },
  });

  const volumeService = {
    generateVolumes: async (_novelId, options) => {
      if (options.scope !== "chapter_detail") {
        return clone(options.draftWorkspace);
      }
      const workspace = clone(options.draftWorkspace);
      const chapter = workspace.volumes[0].chapters.find((item) => item.id === options.targetChapterId);
      assert.ok(chapter, "target chapter should exist in draft workspace");

      applyCompleteChapterDetail(chapter);

      return workspace;
    },
    updateVolumes: async (_novelId, workspace) => clone(workspace),
    updateVolumesWithOptions: async (_novelId, workspace) => clone(workspace),
    syncVolumeChapters: async (_novelId, input) => {
      const snapshot = clone(input.volumes);
      syncedSnapshots.push(snapshot);
      lastSyncedWorkspace = {
        ...lastSyncedWorkspace,
        volumes: snapshot,
      };
      return { creates: [], updates: [], deletes: [] };
    },
    syncVolumeChaptersWithOptions: async (_novelId, input) => {
      const snapshot = clone(input.volumes);
      syncedSnapshots.push(snapshot);
      lastSyncedWorkspace = {
        ...lastSyncedWorkspace,
        volumes: snapshot,
      };
      return { creates: [], updates: [], deletes: [] };
    },
  };

  const dependencies = {
    workflowService: {
      bootstrapTask: async () => undefined,
      markTaskRunning: async () => undefined,
      recordCheckpoint: async () => undefined,
    },
    novelContextService: {
      listChapters: async () => lastSyncedWorkspace.volumes[0].chapters.map(mapWorkspaceChapterToExecution),
      updateNovel: async () => undefined,
    },
    characterDynamicsService: {
      rebuildDynamics: async (novelId, options) => {
        rebuildCalls.push({ novelId, options });
      },
    },
    characterPreparationService: {},
    volumeService,
  };

  const callbacks = {
    buildDirectorSeedPayload: (_request, novelId, extra) => ({
      novelId,
      ...extra,
    }),
    markDirectorTaskRunning: async () => undefined,
  };

  try {
    await runDirectorStructuredOutlinePhase({
      taskId: "task-1",
      novelId: "novel-demo",
      request: {
        runMode: "auto_to_execution",
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.7,
        autoExecutionPlan: {
          mode: "chapter_range",
          startOrder: 1,
          endOrder: 2,
        },
        candidate: {
          workingTitle: "Demo Novel",
        },
      },
      baseWorkspace,
      dependencies,
      callbacks,
    });
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.$transaction = originals.transaction;
  }

  assert.equal(syncedSnapshots.length, 1);
  assert.deepEqual(rebuildCalls, [{
    novelId: "novel-demo",
    options: { sourceType: "rebuild_projection" },
  }]);
  assert.deepEqual(resetFindManyCalls[0].where.order, { gte: 1, lte: 2 });
  assert.ok(resetDeletions.some(([table]) => table === "stateChangeProposal"));
  assert.ok(resetDeletions.some(([table]) => table === "openConflict"));
  assert.ok(resetDeletions.some(([table]) => table === "storyStateSnapshot"));

  const firstDetailSync = syncedSnapshots[0][0].chapters;
  assert.equal(firstDetailSync[0].purpose, "Chapter 1 purpose");
  assert.equal(firstDetailSync[0].taskSheet, "Chapter 1 task sheet");
  assert.ok(firstDetailSync[0].sceneCards);
  assert.equal(firstDetailSync[1].purpose, "Chapter 2 purpose");
  assert.equal(firstDetailSync[1].taskSheet, "Chapter 2 task sheet");
  assert.ok(firstDetailSync[1].sceneCards);
});

test("runDirectorStructuredOutlinePhase resumes from the next incomplete chapter", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    transaction: prisma.$transaction,
  };
  const preDetailedChapter = {
    ...createChapter("chapter-1", 1, "Chapter 1"),
    purpose: "Chapter 1 purpose",
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2800,
    mustAvoid: "Chapter 1 avoid",
    taskSheet: "Chapter 1 task sheet",
    sceneCards: createSceneCards({ id: "chapter-1", title: "Chapter 1", targetWordCount: 2800 }),
  };
  const baseWorkspace = {
    novelId: "novel-demo",
    workspaceVersion: "v2",
    source: "volume",
    activeVersionId: "version-1",
    derivedOutline: "",
    derivedStructuredOutline: "",
    readiness: {},
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [createBeatSheet()],
    rebalanceDecisions: [],
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        title: "Volume 1",
        summary: "",
        openingHook: "",
        mainPromise: "",
        primaryPressureSource: "",
        coreSellingPoint: "",
        escalationMode: "",
        protagonistChange: "",
        midVolumeRisk: "",
        climax: "",
        payoffType: "",
        nextVolumeHook: "",
        resetPoint: "",
        openPayoffs: [],
        status: "draft",
        chapters: [
          { ...preDetailedChapter, beatKey: "opening" },
          { ...createChapter("chapter-2", 2, "Chapter 2"), beatKey: "opening" },
        ],
      },
    ],
  };

  const generatedTargets = [];
  const resetFindManyCalls = [];
  let lastSyncedWorkspace = clone(baseWorkspace);
  const rebuildCalls = [];
  prisma.chapter.findMany = async (input) => {
    resetFindManyCalls.push(input);
    return [
      { id: "chapter-1" },
      { id: "chapter-2" },
    ];
  };
  prisma.$transaction = async (callback) => callback({
    chapter: { updateMany: async () => ({ count: 2 }) },
    chapterSummary: { deleteMany: async () => ({ count: 0 }) },
    consistencyFact: { deleteMany: async () => ({ count: 0 }) },
    characterTimeline: { deleteMany: async () => ({ count: 0 }) },
    characterCandidate: { deleteMany: async () => ({ count: 0 }) },
    characterFactionTrack: { deleteMany: async () => ({ count: 0 }) },
    characterRelationStage: { deleteMany: async () => ({ count: 0 }) },
    qualityReport: { deleteMany: async () => ({ count: 0 }) },
    auditReport: { deleteMany: async () => ({ count: 0 }) },
    stateChangeProposal: { deleteMany: async () => ({ count: 0 }) },
    openConflict: { deleteMany: async () => ({ count: 0 }) },
    storyStateSnapshot: { deleteMany: async () => ({ count: 0 }) },
  });
  const volumeService = {
    generateVolumes: async (_novelId, options) => {
      if (options.scope !== "chapter_detail") {
        return clone(options.draftWorkspace);
      }
      generatedTargets.push(`${options.targetChapterId}:${options.detailMode}`);
      const workspace = clone(options.draftWorkspace);
      const chapter = workspace.volumes[0].chapters.find((item) => item.id === options.targetChapterId);
      assert.ok(chapter, "target chapter should exist in draft workspace");
      applyCompleteChapterDetail(chapter);
      return workspace;
    },
    updateVolumes: async (_novelId, workspace) => clone(workspace),
    updateVolumesWithOptions: async (_novelId, workspace) => clone(workspace),
    syncVolumeChapters: async (_novelId, input) => {
      lastSyncedWorkspace = {
        ...lastSyncedWorkspace,
        volumes: clone(input.volumes),
      };
      return { creates: [], updates: [], deletes: [] };
    },
    syncVolumeChaptersWithOptions: async (_novelId, input) => {
      lastSyncedWorkspace = {
        ...lastSyncedWorkspace,
        volumes: clone(input.volumes),
      };
      return { creates: [], updates: [], deletes: [] };
    },
  };

  const dependencies = {
    workflowService: {
      bootstrapTask: async () => undefined,
      markTaskRunning: async () => undefined,
      recordCheckpoint: async () => undefined,
    },
    novelContextService: {
      listChapters: async () => lastSyncedWorkspace.volumes[0].chapters.map(mapWorkspaceChapterToExecution),
      updateNovel: async () => undefined,
    },
    characterDynamicsService: {
      rebuildDynamics: async (novelId, options) => {
        rebuildCalls.push({ novelId, options });
      },
    },
    characterPreparationService: {},
    volumeService,
  };

  const callbacks = {
    buildDirectorSeedPayload: (_request, novelId, extra) => ({
      novelId,
      ...extra,
    }),
    markDirectorTaskRunning: async () => undefined,
  };

  try {
    await runDirectorStructuredOutlinePhase({
      taskId: "task-2",
      novelId: "novel-demo",
      request: {
        runMode: "auto_to_execution",
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.7,
        autoExecutionPlan: {
          mode: "chapter_range",
          startOrder: 1,
          endOrder: 2,
        },
        candidate: {
          workingTitle: "Demo Novel",
        },
      },
      baseWorkspace,
      dependencies,
      callbacks,
    });
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.$transaction = originals.transaction;
  }

  assert.deepEqual(generatedTargets, [
    "chapter-2:task_sheet",
  ]);
  assert.deepEqual(resetFindManyCalls[0].where.order, { gte: 1, lte: 2 });
  assert.deepEqual(rebuildCalls, [{
    novelId: "novel-demo",
    options: { sourceType: "rebuild_projection" },
  }]);
});
