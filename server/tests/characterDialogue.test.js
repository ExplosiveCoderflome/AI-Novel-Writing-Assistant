const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { setPromptRunnerStructuredInvokerForTests } = require("../dist/prompting/core/promptRunner.js");
const { CharacterDialogueService } = require("../dist/services/novel/characterDialogue/CharacterDialogueService.js");

const now = new Date("2026-07-13T14:00:00.000Z");

function influenceRow(data = {}) {
  return {
    id: "influence-1",
    sessionId: "session-1",
    novelId: "novel-1",
    characterId: "character-1",
    sourceMindSnapshotId: "mind-1",
    summary: "他愿意先用一件小事验证对方。",
    behaviorGuidance: "先提出一个可撤回的小交换，再决定是否交出线索。",
    emotionalGuidance: "谨慎里带一点松动。",
    relationTension: "信任仍需被证明。",
    evidenceJson: JSON.stringify(["他仍在隐瞒钥匙的用途。"]),
    confidence: 0.78,
    targetStartChapterOrder: 8,
    targetEndChapterOrder: 10,
    status: "draft",
    activatedAt: null,
    appliedAt: null,
    resolvedChapterId: null,
    resolutionEvidenceJson: "[]",
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

function sessionRow(data = {}) {
  return {
    id: "session-1",
    novelId: "novel-1",
    characterId: "character-1",
    sourceMindSnapshotId: "mind-1",
    status: "active",
    turns: [],
    influences: [],
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

test("starting a dialogue requires a mind snapshot and archives the prior active session", async () => {
  const service = new CharacterDialogueService();
  const originalTransaction = prisma.$transaction;
  const originalMind = prisma.characterMindSnapshot;
  const archived = [];
  prisma.characterMindSnapshot = { findFirst: async () => ({ id: "mind-1" }) };
  prisma.$transaction = async (callback) => callback({
    characterDialogueSession: {
      updateMany: async (args) => {
        archived.push(args);
        return { count: 1 };
      },
      create: async () => sessionRow(),
    },
  });
  try {
    const session = await service.startSession("novel-1", "character-1");
    assert.equal(session.status, "active");
    assert.equal(session.sourceMindSnapshotId, "mind-1");
    assert.deepEqual(archived[0].where, { novelId: "novel-1", characterId: "character-1", status: "active" });
    assert.equal(archived[0].data.status, "archived");
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.characterMindSnapshot = originalMind;
  }
});

test("a dialogue turn stores both voices and only the structured result becomes the latest draft influence", async () => {
  const service = new CharacterDialogueService();
  const original = {
    transaction: prisma.$transaction,
    chapter: prisma.chapter,
    session: prisma.characterDialogueSession,
    mind: prisma.characterMindSnapshot,
    character: prisma.character,
    state: prisma.storyStateSnapshot,
    relations: prisma.characterRelationStage,
    resources: prisma.characterResourceLedgerItem,
    novel: prisma.novel,
    influence: prisma.characterDialogueInfluence,
  };
  const persistedTurns = [];
  const persistedInfluences = [];
  prisma.chapter = {
    findFirst: async (args) => args.where.chapterStatus === "completed" ? { order: 7 } : { order: 8 },
    findMany: async () => [{ order: 7, title: "钥匙", content: "程秩没有交出钥匙。" }],
  };
  prisma.characterDialogueSession = {
    findFirst: async () => ({ id: "session-1", turns: [{ role: "character", content: "我还不能信他。" }] }),
  };
  prisma.characterMindSnapshot = {
    findFirst: async () => ({
      id: "mind-1", currentInterpretation: "他认为盟友还不可信。", privateIntent: null, activePlan: null,
      emotionalStance: "戒备", actionTendency: "试探", misbeliefsJson: "[]", evidenceJson: "[]",
    }),
  };
  prisma.character = { findFirst: async () => ({
    id: "character-1", name: "程秩", role: "主角", storyFunction: null, personality: "谨慎", background: null, development: null,
    currentState: null, currentGoal: "查清真相", identityLabel: null, factionLabel: null, stanceLabel: null,
    outerGoal: null, innerNeed: null, fear: null, wound: null, misbelief: null, secret: null, moralLine: null,
  }) };
  prisma.storyStateSnapshot = { findFirst: async () => ({ summary: "钥匙仍在程秩手里", characterStates: [], informationStates: [] }) };
  prisma.characterRelationStage = { findMany: async () => [] };
  prisma.characterResourceLedgerItem = { findMany: async () => [] };
  prisma.characterDialogueInfluence = { updateMany: async () => ({ count: 0 }) };
  prisma.novel = { findUnique: async () => ({ title: "测试小说", bible: null, storyMacroPlan: null, bookContract: null }) };
  prisma.$transaction = async (callback) => callback({
    characterDialogueTurn: { createMany: async ({ data }) => { persistedTurns.push(...data); return { count: data.length }; } },
    characterDialogueInfluence: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => { persistedInfluences.push(data); return influenceRow(data); },
    },
    characterDialogueSession: {
      findUniqueOrThrow: async () => sessionRow({
        turns: [
          { id: "turn-author", role: "author", content: "我希望你先给他一次机会。", createdAt: now },
          { id: "turn-character", role: "character", content: "机会可以有，但钥匙不能先交。", createdAt: now },
        ],
        influences: [influenceRow()],
      }),
    },
  });
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: {
      characterReply: "机会可以有，但钥匙不能先交。",
      influenceDraft: {
        summary: "他愿意先用小事验证盟友。",
        behaviorGuidance: "先提出一项可撤回的交换。",
        emotionalGuidance: "戒备略有松动。",
        relationTension: "信任仍需被证明。",
        evidence: ["作者希望他给机会，但他仍不交钥匙。"],
        confidence: 0.8,
      },
    },
    repairUsed: false,
    repairAttempts: 0,
  }));
  try {
    const result = await service.sendTurn("novel-1", "character-1", "session-1", "我希望你先给他一次机会。");
    assert.equal(result.characterTurn.content, "机会可以有，但钥匙不能先交。");
    assert.deepEqual(persistedTurns.map((item) => item.role), ["author", "character"]);
    assert.equal(persistedTurns[0].content, "我希望你先给他一次机会。");
    assert.equal(persistedInfluences.length, 1);
    assert.equal(persistedInfluences[0].behaviorGuidance, "先提出一项可撤回的交换。");
    assert.equal(persistedInfluences[0].targetStartChapterOrder, 8);
    assert.equal(persistedInfluences[0].targetEndChapterOrder, 10);
  } finally {
    prisma.$transaction = original.transaction;
    prisma.chapter = original.chapter;
    prisma.characterDialogueSession = original.session;
    prisma.characterMindSnapshot = original.mind;
    prisma.character = original.character;
    prisma.storyStateSnapshot = original.state;
    prisma.characterRelationStage = original.relations;
    prisma.characterResourceLedgerItem = original.resources;
    prisma.novel = original.novel;
    prisma.characterDialogueInfluence = original.influence;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("activating a draft supersedes overlapping active influence for the same character", async () => {
  const service = new CharacterDialogueService();
  const original = { transaction: prisma.$transaction, chapter: prisma.chapter, influence: prisma.characterDialogueInfluence };
  const updates = [];
  prisma.chapter = { findFirst: async () => ({ order: 7 }) };
  prisma.characterDialogueInfluence = { findFirst: async () => influenceRow(), updateMany: async () => ({ count: 0 }) };
  prisma.$transaction = async (callback) => callback({
    characterDialogueInfluence: {
      updateMany: async (args) => { updates.push(args); return { count: 1 }; },
      update: async ({ data }) => influenceRow({ ...data, status: "active", activatedAt: now }),
    },
  });
  try {
    const influence = await service.activateLatestDraftInfluence("novel-1", "character-1", "session-1");
    assert.equal(influence.status, "active");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].where.status, "active");
    assert.equal(updates[0].data.status, "superseded");
  } finally {
    prisma.$transaction = original.transaction;
    prisma.chapter = original.chapter;
    prisma.characterDialogueInfluence = original.influence;
  }
});
