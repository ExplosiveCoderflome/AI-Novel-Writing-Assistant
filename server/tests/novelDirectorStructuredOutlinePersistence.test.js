const test = require("node:test");
const assert = require("node:assert/strict");

const { runDirectorStructuredOutlinePhase } = require("../dist/services/novel/director/novelDirectorPipelinePhases.js");

function createChapter(id, order, title) {
  return {
    id,
    chapterOrder: order,
    title,
    summary: `${title} summary`,
    purpose: null,
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

test("runDirectorStructuredOutlinePhase persists chapter detail after each completed chapter", async () => {
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
  let lastSyncedWorkspace = clone(baseWorkspace);
  const rebuildCalls = [];

  const volumeService = {
    generateVolumes: async (_novelId, options) => {
      if (options.scope !== "chapter_detail") {
        return clone(options.draftWorkspace);
      }
      const workspace = clone(options.draftWorkspace);
      const chapter = workspace.volumes[0].chapters.find((item) => item.id === options.targetChapterId);
      assert.ok(chapter, "target chapter should exist in draft workspace");

      if (options.detailMode === "purpose") {
        chapter.purpose = `${chapter.title} purpose`;
      } else if (options.detailMode === "boundary") {
        chapter.conflictLevel = "high";
        chapter.revealLevel = "mid";
        chapter.targetWordCount = 3200 + chapter.chapterOrder;
        chapter.mustAvoid = `${chapter.title} avoid`;
      } else {
        chapter.taskSheet = `${chapter.title} task sheet`;
        chapter.sceneCards = JSON.stringify([{ key: `${chapter.id}-scene-1`, title: `${chapter.title} scene` }]);
      }

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
      listChapters: async () => lastSyncedWorkspace.volumes[0].chapters.map((chapter) => ({
        id: chapter.id,
        order: chapter.chapterOrder,
        generationState: "planned",
      })),
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

  assert.equal(syncedSnapshots.length, 1);
  assert.deepEqual(rebuildCalls, [{
    novelId: "novel-demo",
    options: { sourceType: "rebuild_projection" },
  }]);

  const firstDetailSync = syncedSnapshots[0][0].chapters;
  assert.equal(firstDetailSync[0].purpose, null);
  assert.equal(firstDetailSync[0].taskSheet, "Chapter 1 task sheet");
  assert.ok(firstDetailSync[0].sceneCards);
  assert.equal(firstDetailSync[1].purpose, null);
  assert.equal(firstDetailSync[1].taskSheet, "Chapter 2 task sheet");
  assert.ok(firstDetailSync[1].sceneCards);
});

test("runDirectorStructuredOutlinePhase resumes from the next incomplete chapter", async () => {
  const preDetailedChapter = {
    ...createChapter("chapter-1", 1, "Chapter 1"),
    purpose: "Chapter 1 purpose",
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2800,
    mustAvoid: "Chapter 1 avoid",
    taskSheet: "Chapter 1 task sheet",
    sceneCards: JSON.stringify([{ key: "chapter-1-scene-1", title: "Chapter 1 scene" }]),
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
  let lastSyncedWorkspace = clone(baseWorkspace);
  const rebuildCalls = [];
  const volumeService = {
    generateVolumes: async (_novelId, options) => {
      if (options.scope !== "chapter_detail") {
        return clone(options.draftWorkspace);
      }
      generatedTargets.push(`${options.targetChapterId}:${options.detailMode}`);
      const workspace = clone(options.draftWorkspace);
      const chapter = workspace.volumes[0].chapters.find((item) => item.id === options.targetChapterId);
      assert.ok(chapter, "target chapter should exist in draft workspace");
      if (options.detailMode === "purpose") {
        chapter.purpose = `${chapter.title} purpose`;
      } else if (options.detailMode === "boundary") {
        chapter.conflictLevel = 4;
        chapter.revealLevel = 3;
        chapter.targetWordCount = 3000;
        chapter.mustAvoid = `${chapter.title} avoid`;
      } else {
        chapter.taskSheet = `${chapter.title} task sheet`;
        chapter.sceneCards = JSON.stringify([{ key: `${chapter.id}-scene-1`, title: `${chapter.title} scene` }]);
      }
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
      listChapters: async () => lastSyncedWorkspace.volumes[0].chapters.map((chapter) => ({
        id: chapter.id,
        order: chapter.chapterOrder,
        generationState: "planned",
      })),
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

  assert.deepEqual(generatedTargets, [
    "chapter-2:task_sheet",
  ]);
  assert.deepEqual(rebuildCalls, [{
    novelId: "novel-demo",
    options: { sourceType: "rebuild_projection" },
  }]);
});
