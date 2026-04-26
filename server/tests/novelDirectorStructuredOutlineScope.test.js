const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveStructuredOutlineRecoveryCursor,
} = require("../dist/services/novel/director/novelDirectorStructuredOutlineRecovery.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

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
    sceneCards: `chapter ${chapterOrder} scene cards`,
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
