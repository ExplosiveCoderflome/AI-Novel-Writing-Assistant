const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { ChapterRouteWindowService } = require("../dist/services/novel/planning/ChapterRouteWindowService.js");
const { buildVolumeWorkspaceDocument } = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

const now = new Date(0).toISOString();

function createVolume(id, sortOrder, chapters = []) {
  return {
    id,
    novelId: "novel-1",
    sortOrder,
    title: `第${sortOrder}卷`,
    openPayoffs: [],
    status: "active",
    chapters,
    createdAt: now,
    updatedAt: now,
  };
}

function createChapter(id, volumeId, chapterOrder) {
  return {
    id,
    volumeId,
    chapterOrder,
    beatKey: "open_hook",
    title: `第${chapterOrder}章`,
    summary: "章节摘要",
    payoffRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

const strategyPlan = {
  recommendedVolumeCount: 2,
  hardPlannedVolumeCount: 2,
  readerRewardLadder: "逐步兑现",
  escalationLadder: "逐步升级",
  midpointShift: "中段转折",
  notes: "测试",
  volumes: [],
  uncertainties: [],
};

function buildWorkspace(volumes, beatSheets) {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes,
    strategyPlan,
    beatSheets,
    rebalanceDecisions: [],
  });
}

test("route window adds a future skeleton before planning the next beat and chapter", async () => {
  const firstVolume = createVolume("volume-1", 1, [createChapter("chapter-1", "volume-1", 1)]);
  const firstBeatSheet = {
    volumeId: "volume-1",
    volumeSortOrder: 1,
    status: "generated",
    beats: [{
      key: "opening",
      label: "开卷抓手",
      summary: "第一卷已完成",
      chapterSpanHint: "1章",
      mustDeliver: ["开局"],
    }],
  };
  let workspace = buildWorkspace([firstVolume], [firstBeatSheet]);
  let chapterWasPlanned = false;
  const scopes = [];
  const volumeService = {
    getVolumes: async () => workspace,
    generateVolumes: async (_novelId, options) => {
      scopes.push(options.scope);
      if (options.scope === "skeleton") {
        return buildWorkspace([
          firstVolume,
          createVolume("volume-2", 2),
        ], [firstBeatSheet]);
      }
      if (options.scope === "beat_sheet") {
        return buildWorkspace(options.draftWorkspace.volumes, [
          firstBeatSheet,
          {
            volumeId: options.targetVolumeId,
            volumeSortOrder: 2,
            status: "generated",
            beats: [{
              key: "opening",
              label: "承接",
              summary: "第二卷开始",
              chapterSpanHint: "1章",
              mustDeliver: ["承接"],
            }],
          },
        ]);
      }
      chapterWasPlanned = true;
      return buildWorkspace(options.draftWorkspace.volumes.map((volume) => (
        volume.id === "volume-2"
          ? { ...volume, chapters: [createChapter("chapter-2", "volume-2", 2)] }
          : volume
      )), options.draftWorkspace.beatSheets);
    },
    updateVolumesWithOptions: async (_novelId, input) => {
      workspace = buildWorkspace(input.volumes, input.beatSheets);
      return workspace;
    },
    syncVolumeChaptersWithOptions: async () => {},
  };
  const originalCount = prisma.chapter.count;
  prisma.chapter.count = async () => (chapterWasPlanned ? 1 : 0);

  try {
    const result = await new ChapterRouteWindowService(volumeService).ensureRouteWindow("novel-1", 2, {
      min: 1,
      target: 1,
      completionProfile: { targetChapterCount: 80 },
    });

    assert.deepEqual(scopes, ["skeleton", "beat_sheet", "chapter_list"]);
    assert.equal(result.availableRouteCount, 1);
    assert.equal(result.extended, true);
  } finally {
    prisma.chapter.count = originalCount;
  }
});
