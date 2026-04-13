const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { auditService } = require("../dist/services/audit/AuditService.js");
const { plannerService } = require("../dist/services/planner/PlannerService.js");
const { GenerationContextAssembler } = require("../dist/services/novel/runtime/GenerationContextAssembler.js");
const { NovelCoreReviewService } = require("../dist/services/novel/novelCoreReviewService.js");
const { ragServices } = require("../dist/services/rag/index.js");

function createAssembledContextPackage() {
  return {
    chapter: {
      id: "chapter-1",
      title: "第1章",
      order: 1,
      content: "章节正文",
      expectation: "推进冲突",
      supportingContextText: "",
    },
    plan: {
      id: "plan-1",
      chapterId: "chapter-1",
      planRole: "pressure",
      phaseLabel: "起势",
      title: "第1章计划",
      objective: "推进冲突",
      participants: ["主角"],
      reveals: [],
      riskNotes: [],
      mustAdvance: ["推进冲突"],
      mustPreserve: ["压迫感"],
      sourceIssueIds: [],
      replannedFromPlanId: null,
      hookTarget: "留下下一轮压力",
      rawPlanJson: null,
      scenes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stateSnapshot: null,
    openConflicts: [],
    storyWorldSlice: null,
    characterRoster: [{
      id: "char-1",
      name: "主角",
      role: "主角",
      personality: "倔强",
      currentState: "受压",
      currentGoal: "翻盘",
    }],
    creativeDecisions: [],
    openAuditIssues: [],
    previousChaptersSummary: [],
    openingHint: "Recent openings: none.",
    continuation: {
      enabled: false,
      sourceType: null,
      sourceId: null,
      sourceTitle: "",
      systemRule: "",
      humanBlock: "",
      antiCopyCorpus: [],
    },
    styleContext: null,
    characterDynamics: {
      novelId: "novel-1",
      currentVolume: {
        id: "volume-1",
        title: "第一卷",
        sortOrder: 1,
        startChapterOrder: 1,
        endChapterOrder: 10,
        currentChapterOrder: 1,
      },
      summary: "第一卷需要建立压迫源。",
      pendingCandidateCount: 0,
      characters: [{
        characterId: "char-1",
        name: "主角",
        role: "主角",
        castRole: "lead",
        currentState: "受压",
        currentGoal: "翻盘",
        volumeRoleLabel: "破局者",
        volumeResponsibility: "撑住第一轮压迫并开始反击",
        isCoreInVolume: true,
        plannedChapterOrders: [1],
        appearanceCount: 1,
        lastAppearanceChapterOrder: 1,
        absenceSpan: 0,
        absenceRisk: "none",
        factionLabel: "主角方",
        stanceLabel: "反扑",
      }],
      relations: [],
      candidates: [],
      factionTracks: [],
      assignments: [],
    },
    bookContract: {
      title: "测试小说",
      genre: "都市",
      targetAudience: "新手向男频读者",
      sellingPoint: "高压开局",
      first30ChapterPromise: "尽快兑现压迫与反压",
      narrativePov: "limited-third-person",
      pacePreference: "fast",
      emotionIntensity: "high",
      toneGuardrails: [],
      hardConstraints: [],
    },
    macroConstraints: null,
    volumeWindow: {
      volumeId: "volume-1",
      sortOrder: 1,
      title: "第一卷",
      missionSummary: "建立压迫源",
      adjacentSummary: "无",
      pendingPayoffs: ["伏笔A"],
      softFutureSummary: "无",
    },
    chapterMission: {
      chapterId: "chapter-1",
      chapterOrder: 1,
      title: "第1章",
      objective: "推进冲突",
      expectation: "推进冲突",
      planRole: "pressure",
      hookTarget: "留下下一轮压力",
      mustAdvance: ["推进冲突"],
      mustPreserve: ["压迫感"],
      riskNotes: [],
    },
    chapterWriteContext: {
      bookContract: {
        title: "测试小说",
        genre: "都市",
        targetAudience: "新手向男频读者",
        sellingPoint: "高压开局",
        first30ChapterPromise: "尽快兑现压迫与反压",
        narrativePov: "limited-third-person",
        pacePreference: "fast",
        emotionIntensity: "high",
        toneGuardrails: [],
        hardConstraints: [],
      },
      macroConstraints: null,
      volumeWindow: {
        volumeId: "volume-1",
        sortOrder: 1,
        title: "第一卷",
        missionSummary: "建立压迫源",
        adjacentSummary: "无",
        pendingPayoffs: ["伏笔A"],
        softFutureSummary: "无",
      },
      chapterMission: {
        chapterId: "chapter-1",
        chapterOrder: 1,
        title: "第1章",
        objective: "推进冲突",
        expectation: "推进冲突",
        planRole: "pressure",
        hookTarget: "留下下一轮压力",
        mustAdvance: ["推进冲突"],
        mustPreserve: ["压迫感"],
        riskNotes: [],
      },
      participants: [{
        id: "char-1",
        name: "主角",
        role: "主角",
        personality: "倔强",
        currentState: "受压",
        currentGoal: "翻盘",
      }],
      characterBehaviorGuides: [{
        characterId: "char-1",
        name: "主角",
        role: "主角",
        castRole: "lead",
        volumeRoleLabel: "破局者",
        volumeResponsibility: "撑住第一轮压迫并开始反击",
        currentGoal: "翻盘",
        currentState: "受压",
        factionLabel: "主角方",
        stanceLabel: "反扑",
        relationStageLabels: [],
        relationRiskNotes: [],
        plannedChapterOrders: [1],
        absenceRisk: "none",
        absenceSpan: 0,
        isCoreInVolume: true,
        shouldPreferAppearance: true,
      }],
      activeRelationStages: [],
      pendingCandidateGuards: [],
      localStateSummary: "主角刚被压住。",
      openConflictSummaries: ["第一次反压尚未开始。"],
      recentChapterSummaries: [],
      openingAntiRepeatHint: "Recent openings: none.",
      styleConstraints: [],
      continuationConstraints: [],
      ragFacts: [],
    },
    chapterReviewContext: {
      marker: "shared-review-context",
    },
    chapterRepairContext: null,
    promptBudgetProfiles: [],
  };
}

test("manual review and manual audit pass assembled chapter review context into audit service", async () => {
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalChapterUpdate = prisma.chapter.update;
  const originalQualityReportCreate = prisma.qualityReport.create;
  const originalShouldTriggerReplanFromAudit = plannerService.shouldTriggerReplanFromAudit;
  const originalAuditChapter = auditService.auditChapter;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;

  const auditCalls = [];
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  prisma.chapter.update = async () => null;
  prisma.qualityReport.create = async () => null;
  plannerService.shouldTriggerReplanFromAudit = () => false;
  GenerationContextAssembler.prototype.assemble = async () => ({
    novel: { id: "novel-1", title: "测试小说" },
    chapter: { id: "chapter-1", title: "第1章", order: 1, content: "章节正文", expectation: "推进冲突" },
    contextPackage: createAssembledContextPackage(),
  });
  auditService.auditChapter = async (_novelId, _chapterId, scope, options = {}) => {
    auditCalls.push([scope, options.contextPackage?.chapterReviewContext?.marker]);
    return {
      score: {
        coherence: 85,
        repetition: 10,
        pacing: 82,
        voice: 81,
        engagement: 84,
        overall: 84,
      },
      issues: [],
      auditReports: [],
    };
  };

  try {
    const service = new NovelCoreReviewService();
    await service.reviewChapter("novel-1", "chapter-1", {});
    await service.auditChapter("novel-1", "chapter-1", "plot", {});
    assert.deepEqual(auditCalls, [
      ["full", "shared-review-context"],
      ["plot", "shared-review-context"],
    ]);
  } finally {
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.chapter.update = originalChapterUpdate;
    prisma.qualityReport.create = originalQualityReportCreate;
    plannerService.shouldTriggerReplanFromAudit = originalShouldTriggerReplanFromAudit;
    auditService.auditChapter = originalAuditChapter;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
  }
});

test("repair stream builds prompt blocks from the assembled repair context package", async () => {
  const originalNovelFindUnique = prisma.novel.findUnique;
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalBibleFindUnique = prisma.novelBible.findUnique;
  const originalStreamTextPrompt = promptRunner.streamTextPrompt;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;
  const originalBuildContextBlock = ragServices.hybridRetrievalService.buildContextBlock;

  let capturedContextBlocks = null;
  prisma.novel.findUnique = async () => ({ id: "novel-1", title: "测试小说" });
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
  });
  prisma.novelBible.findUnique = async () => ({ rawContent: "作品圣经" });
  ragServices.hybridRetrievalService.buildContextBlock = async () => "";
  GenerationContextAssembler.prototype.assemble = async () => ({
    novel: { id: "novel-1", title: "测试小说" },
    chapter: { id: "chapter-1", title: "第1章", order: 1, content: "章节正文", expectation: "推进冲突" },
    contextPackage: createAssembledContextPackage(),
  });
  promptRunner.streamTextPrompt = async ({ contextBlocks }) => {
    capturedContextBlocks = contextBlocks;
    return {
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: "修复片段" };
        },
      },
      complete: Promise.resolve({ output: "修复片段" }),
    };
  };

  try {
    const service = new NovelCoreReviewService();
    await service.createRepairStream("novel-1", "chapter-1", {
      reviewIssues: [{
        severity: "high",
        category: "pacing",
        evidence: "第一次反压没有实际落地。",
        fixSuggestion: "让主角在本章拿到明确反压结果。",
      }],
    });

    assert.ok(Array.isArray(capturedContextBlocks));
    assert.ok(capturedContextBlocks.some((block) => block.id === "character_dynamics"));
    assert.ok(capturedContextBlocks.some((block) => block.id === "structure_obligations"));
    assert.ok(capturedContextBlocks.some((block) => block.id === "repair_boundaries"));
  } finally {
    prisma.novel.findUnique = originalNovelFindUnique;
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.novelBible.findUnique = originalBibleFindUnique;
    promptRunner.streamTextPrompt = originalStreamTextPrompt;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
    ragServices.hybridRetrievalService.buildContextBlock = originalBuildContextBlock;
  }
});
