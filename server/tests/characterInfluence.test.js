const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { setPromptRunnerStructuredInvokerForTests } = require("../dist/prompting/core/promptRunner.js");
const { CharacterInfluenceService } = require("../dist/services/novel/characterInfluence/CharacterInfluenceService.js");

function option(overrides = {}) {
  return {
    title: "先验证盟友",
    directionSummary: "保留怀疑，先用小代价验证对方。",
    recommendationReason: "能延续他当前的谨慎与信息缺口。",
    isRecommended: true,
    behaviorGuidance: "先安排一次可撤回的试探，再决定是否交出线索。",
    emotionalGuidance: "克制中带有戒备。",
    relationTension: "盟友需要证明自己。",
    readerPayoff: "读者会看到信任在压力下逐步建立。",
    risk: "试探过久会拖慢当下冲突。",
    observableSignals: ["提出可验证的交换条件"],
    evidence: ["他刚隐瞒了钥匙的真正用途。"],
    confidence: 0.8,
    ...overrides,
  };
}

function proposalRow(data = {}) {
  const now = new Date("2026-07-13T12:00:00.000Z");
  return {
    id: "proposal-1",
    novelId: "novel-1",
    characterId: "character-1",
    proposalSetId: "set-1",
    sourceMindSnapshotId: "mind-1",
    ...option(),
    observableSignalsJson: JSON.stringify(["提出可验证的交换条件"]),
    evidenceJson: JSON.stringify(["他刚隐瞒了钥匙的真正用途。"]),
    targetStartChapterOrder: 8,
    targetEndChapterOrder: 10,
    status: "draft",
    acceptedAt: null,
    appliedAt: null,
    resolvedChapterId: null,
    resolutionEvidenceJson: "[]",
    authorIntent: null,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

function promptContext() {
  return {
    mindSnapshot: { id: "mind-1" },
    target: "目标角色：程秩",
    mind: "他相信盟友仍可被验证。",
    facts: "正史事实：程秩尚未交出钥匙。",
    relations: "程秩 -> 苏青：互相试探。",
    resources: "钥匙受程秩持有。",
    recentEvents: "第7章：程秩隐瞒钥匙用途。",
  };
}

test("influence generation creates two draft proposals for the next three-chapter window", async () => {
  const service = new CharacterInfluenceService();
  const originalTransaction = prisma.$transaction;
  const originalChapter = prisma.chapter;
  const originalProposal = prisma.characterInfluenceProposal;
  const expiryCalls = [];
  const created = [];
  service.loadPromptContext = async () => promptContext();
  prisma.chapter = {
    findFirst: async (args) => args.where.chapterStatus === "completed" ? { order: 7 } : { order: 8 },
  };
  prisma.characterInfluenceProposal = {
    updateMany: async (args) => {
      expiryCalls.push(args);
      return { count: 0 };
    },
  };
  prisma.$transaction = async (input) => {
    if (typeof input === "function") {
      return input({
        characterInfluenceProposal: {
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }) => {
            const row = proposalRow({ id: `proposal-${created.length + 1}`, ...data });
            created.push(row);
            return row;
          },
        },
      });
    }
    return Promise.all(input);
  };
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: { proposals: [option(), option({ title: "主动摊牌", isRecommended: false })] },
    repairUsed: false,
    repairAttempts: 0,
  }));

  try {
    const proposals = await service.generateInfluenceProposals("novel-1", "character-1");
    assert.equal(proposals.length, 2);
    assert.deepEqual(proposals.map((item) => item.status), ["draft", "draft"]);
    assert.deepEqual(proposals.map((item) => [item.targetStartChapterOrder, item.targetEndChapterOrder]), [[8, 10], [8, 10]]);
    assert.equal(created[0].sourceMindSnapshotId, "mind-1");
    assert.equal(expiryCalls[0].data.status, "expired");
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.chapter = originalChapter;
    prisma.characterInfluenceProposal = originalProposal;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("accepting with author intent refines through the prompt and supersedes overlapping accepted guidance", async () => {
  const service = new CharacterInfluenceService();
  const originalTransaction = prisma.$transaction;
  const originalChapter = prisma.chapter;
  const originalProposal = prisma.characterInfluenceProposal;
  const transactionUpdates = [];
  service.loadPromptContext = async () => promptContext();
  prisma.chapter = { findFirst: async () => ({ order: 7 }) };
  prisma.characterInfluenceProposal = {
    findFirst: async () => proposalRow(),
    updateMany: async () => ({ count: 0 }),
  };
  prisma.$transaction = async (callback) => callback({
    characterInfluenceProposal: {
      updateMany: async (args) => {
        transactionUpdates.push(args);
        return { count: 1 };
      },
      update: async ({ data }) => proposalRow({ ...data, status: "accepted", acceptedAt: new Date("2026-07-13T12:01:00.000Z") }),
    },
  });
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: { proposals: [option({ title: "先交换半条线索", behaviorGuidance: "先交出可验证的小线索。" })] },
    repairUsed: false,
    repairAttempts: 0,
  }));

  try {
    const accepted = await service.acceptInfluenceProposal("novel-1", "character-1", "proposal-1", {
      authorIntent: "让他更愿意试着信任盟友",
    });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.title, "先交换半条线索");
    assert.equal(accepted.authorIntent, "让他更愿意试着信任盟友");
    assert.equal(transactionUpdates.length, 2);
    assert.equal(transactionUpdates[0].where.proposalSetId, "set-1");
    assert.equal(transactionUpdates[0].data.status, "superseded");
    assert.equal(transactionUpdates[1].data.status, "superseded");
    assert.deepEqual(transactionUpdates[1].where.targetStartChapterOrder, { lte: 10 });
    assert.deepEqual(transactionUpdates[1].where.targetEndChapterOrder, { gte: 8 });
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.chapter = originalChapter;
    prisma.characterInfluenceProposal = originalProposal;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("dismiss only updates an unresolved draft or accepted proposal", async () => {
  const service = new CharacterInfluenceService();
  const originalChapter = prisma.chapter;
  const originalProposal = prisma.characterInfluenceProposal;
  prisma.chapter = { findFirst: async () => null };
  prisma.characterInfluenceProposal = {
    updateMany: async () => ({ count: 0 }),
    findFirst: async () => proposalRow({ status: "accepted" }),
    update: async ({ data }) => proposalRow({ ...data, status: "dismissed" }),
  };

  try {
    const dismissed = await service.dismissInfluenceProposal("novel-1", "character-1", "proposal-1");
    assert.equal(dismissed.status, "dismissed");
  } finally {
    prisma.chapter = originalChapter;
    prisma.characterInfluenceProposal = originalProposal;
  }
});

test("listing expires accepted and draft proposals after their chapter window closes", async () => {
  const service = new CharacterInfluenceService();
  const originalChapter = prisma.chapter;
  const originalProposal = prisma.characterInfluenceProposal;
  let expiryCall = null;
  prisma.chapter = { findFirst: async () => ({ order: 11 }) };
  prisma.characterInfluenceProposal = {
    updateMany: async (args) => {
      expiryCall = args;
      return { count: 2 };
    },
    findMany: async () => [proposalRow({ status: "expired" })],
  };

  try {
    const proposals = await service.listInfluenceProposals("novel-1", "character-1");
    assert.equal(proposals[0].status, "expired");
    assert.deepEqual(expiryCall.where.status, { in: ["draft", "accepted"] });
    assert.deepEqual(expiryCall.where.targetEndChapterOrder, { lt: 11 });
  } finally {
    prisma.chapter = originalChapter;
    prisma.characterInfluenceProposal = originalProposal;
  }
});
