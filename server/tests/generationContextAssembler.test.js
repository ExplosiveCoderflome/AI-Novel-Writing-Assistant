const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GenerationContextAssembler,
  buildBlockingPendingReviewProposalWhere,
  resolveChapterResourceCharacterIds,
} = require("../dist/services/novel/runtime/GenerationContextAssembler.js");
const { prisma } = require("../dist/db/prisma.js");
const { plannerService } = require("../dist/services/planner/PlannerService.js");
const { contextAssemblyService } = require("../dist/services/novel/production/ContextAssemblyService.js");
const { ragServices } = require("../dist/services/rag/index.js");
const { novelReferenceService } = require("../dist/services/novel/NovelReferenceService.js");
const { characterDynamicsQueryService } = require("../dist/services/novel/dynamics/CharacterDynamicsQueryService.js");
const { payoffLedgerSyncService } = require("../dist/services/payoff/PayoffLedgerSyncService.js");
const { characterResourceLedgerService } = require("../dist/services/novel/characterResource/CharacterResourceLedgerService.js");

test("blocking pending-review proposals are scoped to the current chapter plus global proposals", () => {
  const where = buildBlockingPendingReviewProposalWhere("novel-1", "chapter-2");

  assert.deepEqual(where, {
    novelId: "novel-1",
    status: "pending_review",
    OR: [
      { chapterId: "chapter-2" },
      { chapterId: null },
    ],
  });
});

test("chapter resource character ids are resolved from plan participant names", () => {
  const now = new Date();
  const ids = resolveChapterResourceCharacterIds({
    plan: {
      participantsJson: JSON.stringify(["女二", "主角"]),
      scenes: [],
      createdAt: now,
      updatedAt: now,
    },
    characters: [
      { id: "char-1", name: "主角" },
      { id: "char-2", name: "女二" },
      { id: "char-3", name: "路人" },
    ],
  });

  assert.deepEqual(ids, ["char-1", "char-2"]);
});

function createSceneCards(prefix) {
  return JSON.stringify({
    targetWordCount: 3000,
    lengthBudget: {
      targetWordCount: 3000,
      softMinWordCount: 2550,
      softMaxWordCount: 3450,
      hardMaxWordCount: 3750,
    },
    scenes: [1, 2, 3].map((index) => ({
      key: `${prefix}-${index}`,
      title: `${prefix}场景${index}`,
      purpose: `${prefix}场景${index}目标`,
      mustAdvance: [`${prefix}推进${index}`],
      mustPreserve: [`${prefix}保留${index}`],
      entryState: `${prefix}入口${index}`,
      exitState: `${prefix}出口${index}`,
      forbiddenExpansion: [`${prefix}禁止扩展${index}`],
      targetWordCount: 1000,
    })),
  });
}

function createCanonicalSnapshot() {
  const now = new Date().toISOString();
  return {
    novelId: "novel-1",
    sourceSnapshotId: null,
    scopeLabel: "chapter",
    bookContract: {
      title: "测试小说",
      genre: "玄幻",
      targetAudience: null,
      sellingPoint: null,
      first30ChapterPromise: null,
      toneGuardrails: [],
      hardConstraints: [],
    },
    worldState: null,
    characters: [],
    narrative: {
      currentChapterId: "chapter-1",
      currentChapterOrder: 1,
      currentChapterGoal: "写当前章",
      openConflicts: [],
      pendingPayoffs: [],
      urgentPayoffs: [],
      overduePayoffs: [],
      publicKnowledge: [],
      hiddenKnowledge: [],
      suspenseThreads: [],
    },
    timeline: [],
    createdAt: now,
  };
}

function createStoryWorldSlice() {
  return {
    storyId: "novel-1",
    worldId: "world-slice-1",
    coreWorldFrame: "星核枯竭的北境舞台。",
    appliedRules: [{
      id: "rule-star-core",
      name: "星核代价",
      summary: "透支星核会损伤寿命。",
      whyItMatters: "能力不能无代价升级。",
    }],
    activeForces: [],
    activeLocations: [],
    activeElements: [],
    conflictCandidates: [],
    pressureSources: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    recommendedEntryPoints: [],
    forbiddenCombinations: ["不要把星核写成普通灵石"],
    storyScopeBoundary: "前期限定在北境。",
    metadata: {
      schemaVersion: 1,
      builtAt: new Date().toISOString(),
      sourceWorldUpdatedAt: null,
      storyInputDigest: "digest",
      builtFromStructuredData: true,
      builderMode: "runtime",
    },
  };
}

test("assembler refreshes chapter execution fields after chapter plan regeneration", async () => {
  const staleSceneCards = createSceneCards("旧合同");
  const freshSceneCards = createSceneCards("新合同");
  const now = new Date();
  let chapterFindFirstCalls = 0;

  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    chapterFindFirst: prisma.chapter.findFirst,
    stateChangeProposalCount: prisma.stateChangeProposal.count,
    stateChangeProposalFindMany: prisma.stateChangeProposal.findMany,
    auditIssueFindMany: prisma.auditIssue.findMany,
    novelBibleFindUnique: prisma.novelBible.findUnique,
    chapterSummaryFindMany: prisma.chapterSummary.findMany,
    consistencyFactFindMany: prisma.consistencyFact.findMany,
    chapterFindMany: prisma.chapter.findMany,
    creativeDecisionFindMany: prisma.creativeDecision.findMany,
    ensureChapterPlan: plannerService.ensureChapterPlan,
    buildPlanPromptBlock: plannerService.buildPlanPromptBlock,
    buildStateContext: contextAssemblyService.build,
    buildReferenceForStage: novelReferenceService.buildReferenceForStage,
    getCharacterDynamics: characterDynamicsQueryService.getOverview,
    buildRagContext: ragServices.hybridRetrievalService.buildContextBlock,
    getPayoffLedger: payoffLedgerSyncService.getPayoffLedger,
    buildCharacterResourceContext: characterResourceLedgerService.buildContext,
  };

  try {
    prisma.novel.findUnique = async () => ({
      id: "novel-1",
      title: "测试小说",
      world: null,
      genre: { name: "玄幻" },
      characters: [],
      storyMacroPlan: null,
      volumePlans: [],
      primaryStoryMode: null,
      secondaryStoryMode: null,
      targetAudience: null,
      bookSellingPoint: null,
      first30ChapterPromise: null,
      narrativePov: null,
      pacePreference: null,
      emotionIntensity: null,
      styleTone: null,
      outline: null,
      structuredOutline: null,
    });
    prisma.chapter.findFirst = async () => {
      chapterFindFirstCalls += 1;
      return {
        id: "chapter-1",
        title: "第1章",
        order: 1,
        content: null,
        expectation: chapterFindFirstCalls === 1 ? "旧目标" : "新目标",
        targetWordCount: 3000,
        conflictLevel: 2,
        revealLevel: 1,
        mustAvoid: chapterFindFirstCalls === 1 ? "旧禁止" : "新禁止",
        taskSheet: chapterFindFirstCalls === 1 ? "旧任务单" : "新任务单",
        sceneCards: chapterFindFirstCalls === 1 ? staleSceneCards : freshSceneCards,
        hook: chapterFindFirstCalls === 1 ? "旧钩子" : "新钩子",
      };
    };
    prisma.stateChangeProposal.count = async () => 0;
    prisma.stateChangeProposal.findMany = async () => [];
    prisma.auditIssue.findMany = async () => [];
    prisma.novelBible.findUnique = async () => null;
    prisma.chapterSummary.findMany = async () => [];
    prisma.consistencyFact.findMany = async () => [];
    prisma.chapter.findMany = async () => [];
    prisma.creativeDecision.findMany = async () => [];
    plannerService.ensureChapterPlan = async () => ({
      id: "plan-1",
      chapterId: "chapter-1",
      planRole: "pressure",
      phaseLabel: "起点",
      title: "计划",
      objective: "新目标",
      participantsJson: "[]",
      revealsJson: "[]",
      riskNotesJson: "[]",
      mustAdvanceJson: "[]",
      mustPreserveJson: "[]",
      sourceIssueIdsJson: "[]",
      replannedFromPlanId: null,
      hookTarget: "新钩子",
      rawPlanJson: null,
      scenes: [],
      createdAt: now,
      updatedAt: now,
    });
    plannerService.buildPlanPromptBlock = async () => "";
    contextAssemblyService.build = async () => ({
      snapshot: createCanonicalSnapshot(),
      nextAction: "write_chapter",
      chapterStateGoal: null,
      protectedSecrets: [],
    });
    novelReferenceService.buildReferenceForStage = async () => "";
    characterDynamicsQueryService.getOverview = async () => null;
    ragServices.hybridRetrievalService.buildContextBlock = async () => "";
    payoffLedgerSyncService.getPayoffLedger = async () => ({ items: [] });
    characterResourceLedgerService.buildContext = async () => null;

    const assembler = new GenerationContextAssembler();
    const storyWorldSlice = createStoryWorldSlice();
    assembler.worldContextGateway = {
      getWorldContextBlock: async (id, options) => {
        assert.equal(id, "novel-1");
        assert.deepEqual(options, { purpose: "chapter" });
        return {
          promptBlock: "【本书世界上下文｜用途：chapter】\n星核枯竭的北境舞台。",
          rawSlice: storyWorldSlice,
        };
      },
    };
    assembler.continuationService = {
      buildChapterContextPack: async () => ({
        enabled: false,
        sourceType: null,
        sourceId: null,
        sourceTitle: null,
        systemRule: "",
        humanBlock: "",
        antiCopyCorpus: [],
      }),
    };
    assembler.styleBindingService = {
      resolveForGeneration: async () => ({
        matchedBindings: [],
        compiledBlocks: null,
        effectiveStyleProfileId: null,
        taskStyleProfileId: null,
        activeSourceTargets: [],
        activeSourceLabels: [],
        globalAntiAiRuleIds: [],
        styleAntiAiRuleIds: [],
        sanitizedGenerationProfile: null,
      }),
    };

    const assembled = await assembler.assemble("novel-1", "chapter-1", {});

    assert.equal(chapterFindFirstCalls, 2);
    assert.equal(assembled.chapter.taskSheet, "新任务单");
    assert.equal(assembled.contextPackage.chapter.sceneCards, freshSceneCards);
    assert.equal(assembled.contextPackage.storyWorldSlice, storyWorldSlice);
    assert.match(assembled.contextPackage.chapter.supportingContextText, /本书世界上下文/);
    assert.match(assembled.contextPackage.chapter.supportingContextText, /星核枯竭的北境舞台/);
    assert.equal(assembled.contextPackage.chapterWriteContext.chapterBoundary.entryState, "新合同入口1");
    assert.ok(assembled.contextPackage.chapterWriteContext.chapterBoundary.doNotCross.includes("新禁止"));
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findFirst = originals.chapterFindFirst;
    prisma.stateChangeProposal.count = originals.stateChangeProposalCount;
    prisma.stateChangeProposal.findMany = originals.stateChangeProposalFindMany;
    prisma.auditIssue.findMany = originals.auditIssueFindMany;
    prisma.novelBible.findUnique = originals.novelBibleFindUnique;
    prisma.chapterSummary.findMany = originals.chapterSummaryFindMany;
    prisma.consistencyFact.findMany = originals.consistencyFactFindMany;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.creativeDecision.findMany = originals.creativeDecisionFindMany;
    plannerService.ensureChapterPlan = originals.ensureChapterPlan;
    plannerService.buildPlanPromptBlock = originals.buildPlanPromptBlock;
    contextAssemblyService.build = originals.buildStateContext;
    novelReferenceService.buildReferenceForStage = originals.buildReferenceForStage;
    characterDynamicsQueryService.getOverview = originals.getCharacterDynamics;
    ragServices.hybridRetrievalService.buildContextBlock = originals.buildRagContext;
    payoffLedgerSyncService.getPayoffLedger = originals.getPayoffLedger;
    characterResourceLedgerService.buildContext = originals.buildCharacterResourceContext;
  }
});
