const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { ChapterArtifactDeltaService } = require("../dist/services/novel/runtime/ChapterArtifactDeltaService.js");

test("artifact delta only applies active dialogue influences that are active in this chapter", async () => {
  const service = new ChapterArtifactDeltaService();
  const originalUpdateMany = prisma.characterDialogueInfluence.updateMany;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) => callback(prisma);
  const updateCalls = [];
  prisma.characterDialogueInfluence.updateMany = async (args) => {
    updateCalls.push(args);
    return { count: 1 };
  };

  try {
    const count = await service.applyCharacterDialogueInfluenceResolutions({
      novelId: "novel-1",
      chapterId: "chapter-5",
      chapterOrder: 5,
      activeInfluences: [{
        id: "proposal-active",
        characterId: "character-1",
        characterName: "程秩",
        title: "先确认退路",
        behaviorGuidance: "先确认退路再行动。",
        emotionalGuidance: null,
        relationTension: null,
        authorIntent: null,
        targetStartChapterOrder: 5,
        targetEndChapterOrder: 7,
      }],
      resolutions: [
        {
          influenceId: "proposal-active",
          status: "applied",
          evidence: ["程秩确认退路后才潜入。"],
          confidence: 0.88,
        },
        {
          influenceId: "proposal-foreign",
          status: "applied",
          evidence: ["不应命中的提案。"],
          confidence: 0.9,
        },
        {
          influenceId: "proposal-active",
          status: "defer",
          evidence: ["尚未承接。"],
          confidence: 0.7,
        },
      ],
    });

    assert.equal(count, 1);
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0].where, {
      id: "proposal-active",
      novelId: "novel-1",
      status: "active",
      targetStartChapterOrder: { lte: 5 },
      targetEndChapterOrder: { gte: 5 },
    });
    assert.equal(updateCalls[0].data.status, "applied");
    assert.equal(updateCalls[0].data.resolvedChapterId, "chapter-5");
    assert.deepEqual(JSON.parse(updateCalls[0].data.resolutionEvidenceJson), ["程秩确认退路后才潜入。"]);
  } finally {
    prisma.characterDialogueInfluence.updateMany = originalUpdateMany;
    prisma.$transaction = originalTransaction;
  }
});

test("artifact delta expires active dialogue influences once their window has passed", async () => {
  const service = new ChapterArtifactDeltaService();
  const originalUpdateMany = prisma.characterDialogueInfluence.updateMany;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) => callback(prisma);
  const updateCalls = [];
  prisma.characterDialogueInfluence.updateMany = async (args) => {
    updateCalls.push(args);
    return { count: 2 };
  };

  try {
    const count = await service.expirePastCharacterDialogueInfluences({
      novelId: "novel-1",
      chapterOrder: 8,
    });

    assert.equal(count, 2);
    assert.deepEqual(updateCalls[0], {
      where: {
        novelId: "novel-1",
        status: "active",
        targetEndChapterOrder: { lt: 8 },
      },
      data: { status: "expired" },
    });
  } finally {
    prisma.characterDialogueInfluence.updateMany = originalUpdateMany;
    prisma.$transaction = originalTransaction;
  }
});
