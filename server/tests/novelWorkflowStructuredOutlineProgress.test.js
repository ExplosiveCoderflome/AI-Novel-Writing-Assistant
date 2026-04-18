const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
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
    sceneCards: null,
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

test("resolveStructuredOutlineRecoveryCursor returns chapter_detail_bundle with the next missing detail mode", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createWorkspace({
      chapters: [
        createDetailedChapter("chapter-1", 1, {
          beatKey: "open_hook",
          conflictLevel: null,
          revealLevel: null,
          targetWordCount: null,
          mustAvoid: null,
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
  assert.equal(cursor.detailMode, "boundary");
  assert.equal(cursor.completedDetailSteps, 4);
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
  assert.equal(cursor.totalDetailSteps, 6);
  assert.equal(cursor.completedDetailSteps, 6);
});

test("healStaleAutoDirectorStructuredOutlineProgress advances stale chapter list status to next incomplete chapter", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
    getVolumes: NovelVolumeService.prototype.getVolumes,
  };

  let updatedPayload = null;
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
  }
});
