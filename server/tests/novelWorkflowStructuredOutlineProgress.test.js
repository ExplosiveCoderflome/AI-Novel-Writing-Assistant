const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const taskArchive = require("../dist/services/task/taskArchive.js");
const {
  resolveStructuredOutlineRecoveryCursor,
} = require("../dist/services/novel/director/novelDirectorStructuredOutlineRecovery.js");
const { NovelVolumeService } = require("../dist/services/novel/volume/NovelVolumeService.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");
const { prisma } = require("../dist/db/prisma.js");

function createWorkspace({
  chapters = [],
  beatSheets = [],
} = {}) {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-demo",
    volumes: [
      {
        id: "volume-1",
        novelId: "novel-demo",
        sortOrder: 1,
        title: "第一卷",
        summary: "卷摘要",
        openingHook: "开卷抓手",
        mainPromise: "主承诺",
        primaryPressureSource: "压力源",
        coreSellingPoint: "核心卖点",
        escalationMode: "升级方式",
        protagonistChange: "主角变化",
        midVolumeRisk: "中段风险",
        climax: "高潮",
        payoffType: "兑现类型",
        nextVolumeHook: "下卷钩子",
        resetPoint: null,
        openPayoffs: [],
        status: "active",
        sourceVersionId: null,
        chapters,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
    beatSheets,
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });
}

function createVolume(id, sortOrder, title, chapters) {
  return {
    id,
    novelId: "novel-demo",
    sortOrder,
    title,
    summary: `${title}摘要`,
    openingHook: `${title}开卷抓手`,
    mainPromise: `${title}主承诺`,
    primaryPressureSource: `${title}压力源`,
    coreSellingPoint: `${title}核心卖点`,
    escalationMode: `${title}升级方式`,
    protagonistChange: `${title}主角变化`,
    midVolumeRisk: `${title}中段风险`,
    climax: `${title}高潮`,
    payoffType: `${title}兑现类型`,
    nextVolumeHook: `${title}下卷钩子`,
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createMultiVolumeWorkspace() {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-demo",
    volumes: [
      createVolume("volume-1", 1, "第一卷", Array.from({ length: 6 }, (_, index) => (
        createDetailedChapter(`chapter-${index + 1}`, index + 1, {
          volumeId: "volume-1",
          beatKey: "volume-1-beat",
        })
      ))),
      createVolume("volume-2", 2, "第二卷", Array.from({ length: 6 }, (_, index) => (
        createDetailedChapter(`chapter-${index + 7}`, index + 7, {
          volumeId: "volume-2",
          beatKey: "volume-2-beat",
        })
      ))),
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        volumeSortOrder: 1,
        status: "generated",
        beats: [{
          key: "volume-1-beat",
          label: "卷一起势",
          summary: "卷一起势摘要",
          chapterSpanHint: "1-6章",
          mustDeliver: ["卷一起势"],
        }],
      },
      {
        volumeId: "volume-2",
        volumeSortOrder: 2,
        status: "generated",
        beats: [{
          key: "volume-2-beat",
          label: "卷二承接",
          summary: "卷二承接摘要",
          chapterSpanHint: "7-12章",
          mustDeliver: ["卷二承接"],
        }],
      },
    ],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });
}

function createDetailedChapter(id, chapterOrder, overrides = {}) {
  return {
    id,
    volumeId: "volume-1",
    chapterOrder,
    purpose: `chapter ${chapterOrder} purpose`,
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2500,
    mustAvoid: `chapter ${chapterOrder} avoid`,
    taskSheet: `chapter ${chapterOrder} task sheet`,
    payoffRefs: [],
    sceneCards: `chapter ${chapterOrder} scene cards`,
    beatKey: overrides.beatKey ?? null,
    title: overrides.title ?? `第${chapterOrder}章`,
    summary: overrides.summary ?? `第${chapterOrder}章摘要`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createEmptyChapter(id, chapterOrder, overrides = {}) {
  return {
    id,
    volumeId: "volume-1",
    chapterOrder,
    purpose: null,
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    payoffRefs: [],
    sceneCards: null,
    beatKey: overrides.beatKey ?? null,
    title: overrides.title ?? `第${chapterOrder}章`,
    summary: overrides.summary ?? `第${chapterOrder}章摘要`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createBeatSheet() {
  return [
    {
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [
        {
          key: "open_hook",
          label: "开卷抓手",
          summary: "先把局势钉死。",
          chapterSpanHint: "1-1章",
          mustDeliver: ["开局压力"],
        },
        {
          key: "mid_turn",
          label: "中段转向",
          summary: "让局势转向。",
          chapterSpanHint: "2-2章",
          mustDeliver: ["方向变化"],
        },
      ],
    },
  ];
}

function createSingleBeatSheet(volumeId, volumeSortOrder, key, label, chapterSpanHint) {
  return {
    volumeId,
    volumeSortOrder,
    status: "generated",
    beats: [
      {
        key,
        label,
        summary: `${label}摘要`,
        chapterSpanHint,
        mustDeliver: [label],
      },
    ],
  };
}

function createTwoVolumeWorkspace({
  volume1Chapters = [],
  volume2Chapters = [],
  beatSheets = [],
} = {}) {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-demo",
    volumes: [
      createVolume("volume-1", 1, "第一卷", volume1Chapters),
      createVolume("volume-2", 2, "第二卷", volume2Chapters),
    ],
    beatSheets,
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });
}

test("resolveStructuredOutlineRecoveryCursor returns beat_sheet when required volume has no beat sheet", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace(),
    plan: { mode: "volume", volumeOrder: 1 },
  });

  assert.equal(cursor.step, "beat_sheet");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.volumeOrder, 1);
});

test("resolveStructuredOutlineRecoveryCursor returns chapter_list for the first incomplete beat", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      chapters: [
        createEmptyChapter("chapter-1", 1, { beatKey: "open_hook" }),
      ],
      beatSheets: createBeatSheet(),
    }),
    plan: { mode: "volume", volumeOrder: 1 },
  });

  assert.equal(cursor.step, "chapter_list");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.beatKey, "mid_turn");
  assert.equal(cursor.beatLabel, "中段转向");
});

test("resolveStructuredOutlineRecoveryCursor regenerates beat sheet for full-volume plan when span misses planned budget", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      beatSheets: [createSingleBeatSheet("volume-1", 1, "too_short", "异常短跨度", "1-2章")],
    }),
    plan: { mode: "volume", volumeOrder: 1 },
    estimatedChapterCount: 60,
  });

  assert.equal(cursor.step, "beat_sheet");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.volumeOrder, 1);
});

test("resolveStructuredOutlineRecoveryCursor keeps current volume chapter_list before later empty beat sheet", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createTwoVolumeWorkspace({
      beatSheets: [createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一起势", "1-6章")],
    }),
    plan: { mode: "front10" },
    estimatedChapterCount: 430,
  });

  assert.equal(cursor.step, "chapter_list");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.volumeOrder, 1);
  assert.equal(cursor.beatKey, "volume-1-beat");
});

test("resolveStructuredOutlineRecoveryCursor details current volume before next volume beat sheet", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createTwoVolumeWorkspace({
      volume1Chapters: Array.from({ length: 6 }, (_, index) => createEmptyChapter(`chapter-${index + 1}`, index + 1, {
        beatKey: "volume-1-beat",
      })),
      beatSheets: [createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一起势", "1-6章")],
    }),
    plan: { mode: "front10" },
    estimatedChapterCount: 430,
  });

  assert.equal(cursor.step, "chapter_detail_bundle");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.volumeOrder, 1);
  assert.equal(cursor.chapterId, "chapter-1");
});

test("resolveStructuredOutlineRecoveryCursor finishes current volume details before next volume beat sheet", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createTwoVolumeWorkspace({
      volume1Chapters: [
        ...Array.from({ length: 10 }, (_, index) => createDetailedChapter(`chapter-${index + 1}`, index + 1, {
          beatKey: "volume-1-beat",
        })),
        ...Array.from({ length: 2 }, (_, index) => createEmptyChapter(`chapter-${index + 11}`, index + 11, {
          beatKey: "volume-1-beat",
        })),
      ],
      beatSheets: [createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一起势", "1-12章")],
    }),
    plan: { mode: "chapter_range", startOrder: 1, endOrder: 20 },
  });

  assert.equal(cursor.step, "chapter_detail_bundle");
  assert.equal(cursor.volumeId, "volume-1");
  assert.equal(cursor.volumeOrder, 1);
  assert.equal(cursor.chapterId, "chapter-11");
  assert.equal(cursor.chapterOrder, 11);
  assert.equal(cursor.completedChapterCount, 10);
});

test("resolveStructuredOutlineRecoveryCursor advances to next volume chapter_list when current details are complete", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createTwoVolumeWorkspace({
      volume1Chapters: Array.from({ length: 6 }, (_, index) => createDetailedChapter(`chapter-${index + 1}`, index + 1, {
        beatKey: "volume-1-beat",
      })),
      beatSheets: [
        createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一起势", "1-6章"),
        createSingleBeatSheet("volume-2", 2, "volume-2-beat", "卷二承接", "1-4章"),
      ],
    }),
    plan: { mode: "front10" },
    estimatedChapterCount: 430,
  });

  assert.equal(cursor.step, "chapter_list");
  assert.equal(cursor.volumeId, "volume-2");
  assert.equal(cursor.volumeOrder, 2);
  assert.equal(cursor.beatKey, "volume-2-beat");
});

test("resolveStructuredOutlineRecoveryCursor regenerates short later volumes for full-book chapter range", () => {
  const workspace = buildVolumeWorkspaceDocument({
    novelId: "novel-demo",
    volumes: Array.from({ length: 16 }, (_, index) => {
      const sortOrder = index + 1;
      const chapterStart = sortOrder === 1 ? 1 : 65;
      const chapterCount = sortOrder === 1 ? 64 : sortOrder === 2 ? 13 : 0;
      return createVolume(`volume-${sortOrder}`, sortOrder, `第${sortOrder}卷`, Array.from({ length: chapterCount }, (_, chapterIndex) => (
        createDetailedChapter(`chapter-${sortOrder}-${chapterIndex + 1}`, chapterStart + chapterIndex, {
          volumeId: `volume-${sortOrder}`,
          beatKey: `volume-${sortOrder}-beat`,
        })
      )));
    }),
    beatSheets: [
      createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一完整节奏", "1-64章"),
      createSingleBeatSheet("volume-2", 2, "volume-2-beat", "卷二短节奏", "1-13章"),
    ],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });

  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace,
    plan: { mode: "chapter_range", startOrder: 1, endOrder: 1024 },
    estimatedChapterCount: 1024,
  });

  assert.equal(cursor.step, "beat_sheet");
  assert.equal(cursor.volumeId, "volume-2");
  assert.equal(cursor.volumeOrder, 2);
});

test("resolveStructuredOutlineRecoveryCursor does not enter chapter execution when target range is still short", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createTwoVolumeWorkspace({
      volume1Chapters: Array.from({ length: 6 }, (_, index) => createDetailedChapter(`chapter-${index + 1}`, index + 1, {
        beatKey: "volume-1-beat",
      })),
      volume2Chapters: Array.from({ length: 3 }, (_, index) => createDetailedChapter(`chapter-${index + 7}`, index + 7, {
        volumeId: "volume-2",
        beatKey: "volume-2-beat",
      })),
      beatSheets: [
        createSingleBeatSheet("volume-1", 1, "volume-1-beat", "卷一起势", "1-6章"),
        createSingleBeatSheet("volume-2", 2, "volume-2-beat", "卷二承接", "1-3章"),
      ],
    }),
    plan: { mode: "front10" },
  });

  assert.equal(cursor.step, "beat_sheet");
  assert.equal(cursor.volumeId, "volume-2");
  assert.equal(cursor.volumeOrder, 2);
});

test("resolveStructuredOutlineRecoveryCursor returns chapter_detail_bundle with the next missing detail mode", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      chapters: [
        createDetailedChapter("chapter-1", 1, {
          beatKey: "open_hook",
          sceneCards: null,
        }),
        createDetailedChapter("chapter-2", 2, {
          beatKey: "mid_turn",
        }),
      ],
      beatSheets: createBeatSheet(),
    }),
    plan: { mode: "volume", volumeOrder: 1 },
  });

  assert.equal(cursor.step, "chapter_detail_bundle");
  assert.equal(cursor.chapterId, "chapter-1");
  assert.equal(cursor.detailMode, "task_sheet");
  assert.equal(cursor.completedDetailSteps, 1);
});

test("resolveStructuredOutlineRecoveryCursor does not skip chapters missing boundary details", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      chapters: [
        createDetailedChapter("chapter-1", 1, {
          beatKey: "open_hook",
          conflictLevel: null,
          revealLevel: null,
          targetWordCount: null,
          mustAvoid: "",
          payoffRefs: [],
        }),
        createEmptyChapter("chapter-2", 2, {
          beatKey: "mid_turn",
        }),
      ],
      beatSheets: createBeatSheet(),
    }),
    plan: { mode: "chapter_range", startOrder: 1, endOrder: 2 },
  });

  assert.equal(cursor.step, "chapter_detail_bundle");
  assert.equal(cursor.chapterId, "chapter-1");
  assert.equal(cursor.detailMode, "task_sheet");
  assert.equal(cursor.completedChapterCount, 0);
  assert.equal(cursor.completedDetailSteps, 0);
});

test("resolveStructuredOutlineRecoveryCursor returns chapter_sync after all selected chapter details are complete", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      chapters: [
        createDetailedChapter("chapter-1", 1, { beatKey: "open_hook" }),
        createDetailedChapter("chapter-2", 2, { beatKey: "mid_turn" }),
      ],
      beatSheets: createBeatSheet(),
    }),
    plan: { mode: "volume", volumeOrder: 1 },
  });

  assert.equal(cursor.step, "chapter_sync");
  assert.equal(cursor.selectedChapters.length, 2);
  assert.equal(cursor.totalDetailSteps, 2);
  assert.equal(cursor.completedDetailSteps, 2);
});

test("front10 is resolved as chapter range 1-10 even when it spans volumes", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createMultiVolumeWorkspace(),
    plan: { mode: "front10" },
  });

  assert.equal(cursor.step, "chapter_sync");
  assert.equal(cursor.scopeLabel, "前 10 章");
  assert.deepEqual(cursor.requiredVolumes.map((volume) => volume.id), ["volume-1", "volume-2"]);
  assert.deepEqual(cursor.selectedChapters.map((chapter) => chapter.chapterOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("healStaleAutoDirectorStructuredOutlineProgress advances stale chapter list status to next incomplete chapter", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
    getVolumes: NovelVolumeService.prototype.getVolumes,
    isTaskArchived: taskArchive.isTaskArchived,
  };

  let updatedPayload = null;
  taskArchive.isTaskArchived = async () => false;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-outline-stale",
    novelId: "novel-demo",
    lane: "auto_director",
    status: "running",
    progress: 0.78,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在生成第 1 卷章节列表（已等待 5m15s）",
    checkpointType: null,
    checkpointSummary: null,
    seedPayloadJson: JSON.stringify({
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
      directorInput: { runMode: "auto_to_execution" },
    }),
    cancelRequestedAt: null,
  });
  NovelVolumeService.prototype.getVolumes = async () => createWorkspace({
    chapters: [
        createDetailedChapter("chapter-1", 1),
        createDetailedChapter("chapter-2", 2),
        createDetailedChapter("chapter-3", 3),
        createDetailedChapter("chapter-4", 4),
        createEmptyChapter("chapter-5", 5),
        createEmptyChapter("chapter-6", 6),
        createEmptyChapter("chapter-7", 7),
        createEmptyChapter("chapter-8", 8),
        createEmptyChapter("chapter-9", 9),
        createEmptyChapter("chapter-10", 10),
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        volumeSortOrder: 1,
        status: "generated",
        beats: Array.from({ length: 10 }, (_, index) => ({
          key: `beat_${index + 1}`,
          label: `节奏段${index + 1}`,
          summary: `节奏段${index + 1}摘要`,
          chapterSpanHint: `${index + 1}-${index + 1}章`,
          mustDeliver: [`交付${index + 1}`],
        })),
      },
    ],
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    updatedPayload = data;
    return data;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healStaleAutoDirectorStructuredOutlineProgress("task-outline-stale");
    assert.equal(healed, true);
    assert.equal(updatedPayload.currentItemKey, "chapter_detail_bundle");
    assert.match(updatedPayload.currentItemLabel, /5\/10/);
    assert.ok(updatedPayload.progress > 0.82);
    assert.match(updatedPayload.resumeTargetJson, /"stage":"structured"/);
    assert.match(updatedPayload.resumeTargetJson, /"chapterId":"chapter-5"/);
    assert.match(updatedPayload.resumeTargetJson, /"volumeId":"volume-1"/);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
    NovelVolumeService.prototype.getVolumes = originals.getVolumes;
    taskArchive.isTaskArchived = originals.isTaskArchived;
  }
});
