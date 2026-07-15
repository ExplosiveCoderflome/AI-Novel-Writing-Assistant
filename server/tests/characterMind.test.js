const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { CharacterMindService } = require("../dist/services/novel/characterMind/CharacterMindService.js");

function createSnapshot(overrides = {}) {
  return {
    characterName: "程秩",
    currentInterpretation: "他认为钥匙给了自己一次先手。",
    privateIntent: "在赵管事察觉前先验证后门。",
    activePlan: "观察换岗后从后门试探进入。",
    emotionalStance: "紧张但愿意冒险。",
    actionTendency: "先独自试探，再决定是否求助。",
    decisionTrigger: "守卫异常增多时暂缓进入。",
    beliefs: ["钥匙能打开库房后门"],
    misbeliefs: ["赵管事尚未察觉钥匙失踪"],
    evidence: ["程秩把后门铜钥匙收进袖中。"],
    confidence: 0.8,
    ...overrides,
  };
}

test("character mind persistence archives the old current snapshot before creating a replacement", async () => {
  const service = new CharacterMindService();
  const originalTransaction = prisma.$transaction;
  const archivalCalls = [];
  const createdRows = [];
  prisma.$transaction = async (callback) => callback({
    characterMindSnapshot: {
      updateMany: async (args) => {
        archivalCalls.push(args);
        return { count: 1 };
      },
      create: async (args) => {
        const row = {
          id: `snapshot-${createdRows.length + 1}`,
          ...args.data,
          createdAt: new Date("2026-07-13T00:00:00.000Z"),
          updatedAt: new Date("2026-07-13T00:00:00.000Z"),
        };
        createdRows.push(row);
        return row;
      },
    },
  });

  try {
    const snapshots = await service.persistSnapshots("novel-1", [{
      characterId: "character-1",
      sourceChapterId: "chapter-8",
      sourceType: "artifact_delta",
      snapshot: createSnapshot(),
    }]);

    assert.deepEqual(archivalCalls[0], {
      where: { novelId: "novel-1", characterId: "character-1", isCurrent: true },
      data: { isCurrent: false },
    });
    assert.equal(createdRows[0].isCurrent, true);
    assert.equal(snapshots[0].sourceType, "artifact_delta");
    assert.deepEqual(snapshots[0].evidence, ["程秩把后门铜钥匙收进袖中。"]);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("chapter mind deltas only persist characters explicitly matched in the current novel", async () => {
  const service = new CharacterMindService();
  const originalCharacterDelegate = prisma.character;
  const persisted = [];
  prisma.character = {
    findMany: async () => [{ id: "character-1", name: "程秩" }],
  };
  service.persistSnapshots = async (_novelId, items) => {
    persisted.push(...items);
    return [];
  };

  try {
    const count = await service.applyChapterMindDeltas({
      novelId: "novel-1",
      chapterId: "chapter-8",
      deltas: [
        createSnapshot(),
        createSnapshot({ characterName: "不存在的角色" }),
      ],
    });

    assert.equal(count, 1);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].characterId, "character-1");
    assert.equal(persisted[0].sourceChapterId, "chapter-8");
  } finally {
    prisma.character = originalCharacterDelegate;
  }
});
