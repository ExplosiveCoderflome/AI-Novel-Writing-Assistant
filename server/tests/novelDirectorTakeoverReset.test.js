const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDirectorTakeoverAutoExecutionResetRange,
  resetDirectorTakeoverCurrentStep,
} = require("../dist/services/novel/director/novelDirectorTakeoverReset.js");
const { prisma } = require("../dist/db/prisma.js");

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

test("restart_current_step clears structured assets only inside the requested chapter range", async () => {
  const updates = [];
  const deletedOrders = [];
  const workspace = {
    strategyPlan: { premise: "keep" },
    critiqueReport: { note: "keep" },
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        chapters: [1, 2, 3, 4, 5].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
      {
        id: "volume-2",
        sortOrder: 2,
        chapters: [6, 7, 8, 9, 10].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
    ],
    beatSheets: [
      { volumeId: "volume-1", beats: [{ key: "v1", chapterSpanHint: "1-5" }] },
      { volumeId: "volume-2", beats: [{ key: "v2", chapterSpanHint: "6-10" }] },
    ],
    rebalanceDecisions: [
      { anchorVolumeId: "volume-1", affectedVolumeId: "volume-2" },
    ],
  };
  const originals = {
    chapterDeleteMany: prisma.chapter.deleteMany,
    chapterFindMany: prisma.chapter.findMany,
  };
  prisma.chapter.deleteMany = async ({ where }) => {
    deletedOrders.push(...where.order.in);
    return { count: where.order.in.length };
  };
  prisma.chapter.findMany = async () => [];

  try {
    await resetDirectorTakeoverCurrentStep({
      novelId: "novel-1",
      plan: {
        strategy: "restart_current_step",
        effectiveStep: "structured",
      },
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 3,
        endOrder: 7,
      },
      takeoverState: {
        ...buildTakeoverState(),
        snapshot: { firstVolumeId: "volume-1" },
      },
      deps: {
        async getVolumeWorkspace() {
          return workspace;
        },
        async updateVolumeWorkspace(_novelId, input) {
          updates.push(input);
          return input;
        },
        async cancelPipelineJob() {
          throw new Error("structured reset should not cancel pipeline jobs");
        },
      },
    });

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].volumes[0].chapters.map((chapter) => chapter.chapterOrder), [1, 2]);
    assert.deepEqual(updates[0].volumes[1].chapters.map((chapter) => chapter.chapterOrder), [8, 9, 10]);
    assert.deepEqual(deletedOrders.sort((left, right) => left - right), [3, 4, 5, 6, 7]);
  } finally {
    prisma.chapter.deleteMany = originals.chapterDeleteMany;
    prisma.chapter.findMany = originals.chapterFindMany;
  }
});

test("restart_current_step from structured cascades chapter and pipeline reset inside the requested range", async () => {
  const originals = {
    chapterDeleteMany: prisma.chapter.deleteMany,
    chapterFindMany: prisma.chapter.findMany,
    transaction: prisma.$transaction,
  };
  const updates = [];
  const blankChapterDeletes = [];
  const chapterFindManyCalls = [];
  const chapterUpdates = [];
  const deletions = [];
  const workspace = {
    strategyPlan: { premise: "keep" },
    critiqueReport: { note: "keep" },
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        chapters: [1, 2, 3, 4, 5].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
      {
        id: "volume-2",
        sortOrder: 2,
        chapters: [6, 7, 8, 9, 10].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
    ],
    beatSheets: [
      { volumeId: "volume-1", beats: [{ key: "v1", chapterSpanHint: "1-5" }] },
      { volumeId: "volume-2", beats: [{ key: "v2", chapterSpanHint: "6-10" }] },
    ],
    rebalanceDecisions: [
      { anchorVolumeId: "volume-1", affectedVolumeId: "volume-2" },
    ],
  };
  prisma.chapter.deleteMany = async ({ where }) => {
    blankChapterDeletes.push(where);
    return { count: where.order.in.length };
  };
  prisma.chapter.findMany = async (input) => {
    chapterFindManyCalls.push(input);
    return [
      { id: "chapter-3" },
      { id: "chapter-4" },
      { id: "chapter-5" },
      { id: "chapter-6" },
      { id: "chapter-7" },
    ];
  };
  prisma.$transaction = async (callback) => callback({
    chapter: {
      updateMany: async (input) => {
        chapterUpdates.push(input);
        return { count: input.where.id.in.length };
      },
    },
    chapterSummary: { deleteMany: async (input) => deletions.push(["chapterSummary", input]) },
    consistencyFact: { deleteMany: async (input) => deletions.push(["consistencyFact", input]) },
    characterTimeline: { deleteMany: async (input) => deletions.push(["characterTimeline", input]) },
    characterCandidate: { deleteMany: async (input) => deletions.push(["characterCandidate", input]) },
    characterFactionTrack: { deleteMany: async (input) => deletions.push(["characterFactionTrack", input]) },
    characterRelationStage: { deleteMany: async (input) => deletions.push(["characterRelationStage", input]) },
    qualityReport: { deleteMany: async (input) => deletions.push(["qualityReport", input]) },
    auditReport: { deleteMany: async (input) => deletions.push(["auditReport", input]) },
    stateChangeProposal: { deleteMany: async (input) => deletions.push(["stateChangeProposal", input]) },
    openConflict: { deleteMany: async (input) => deletions.push(["openConflict", input]) },
    storyStateSnapshot: { deleteMany: async (input) => deletions.push(["storyStateSnapshot", input]) },
  });

  try {
    await resetDirectorTakeoverCurrentStep({
      novelId: "novel-1",
      plan: {
        strategy: "restart_current_step",
        effectiveStep: "structured",
      },
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 3,
        endOrder: 7,
      },
      takeoverState: {
        ...buildTakeoverState(),
        snapshot: { firstVolumeId: "volume-1" },
      },
      deps: {
        async getVolumeWorkspace() {
          return workspace;
        },
        async updateVolumeWorkspace(_novelId, input) {
          updates.push(input);
          return input;
        },
        async cancelPipelineJob() {
          return null;
        },
      },
    });

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].volumes[0].chapters.map((chapter) => chapter.chapterOrder), [1, 2]);
    assert.deepEqual(updates[0].volumes[1].chapters.map((chapter) => chapter.chapterOrder), [8, 9, 10]);
    assert.deepEqual(blankChapterDeletes[0].order.in.sort((left, right) => left - right), [3, 4, 5, 6, 7]);
    assert.deepEqual(chapterFindManyCalls[0].where.order, { gte: 3, lte: 7 });
    assert.equal(chapterUpdates.length, 1);
    assert.deepEqual(chapterUpdates[0].where.id.in, ["chapter-3", "chapter-4", "chapter-5", "chapter-6", "chapter-7"]);
    assert.equal(chapterUpdates[0].data.content, "");
    assert.equal(chapterUpdates[0].data.generationState, "planned");
    assert.equal(chapterUpdates[0].data.chapterStatus, "unplanned");
    assert.equal(chapterUpdates[0].data.qualityScore, null);
    assert.ok(deletions.some(([table]) => table === "qualityReport"));
    assert.ok(deletions.some(([table]) => table === "auditReport"));
    assert.ok(deletions.some(([table]) => table === "stateChangeProposal"));
    assert.ok(deletions.some(([table]) => table === "openConflict"));
    assert.ok(deletions.some(([table]) => table === "storyStateSnapshot"));
    assert.ok(deletions.every(([, input]) => {
      const chapterIds = input.where.chapterId?.in ?? input.where.sourceChapterId?.in;
      return Array.isArray(chapterIds)
        && chapterIds.every((chapterId) => ["chapter-3", "chapter-4", "chapter-5", "chapter-6", "chapter-7"].includes(chapterId));
    }));
  } finally {
    prisma.chapter.deleteMany = originals.chapterDeleteMany;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.$transaction = originals.transaction;
  }
});

test("restart_current_step from structured preserves beat sheets outside the requested chapter range", async () => {
  const originals = {
    chapterDeleteMany: prisma.chapter.deleteMany,
    chapterFindMany: prisma.chapter.findMany,
  };
  const updates = [];
  const workspace = {
    strategyPlan: { premise: "keep" },
    critiqueReport: { note: "keep" },
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        chapters: [1, 2, 3, 4, 5].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
      {
        id: "volume-2",
        sortOrder: 2,
        chapters: [6, 7, 8, 9, 10].map((chapterOrder) => ({ chapterOrder, title: `第${chapterOrder}章` })),
      },
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        beats: [
          { key: "v1-early", chapterSpanHint: "1-2" },
          { key: "v1-reset", chapterSpanHint: "3-5" },
        ],
      },
      {
        volumeId: "volume-2",
        beats: [
          { key: "v2-reset", chapterSpanHint: "6-7" },
          { key: "v2-late", chapterSpanHint: "8-10" },
        ],
      },
    ],
    rebalanceDecisions: [],
  };
  prisma.chapter.deleteMany = async ({ where }) => ({ count: where.order.in.length });
  prisma.chapter.findMany = async () => [];

  try {
    await resetDirectorTakeoverCurrentStep({
      novelId: "novel-1",
      plan: {
        strategy: "restart_current_step",
        effectiveStep: "structured",
      },
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 3,
        endOrder: 7,
      },
      takeoverState: {
        ...buildTakeoverState(),
        snapshot: { firstVolumeId: "volume-1" },
      },
      deps: {
        async getVolumeWorkspace() {
          return workspace;
        },
        async updateVolumeWorkspace(_novelId, input) {
          updates.push(input);
          return input;
        },
        async cancelPipelineJob() {
          return null;
        },
      },
    });

    assert.deepEqual(
      updates[0].beatSheets.map((sheet) => ({
        volumeId: sheet.volumeId,
        beatKeys: sheet.beats.map((beat) => beat.key),
      })),
      [
        { volumeId: "volume-1", beatKeys: ["v1-early"] },
        { volumeId: "volume-2", beatKeys: ["v2-late"] },
      ],
    );
  } finally {
    prisma.chapter.deleteMany = originals.chapterDeleteMany;
    prisma.chapter.findMany = originals.chapterFindMany;
  }
});

test("restart_current_step clears chapter body only inside the requested execution range", async () => {
  const originals = {
    chapterFindMany: prisma.chapter.findMany,
    transaction: prisma.$transaction,
  };
  const updates = [];
  const deletions = [];
  prisma.chapter.findMany = async () => [
    { id: "chapter-3" },
    { id: "chapter-4" },
  ];
  prisma.$transaction = async (callback) => callback({
    chapter: {
      updateMany: async (input) => {
        updates.push(input);
        return { count: input.where.id.in.length };
      },
    },
    chapterSummary: { deleteMany: async (input) => deletions.push(["chapterSummary", input]) },
    consistencyFact: { deleteMany: async (input) => deletions.push(["consistencyFact", input]) },
    characterTimeline: { deleteMany: async (input) => deletions.push(["characterTimeline", input]) },
    characterCandidate: { deleteMany: async (input) => deletions.push(["characterCandidate", input]) },
    characterFactionTrack: { deleteMany: async (input) => deletions.push(["characterFactionTrack", input]) },
    characterRelationStage: { deleteMany: async (input) => deletions.push(["characterRelationStage", input]) },
    qualityReport: { deleteMany: async (input) => deletions.push(["qualityReport", input]) },
    auditReport: { deleteMany: async (input) => deletions.push(["auditReport", input]) },
    stateChangeProposal: { deleteMany: async (input) => deletions.push(["stateChangeProposal", input]) },
    openConflict: { deleteMany: async (input) => deletions.push(["openConflict", input]) },
    storyStateSnapshot: { deleteMany: async (input) => deletions.push(["storyStateSnapshot", input]) },
  });

  try {
    await resetDirectorTakeoverCurrentStep({
      novelId: "novel-1",
      plan: {
        strategy: "restart_current_step",
        effectiveStep: "chapter",
      },
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 3,
        endOrder: 4,
      },
      takeoverState: buildTakeoverState(),
      deps: {
        async getVolumeWorkspace() {
          throw new Error("chapter range reset should not require volume workspace");
        },
        async updateVolumeWorkspace() {
          throw new Error("chapter execution reset should not rewrite volume workspace");
        },
        async cancelPipelineJob() {
          return null;
        },
      },
    });

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].where.id.in, ["chapter-3", "chapter-4"]);
    assert.equal(updates[0].data.content, "");
    assert.equal(updates[0].data.generationState, "planned");
    assert.equal(updates[0].data.chapterStatus, "unplanned");
    assert.ok(deletions.every(([, input]) => {
      const chapterIds = input.where.chapterId?.in ?? input.where.sourceChapterId?.in;
      return Array.isArray(chapterIds) && chapterIds.length === 2;
    }));
  } finally {
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.$transaction = originals.transaction;
  }
});
