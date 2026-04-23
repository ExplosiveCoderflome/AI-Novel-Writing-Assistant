const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelVolumeService } = require("../dist/services/novel/volume/NovelVolumeService.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function createChapter(id, chapterOrder) {
  return {
    id,
    volumeId: "volume-1",
    chapterOrder,
    beatKey: null,
    title: `第${chapterOrder}章`,
    summary: `第${chapterOrder}章摘要`,
    purpose: `第${chapterOrder}章目标`,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2500,
    mustAvoid: null,
    taskSheet: `第${chapterOrder}章任务单`,
    sceneCards: `第${chapterOrder}章场景卡`,
    styleContract: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createVolume(id, sortOrder, chapterCount) {
  return {
    id,
    novelId: "novel-demo",
    sortOrder,
    title: `第${sortOrder}卷`,
    summary: `第${sortOrder}卷摘要`,
    openingHook: `第${sortOrder}卷开卷抓手`,
    mainPromise: `第${sortOrder}卷主承诺`,
    primaryPressureSource: `第${sortOrder}卷压力源`,
    coreSellingPoint: `第${sortOrder}卷核心卖点`,
    escalationMode: `第${sortOrder}卷升级方式`,
    protagonistChange: `第${sortOrder}卷主角变化`,
    midVolumeRisk: `第${sortOrder}卷中段风险`,
    climax: `第${sortOrder}卷高潮`,
    payoffType: `第${sortOrder}卷兑现类型`,
    nextVolumeHook: `第${sortOrder}卷下卷钩子`,
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters: Array.from({ length: chapterCount }, (_, index) => createChapter(`chapter-${sortOrder}-${index + 1}`, index + 1)),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createWorkspace(chapterCount) {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-demo",
    volumes: [createVolume("volume-1", 1, chapterCount)],
    beatSheets: [],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: "version-1",
  });
}

function createSyncPreview() {
  return {
    createCount: 0,
    updateCount: 0,
    keepCount: 0,
    moveCount: 0,
    deleteCount: 0,
    deleteCandidateCount: 0,
    affectedGeneratedCount: 0,
    clearContentCount: 0,
    affectedVolumeCount: 0,
    items: [],
  };
}

test("updateVolumes syncs chapter execution after saving when requested", async () => {
  const service = new NovelVolumeService();
  const originals = {
    ensureVolumeWorkspace: service.ensureVolumeWorkspace,
    persistWorkspaceDocument: service.persistWorkspaceDocument,
    syncVolumeChaptersWithOptions: service.syncVolumeChaptersWithOptions,
  };

  const currentWorkspace = createWorkspace(1);
  const nextWorkspace = createWorkspace(2);
  let syncCall = null;

  service.ensureVolumeWorkspace = async () => currentWorkspace;
  service.persistWorkspaceDocument = async (_novelId, document) => ({
    ...document,
    activeVersionId: "version-2",
    source: "volume",
  });
  service.syncVolumeChaptersWithOptions = async (_novelId, input, options) => {
    syncCall = { input, options };
    return createSyncPreview();
  };

  try {
    const updated = await service.updateVolumes("novel-demo", {
      volumes: nextWorkspace.volumes,
      syncToChapterExecution: true,
    });

    assert.equal(updated.volumes[0].chapters.length, 2);
    assert.ok(syncCall);
    assert.equal(syncCall.input.preserveContent, true);
    assert.equal(syncCall.input.applyDeletes, false);
    assert.equal(syncCall.input.volumes[0].chapters.length, 2);
    assert.equal(syncCall.options.emitEvent, false);
    assert.equal(syncCall.options.syncPayoffLedger, false);
  } finally {
    service.ensureVolumeWorkspace = originals.ensureVolumeWorkspace;
    service.persistWorkspaceDocument = originals.persistWorkspaceDocument;
    service.syncVolumeChaptersWithOptions = originals.syncVolumeChaptersWithOptions;
  }
});

test("updateVolumes does not sync chapter execution when the flag is absent", async () => {
  const service = new NovelVolumeService();
  const originals = {
    ensureVolumeWorkspace: service.ensureVolumeWorkspace,
    persistWorkspaceDocument: service.persistWorkspaceDocument,
    syncVolumeChaptersWithOptions: service.syncVolumeChaptersWithOptions,
  };

  const currentWorkspace = createWorkspace(1);
  let syncCallCount = 0;

  service.ensureVolumeWorkspace = async () => currentWorkspace;
  service.persistWorkspaceDocument = async (_novelId, document) => ({
    ...document,
    activeVersionId: "version-2",
    source: "volume",
  });
  service.syncVolumeChaptersWithOptions = async () => {
    syncCallCount += 1;
    return createSyncPreview();
  };

  try {
    await service.updateVolumes("novel-demo", {
      volumes: currentWorkspace.volumes,
    });

    assert.equal(syncCallCount, 0);
  } finally {
    service.ensureVolumeWorkspace = originals.ensureVolumeWorkspace;
    service.persistWorkspaceDocument = originals.persistWorkspaceDocument;
    service.syncVolumeChaptersWithOptions = originals.syncVolumeChaptersWithOptions;
  }
});
