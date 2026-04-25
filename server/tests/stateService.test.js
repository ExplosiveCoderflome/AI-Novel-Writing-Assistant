const test = require("node:test");
const assert = require("node:assert/strict");

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  StateService,
} = require("../dist/services/state/StateService.js");

function buildChapterRow(id, order, content = `chapter ${order} content`) {
  return {
    id,
    order,
    title: `第${order}章`,
    expectation: null,
    content,
  };
}

test("syncChapterState normalizes foreshadow chapter refs before persistence", async () => {
  const originals = {
    runStructuredPrompt: promptRunner.runStructuredPrompt,
    chapterFindFirst: prisma.chapter.findFirst,
    chapterFindMany: prisma.chapter.findMany,
    characterFindMany: prisma.character.findMany,
    chapterSummaryFindUnique: prisma.chapterSummary.findUnique,
    consistencyFactFindMany: prisma.consistencyFact.findMany,
    characterTimelineFindMany: prisma.characterTimeline.findMany,
    storyStateSnapshotFindMany: prisma.storyStateSnapshot.findMany,
    storyStateSnapshotFindFirst: prisma.storyStateSnapshot.findFirst,
    storyStateSnapshotFindUnique: prisma.storyStateSnapshot.findUnique,
    transaction: prisma.$transaction,
  };

  const captured = {
    foreshadowRows: null,
  };

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      summary: "状态摘要",
      characterStates: [],
      relationStates: [],
      informationStates: [],
      foreshadowStates: [
        {
          title: "假的 setup id",
          summary: "summary 1",
          status: "setup",
          setupChapterId: "bad-id",
          payoffChapterId: "第2章",
        },
        {
          title: "数字序号",
          summary: "summary 2",
          status: "pending_payoff",
          setupChapterId: "2",
          payoffChapterId: "missing-id",
        },
        {
          title: "非 setup 不应伪造来源",
          summary: "summary 3",
          status: "pending_payoff",
          setupChapterId: "missing-id",
          payoffChapterId: "第3章",
        },
      ],
    },
    repairUsed: false,
  });

  prisma.chapter.findFirst = async ({ where }) => {
    if (where.id === "chapter-1") {
      return buildChapterRow("chapter-1", 1, "正文");
    }
    return null;
  };
  prisma.chapter.findMany = async () => ([
    { id: "chapter-1", order: 1 },
    { id: "chapter-2", order: 2 },
    { id: "chapter-3", order: 3 },
  ]);
  prisma.character.findMany = async () => ([]);
  prisma.chapterSummary.findUnique = async () => ({
    summary: "章节摘要",
    keyEvents: null,
    characterStates: null,
    hook: null,
  });
  prisma.consistencyFact.findMany = async () => ([]);
  prisma.characterTimeline.findMany = async () => ([]);
  prisma.storyStateSnapshot.findMany = async () => ([]);
  prisma.storyStateSnapshot.findFirst = async () => null;
  prisma.storyStateSnapshot.findUnique = async () => ({
    id: "snapshot-1",
    characterStates: [],
    relationStates: [],
    informationStates: [],
    foreshadowStates: captured.foreshadowRows ?? [],
  });
  prisma.$transaction = async (callback) => callback({
    storyStateSnapshot: {
      create: async ({ data }) => ({ id: "snapshot-1", ...data }),
      update: async ({ data }) => ({ id: "snapshot-1", ...data }),
    },
    characterState: {
      deleteMany: async () => null,
      createMany: async () => null,
    },
    relationState: {
      deleteMany: async () => null,
      createMany: async () => null,
    },
    informationState: {
      deleteMany: async () => null,
      createMany: async () => null,
    },
    foreshadowState: {
      deleteMany: async () => null,
      createMany: async ({ data }) => {
        captured.foreshadowRows = data;
        return null;
      },
    },
  });

  try {
    const service = new StateService();
    await service.syncChapterState("novel-1", "chapter-1", "正文");

    assert.ok(Array.isArray(captured.foreshadowRows));
    assert.equal(captured.foreshadowRows.length, 3);
    assert.equal(captured.foreshadowRows[0].setupChapterId, "chapter-1");
    assert.equal(captured.foreshadowRows[0].payoffChapterId, "chapter-2");
    assert.equal(captured.foreshadowRows[1].setupChapterId, "chapter-2");
    assert.equal(captured.foreshadowRows[1].payoffChapterId, null);
    assert.equal(captured.foreshadowRows[2].setupChapterId, null);
    assert.equal(captured.foreshadowRows[2].payoffChapterId, "chapter-3");
  } finally {
    promptRunner.runStructuredPrompt = originals.runStructuredPrompt;
    prisma.chapter.findFirst = originals.chapterFindFirst;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.character.findMany = originals.characterFindMany;
    prisma.chapterSummary.findUnique = originals.chapterSummaryFindUnique;
    prisma.consistencyFact.findMany = originals.consistencyFactFindMany;
    prisma.characterTimeline.findMany = originals.characterTimelineFindMany;
    prisma.storyStateSnapshot.findMany = originals.storyStateSnapshotFindMany;
    prisma.storyStateSnapshot.findFirst = originals.storyStateSnapshotFindFirst;
    prisma.storyStateSnapshot.findUnique = originals.storyStateSnapshotFindUnique;
    prisma.$transaction = originals.transaction;
  }
});
