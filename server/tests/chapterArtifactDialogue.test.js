const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { ChapterArtifactDeltaService, buildContentHash } = require("../dist/services/novel/runtime/ChapterArtifactDeltaService.js");

test("artifact summary passes the original chapter text to the content-version fence", async () => {
  const service = new ChapterArtifactDeltaService();
  const originalFindFirst = prisma.chapter.findFirst;
  const content = "第一段正文。\n\n第二段正文。";
  let receivedContent = null;
  prisma.chapter.findFirst = async () => ({ id: "chapter-1", order: 1, title: "第一章", content });
  service.persistChapterSummaryAndFacts = async (input) => {
    receivedContent = input.content;
    return 1;
  };
  try {
    await service.applyChapterArtifactConsumer({
      novelId: "novel-1",
      chapterId: "chapter-1",
      chapterOrder: 1,
      content,
      contentHash: buildContentHash(content),
      output: {},
      consumer: "summary_facts",
    });
    assert.equal(receivedContent, content);
  } finally {
    prisma.chapter.findFirst = originalFindFirst;
  }
});

test("artifact delta only applies active dialogue influences that are valid in this chapter", async () => {
  const service = new ChapterArtifactDeltaService();
  const originalUpdateMany = prisma.characterDialogueInfluence.updateMany;
  const originalTransaction = prisma.$transaction;
  const updateCalls = [];
  prisma.characterDialogueInfluence.updateMany = async (args) => {
    updateCalls.push(args);
    return { count: 1 };
  };
  prisma.$transaction = async (callback) => callback({
    characterDialogueInfluence: { updateMany: prisma.characterDialogueInfluence.updateMany },
  });

  try {
    const count = await service.applyCharacterDialogueInfluenceResolutions({
      novelId: "novel-1",
      chapterId: "chapter-5",
      chapterOrder: 5,
      activeInfluences: [{
        id: "dialogue-active",
        characterId: "character-1",
        characterName: "程秩",
        summary: "程秩同意先确认退路。",
        behaviorGuidance: "先确认退路再潜入。",
        emotionalGuidance: null,
        relationTension: null,
        targetStartChapterOrder: 5,
        targetEndChapterOrder: 7,
      }],
      resolutions: [
        { influenceId: "dialogue-active", status: "applied", evidence: ["程秩确认退路后才潜入。"], confidence: 0.9 },
        { influenceId: "dialogue-inactive", status: "applied", evidence: ["不应写入。"], confidence: 0.9 },
        { influenceId: "dialogue-active", status: "defer", evidence: [], confidence: 0.6 },
      ],
    });

    assert.equal(count, 1);
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0].where, {
      id: "dialogue-active",
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
  const updateCalls = [];
  prisma.characterDialogueInfluence.updateMany = async (args) => {
    updateCalls.push(args);
    return { count: 2 };
  };
  prisma.$transaction = async (callback) => callback({
    characterDialogueInfluence: { updateMany: prisma.characterDialogueInfluence.updateMany },
  });

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
