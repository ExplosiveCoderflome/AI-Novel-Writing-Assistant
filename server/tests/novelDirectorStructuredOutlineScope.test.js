const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveStructuredOutlineRecoveryCursor,
} = require("../dist/services/novel/director/novelDirectorStructuredOutlineRecovery.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function createSceneCards(chapterOrder) {
  return JSON.stringify({
    targetWordCount: 2500,
    lengthBudget: {
      targetWordCount: 2500,
      softMinWordCount: 2200,
      softMaxWordCount: 2800,
      hardMaxWordCount: 3200,
    },
    scenes: [
      {
        key: `chapter-${chapterOrder}-scene-1`,
        title: `第${chapterOrder}章场景1`,
        purpose: "推进章节目标",
        mustAdvance: ["主线"],
        mustPreserve: ["人物动机"],
        entryState: "进入冲突",
        exitState: "压力升级",
        forbiddenExpansion: [],
        targetWordCount: 900,
      },
      {
        key: `chapter-${chapterOrder}-scene-2`,
        title: `第${chapterOrder}章场景2`,
        purpose: "升级选择压力",
        mustAdvance: ["冲突"],
        mustPreserve: ["设定边界"],
        entryState: "压力升级",
        exitState: "代价显形",
        forbiddenExpansion: [],
        targetWordCount: 800,
      },
      {
        key: `chapter-${chapterOrder}-scene-3`,
        title: `第${chapterOrder}章场景3`,
        purpose: "完成章末转折",
        mustAdvance: ["章末钩子"],
        mustPreserve: ["后续入口"],
        entryState: "代价显形",
        exitState: "进入下一章",
        forbiddenExpansion: [],
        targetWordCount: 800,
      },
    ],
  });
}

function createDetailedChapter(id, chapterOrder, overrides = {}) {
  return {
    id,
    volumeId: overrides.volumeId ?? "volume-1",
    chapterOrder,
    purpose: `chapter ${chapterOrder} purpose`,
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2500,
    mustAvoid: `chapter ${chapterOrder} avoid`,
    taskSheet: `chapter ${chapterOrder} task sheet`,
    payoffRefs: [],
    sceneCards: createSceneCards(chapterOrder),
    beatKey: overrides.beatKey ?? null,
    title: overrides.title ?? `第${chapterOrder}章`,
    summary: overrides.summary ?? `第${chapterOrder}章摘要`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
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

test("book scope selects every prepared chapter across volumes", () => {
  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace: createMultiVolumeWorkspace(),
    plan: { mode: "book" },
  });

  assert.equal(cursor.step, "chapter_sync");
  assert.equal(cursor.scopeLabel, "全书");
  assert.deepEqual(cursor.requiredVolumes.map((volume) => volume.id), ["volume-1", "volume-2"]);
  assert.deepEqual(cursor.selectedChapters.map((chapter) => chapter.chapterOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("book scope waits for incomplete later-volume chapter details", () => {
  const workspace = createMultiVolumeWorkspace();
  workspace.volumes = workspace.volumes.map((volume) => (
    volume.id === "volume-2"
      ? {
        ...volume,
        chapters: volume.chapters.map((chapter, index) => (
          index < 2
            ? chapter
            : {
              ...chapter,
              purpose: null,
              conflictLevel: null,
              revealLevel: null,
              targetWordCount: null,
              mustAvoid: null,
              taskSheet: null,
              sceneCards: null,
            }
        )),
      }
      : volume
  ));

  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace,
    plan: { mode: "book" },
  });

  assert.equal(cursor.step, "chapter_detail_bundle");
  assert.equal(cursor.scopeLabel, "全书");
  assert.equal(cursor.volumeId, "volume-2");
  assert.equal(cursor.chapterOrder, 9);
  assert.equal(cursor.completedChapterCount, 8);
  assert.equal(cursor.totalChapterCount, 12);
});
