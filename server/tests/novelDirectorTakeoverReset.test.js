const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  resolveDirectorTakeoverAutoExecutionResetRange,
  resetDirectorTakeoverCurrentStep,
} = require("../dist/services/novel/director/novelDirectorTakeoverReset.js");

function buildTakeoverState() {
  return {
    latestAutoExecutionState: {
      enabled: true,
      mode: "front10",
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
    },
    activePipelineJob: null,
    latestCheckpoint: null,
  };
}

test("takeover reset range prefers requested chapter range over stale auto execution state", async () => {
  const range = await resolveDirectorTakeoverAutoExecutionResetRange({
    novelId: "novel-1",
    autoExecutionPlan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 190,
    },
    takeoverState: buildTakeoverState(),
    deps: {
      async getVolumeWorkspace() {
        throw new Error("chapter range does not need volume workspace");
      },
    },
  });

  assert.deepEqual(range, {
    startOrder: 11,
    endOrder: 190,
  });
});

test("takeover reset range resolves requested volume from current workspace chapters", async () => {
  const range = await resolveDirectorTakeoverAutoExecutionResetRange({
    novelId: "novel-1",
    autoExecutionPlan: {
      mode: "volume",
      volumeOrder: 2,
    },
    takeoverState: buildTakeoverState(),
    deps: {
      async getVolumeWorkspace() {
        return {
          volumes: [
            {
              sortOrder: 1,
              chapters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((chapterOrder) => ({ chapterOrder })),
            },
            {
              sortOrder: 2,
              chapters: [11, 12, 13, 14, 15].map((chapterOrder) => ({ chapterOrder })),
            },
          ],
        };
      },
    },
  });

  assert.deepEqual(range, {
    startOrder: 11,
    endOrder: 15,
  });
});

test("resetDirectorTakeoverCurrentStep only clears the requested chapter range", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    transaction: prisma.$transaction,
  };
  const calls = [];

  prisma.chapter.findMany = async ({ where }) => {
    calls.push(["findMany", where.order.gte, where.order.lte]);
    return [
      { id: "chapter-11" },
      { id: "chapter-12" },
    ];
  };
  prisma.$transaction = async (callback) => callback({
    chapter: {
      updateMany: async ({ where }) => {
        calls.push(["updateMany", where.id.in]);
      },
    },
    chapterSummary: { deleteMany: async () => {} },
    consistencyFact: { deleteMany: async () => {} },
    characterTimeline: { deleteMany: async () => {} },
    characterCandidate: { deleteMany: async () => {} },
    characterFactionTrack: { deleteMany: async () => {} },
    characterRelationStage: { deleteMany: async () => {} },
    qualityReport: { deleteMany: async () => {} },
    auditReport: { deleteMany: async () => {} },
  });

  try {
    await resetDirectorTakeoverCurrentStep({
      novelId: "novel-1",
      plan: {
        entryStep: "chapter",
        strategy: "restart_current_step",
        effectiveStep: "chapter",
        effectiveStage: "chapter_execution",
      },
      takeoverState: {
        activePipelineJob: null,
        latestCheckpoint: {
          checkpointType: "chapter_batch_ready",
          chapterId: "chapter-4",
          chapterOrder: 4,
          volumeId: "volume-1",
        },
        executableRange: {
          startOrder: 1,
          endOrder: 10,
          totalChapterCount: 10,
          nextChapterId: "chapter-4",
          nextChapterOrder: 4,
        },
        latestAutoExecutionState: {
          enabled: true,
          mode: "front10",
          startOrder: 1,
          endOrder: 10,
          totalChapterCount: 10,
        },
        requestedExecutionRange: {
          startOrder: 11,
          endOrder: 190,
          totalChapterCount: 180,
          nextChapterId: "chapter-11",
          nextChapterOrder: 11,
        },
      },
      deps: {
        getVolumeWorkspace: async () => ({ volumes: [], beatSheets: [], rebalanceDecisions: [] }),
        updateVolumeWorkspace: async () => ({ volumes: [], beatSheets: [], rebalanceDecisions: [] }),
        cancelPipelineJob: async () => null,
      },
    });
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.$transaction = originals.transaction;
  }

  assert.deepEqual(calls[0], ["findMany", 11, 190]);
  assert.deepEqual(calls[1], ["updateMany", ["chapter-11", "chapter-12"]]);
});
