const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const persistence = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
const { VolumeChapterSyncService } = require("../dist/services/novel/volume/VolumeChapterSyncService.js");

test("chapter sync keeps summary and purpose in their own fields", async () => {
  const originalFindMany = prisma.chapter.findMany;
  const originalTransaction = persistence.runVolumeWorkspaceTransaction;
  const originalPersist = persistence.persistActiveVolumeWorkspace;
  const writes = [];
  const chapter = {
    id: "volume-chapter-1", chapterId: "chapter-1", volumeId: "volume-1", chapterOrder: 1, beatKey: null,
    title: "第一章", summary: "章节摘要", purpose: "章节目标", exclusiveEvent: null, endingState: null,
    nextChapterEntryState: null, conflictLevel: null, conflictLevelSource: null, revealLevel: null,
    targetWordCount: null, mustAvoid: null, taskSheet: null, sceneCards: null, styleContract: null,
    payoffRefs: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  };
  const workspace = {
    novelId: "novel-1", workspaceVersion: "v2", volumes: [{ id: "volume-1", novelId: "novel-1", sortOrder: 1,
      title: "第一卷", summary: null, openingHook: null, mainPromise: null, primaryPressureSource: null,
      coreSellingPoint: null, escalationMode: null, protagonistChange: null, midVolumeRisk: null, climax: null,
      payoffType: null, nextVolumeHook: null, resetPoint: null, openPayoffs: [], status: "active", sourceVersionId: null,
      chapters: [chapter], createdAt: chapter.createdAt, updatedAt: chapter.updatedAt }], strategyPlan: null,
    critiqueReport: null, beatSheets: [], rebalanceDecisions: [], readiness: { canGenerateStrategy: true,
      canGenerateSkeleton: true, canGenerateBeatSheet: true, canGenerateChapterList: true, blockingReasons: [] },
    derivedOutline: "", derivedStructuredOutline: "", source: "volume", activeVersionId: "version-1",
  };
  prisma.chapter.findMany = async () => [{ id: "chapter-1", order: 1, title: "第一章", content: "", generationState: "planned",
    chapterStatus: "unplanned", expectation: "旧摘要", targetWordCount: null, conflictLevel: null, revealLevel: null,
    mustAvoid: null, taskSheet: null, sceneCards: null }];
  persistence.runVolumeWorkspaceTransaction = async (callback) => callback({
    chapter: { updateMany: async (args) => writes.push(args), create: async () => { throw new Error("unexpected create"); }, deleteMany: async () => {} },
    storyPlan: { updateMany: async () => {} }, volumePlanVersion: { update: async () => {} },
  });
  persistence.persistActiveVolumeWorkspace = async () => {};
  try {
    await new VolumeChapterSyncService({
      ensureVolumeWorkspace: async () => workspace,
      ensureActiveVersionRecord: async () => ({ versionId: "version-1", version: 1 }),
      emitVolumeUpdated: () => {}, syncPayoffLedger: () => {},
    }).syncVolumeChaptersWithOptions("novel-1", { volumes: workspace.volumes, allowIncompleteExecutionContracts: true });
    assert.equal(writes[0].data.expectation, "章节摘要");
  } finally {
    prisma.chapter.findMany = originalFindMany;
    persistence.runVolumeWorkspaceTransaction = originalTransaction;
    persistence.persistActiveVolumeWorkspace = originalPersist;
  }
});
