const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { auditService } = require("../dist/services/audit/AuditService.js");
const { plannerService } = require("../dist/services/planner/PlannerService.js");
const { GenerationContextAssembler } = require("../dist/services/novel/runtime/GenerationContextAssembler.js");
const { NovelCoreReviewService } = require("../dist/services/novel/novelCoreReviewService.js");
const novelCoreShared = require("../dist/services/novel/novelCoreShared.js");
const { ragServices } = require("../dist/services/rag/index.js");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    ledgerPendingItems: [],
    ledgerUrgentItems: [],
    ledgerOverdueItems: [],
    ledgerSummary: null,
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
        targetWordCount: null,
        planRole: "pressure",
        hookTarget: "留下下一轮压力",
        mustAdvance: ["推进冲突"],
        mustPreserve: ["压迫感"],
        riskNotes: [],
      },
      nextAction: "让主角拿到第一次反压抓手。",
      chapterStateGoal: null,
      protectedSecrets: [],
      lengthBudget: {
        targetWordCount: null,
        minWordCount: null,
        maxWordCount: null,
      },
      scenePlan: null,
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
      ledgerPendingItems: [],
      ledgerUrgentItems: [],
      ledgerOverdueItems: [],
      ledgerSummary: null,
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

test("manual review and manual audit pass assembled chapter review context into audit service", { timeout: 2000 }, async () => {
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalChapterUpdate = prisma.chapter.update;
  const originalQualityReportCreate = prisma.qualityReport.create;
  const originalBuildReplanRecommendation = plannerService.buildReplanRecommendation;
  const originalReplan = plannerService.replan;
  const originalAuditChapter = auditService.auditChapter;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;

  const auditCalls = [];
  const chapterUpdateCalls = [];
  const qualityReportCalls = [];
  const replanCalls = [];
  const callOrder = [];
  const updateStarted = createDeferred();
  const qualityReportStarted = createDeferred();
  const replanStarted = createDeferred();
  const updateDeferred = createDeferred();
  const qualityReportDeferred = createDeferred();
  const deferred = createDeferred();
  let reviewResolved = false;
  let replanFinished = false;

  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  prisma.chapter.update = async (payload) => {
    chapterUpdateCalls.push(payload);
    callOrder.push("chapter.update");
    updateStarted.resolve();
    await updateDeferred.promise;
    return null;
  };
  prisma.qualityReport.create = async (payload) => {
    qualityReportCalls.push(payload);
    callOrder.push("qualityReport.create");
    qualityReportStarted.resolve();
    await qualityReportDeferred.promise;
    return null;
  };
  plannerService.buildReplanRecommendation = () => ({
    recommended: true,
    reason: "存在阻塞问题",
    triggerReason: "存在阻塞问题",
    blockingIssueIds: ["issue-1"],
  });
  plannerService.replan = async (...args) => {
    replanCalls.push(args);
    callOrder.push("planner.replan");
    replanStarted.resolve();
    await deferred.promise;
    replanFinished = true;
    return { generatedPlans: [] };
  };
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
      auditReports: [{ id: "report-1", issues: [] }],
    };
  };

  try {
    const service = new NovelCoreReviewService();
    const reviewPromise = service.reviewChapter("novel-1", "chapter-1", {});
    await updateStarted.promise;
    assert.equal(replanCalls.length, 0);
    updateDeferred.resolve();
    await qualityReportStarted.promise;
    assert.equal(qualityReportCalls.length, 1);
    assert.equal(replanCalls.length, 0);
    qualityReportDeferred.resolve();
    await replanStarted.promise;
    await reviewPromise;
    reviewResolved = true;
    assert.equal(reviewResolved, true);
    assert.equal(replanFinished, false);
    assert.equal(replanCalls.length, 1);
    assert.equal(qualityReportCalls.length, 1);
    assert.deepEqual(callOrder, ["chapter.update", "qualityReport.create", "planner.replan"]);
    assert.deepEqual(replanCalls[0], ["novel-1", {
      chapterId: "chapter-1",
      triggerType: "audit_failure",
      reason: "存在阻塞问题",
      sourceIssueIds: ["issue-1"],
      provider: undefined,
      model: undefined,
      temperature: undefined,
    }]);
    await service.auditChapter("novel-1", "chapter-1", "plot", {});
    assert.deepEqual(auditCalls, [
      ["full", "shared-review-context"],
      ["plot", "shared-review-context"],
    ]);
    assert.deepEqual(chapterUpdateCalls[0], {
      where: { id: "chapter-1" },
      data: {
        generationState: "reviewed",
        chapterStatus: "completed",
      },
    });
  } finally {
    updateDeferred.resolve();
    qualityReportDeferred.resolve();
    deferred.resolve();
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.chapter.update = originalChapterUpdate;
    prisma.qualityReport.create = originalQualityReportCreate;
    plannerService.buildReplanRecommendation = originalBuildReplanRecommendation;
    plannerService.replan = originalReplan;
    auditService.auditChapter = originalAuditChapter;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
  }
});

test("concurrent manual reviews dedupe background replans for the same chapter", { timeout: 2000 }, async () => {
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalChapterUpdate = prisma.chapter.update;
  const originalQualityReportCreate = prisma.qualityReport.create;
  const originalBuildReplanRecommendation = plannerService.buildReplanRecommendation;
  const originalReplan = plannerService.replan;
  const originalAuditChapter = auditService.auditChapter;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;

  const replanStarted = createDeferred();
  const releaseReplan = createDeferred();
  let replanCallCount = 0;

  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  prisma.chapter.update = async () => null;
  prisma.qualityReport.create = async () => null;
  plannerService.buildReplanRecommendation = () => ({
    recommended: true,
    reason: "存在阻塞问题",
    triggerReason: "存在阻塞问题",
    blockingIssueIds: ["issue-1"],
  });
  plannerService.replan = async () => {
    replanCallCount += 1;
    replanStarted.resolve();
    await releaseReplan.promise;
    return { generatedPlans: [] };
  };
  GenerationContextAssembler.prototype.assemble = async () => ({
    novel: { id: "novel-1", title: "测试小说" },
    chapter: { id: "chapter-1", title: "第1章", order: 1, content: "章节正文", expectation: "推进冲突" },
    contextPackage: createAssembledContextPackage(),
  });
  auditService.auditChapter = async () => ({
    score: {
      coherence: 85,
      repetition: 10,
      pacing: 82,
      voice: 81,
      engagement: 84,
      overall: 84,
    },
    issues: [],
    auditReports: [{ id: "report-1", issues: [] }],
  });

  try {
    const service = new NovelCoreReviewService();
    const firstReview = service.reviewChapter("novel-1", "chapter-1", {});
    await replanStarted.promise;
    const secondReview = service.reviewChapter("novel-1", "chapter-1", {});
    await Promise.all([firstReview, secondReview]);
    assert.equal(replanCallCount, 1);
  } finally {
    releaseReplan.resolve();
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.chapter.update = originalChapterUpdate;
    prisma.qualityReport.create = originalQualityReportCreate;
    plannerService.buildReplanRecommendation = originalBuildReplanRecommendation;
    plannerService.replan = originalReplan;
    auditService.auditChapter = originalAuditChapter;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
  }
});

test("manual review ignores background replan failures after persistence", { timeout: 2000 }, async () => {
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalChapterUpdate = prisma.chapter.update;
  const originalQualityReportCreate = prisma.qualityReport.create;
  const originalBuildReplanRecommendation = plannerService.buildReplanRecommendation;
  const originalReplan = plannerService.replan;
  const originalAuditChapter = auditService.auditChapter;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;
  const originalLogPipelineWarn = novelCoreShared.logPipelineWarn;

  const warnings = [];
  const warningLogged = createDeferred();
  const qualityReportCalls = [];
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  prisma.chapter.update = async () => null;
  prisma.qualityReport.create = async (payload) => {
    qualityReportCalls.push(payload);
    return null;
  };
  plannerService.buildReplanRecommendation = () => ({
    recommended: true,
    reason: "存在阻塞问题",
    triggerReason: "存在阻塞问题",
    blockingIssueIds: ["issue-9"],
  });
  plannerService.replan = async () => {
    throw new Error("replan failed");
  };
  GenerationContextAssembler.prototype.assemble = async () => ({
    novel: { id: "novel-1", title: "测试小说" },
    chapter: { id: "chapter-1", title: "第1章", order: 1, content: "章节正文", expectation: "推进冲突" },
    contextPackage: createAssembledContextPackage(),
  });
  auditService.auditChapter = async () => ({
    score: {
      coherence: 85,
      repetition: 10,
      pacing: 82,
      voice: 81,
      engagement: 84,
      overall: 84,
    },
    issues: [],
    auditReports: [{ id: "report-1", issues: [] }],
  });
  novelCoreShared.logPipelineWarn = (message, meta) => {
    warnings.push({ message, meta });
    warningLogged.resolve();
  };

  try {
    const service = new NovelCoreReviewService();
    const review = await service.reviewChapter("novel-1", "chapter-1", {});
    await warningLogged.promise;
    assert.equal(review.score.overall, 84);
    assert.equal(qualityReportCalls.length, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "自动重规划失败，已跳过，不影响本次章节审阅返回");
    assert.deepEqual(warnings[0].meta, {
      novelId: "novel-1",
      chapterId: "chapter-1",
      triggerType: "audit_failure",
      reason: "存在阻塞问题",
      sourceIssueIds: ["issue-9"],
      error: "replan failed",
    });
  } finally {
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.chapter.update = originalChapterUpdate;
    prisma.qualityReport.create = originalQualityReportCreate;
    plannerService.buildReplanRecommendation = originalBuildReplanRecommendation;
    plannerService.replan = originalReplan;
    auditService.auditChapter = originalAuditChapter;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
    novelCoreShared.logPipelineWarn = originalLogPipelineWarn;
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

test("manual review and manual audit fail loudly when chapter context assembly breaks", async () => {
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalAuditChapter = auditService.auditChapter;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;
  const originalLogPipelineError = novelCoreShared.logPipelineError;

  const loggedFailures = [];
  let auditCallCount = 0;
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  GenerationContextAssembler.prototype.assemble = async () => {
    throw new Error("runtime context missing");
  };
  auditService.auditChapter = async () => {
    auditCallCount += 1;
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
  novelCoreShared.logPipelineError = (message, meta) => {
    loggedFailures.push({ message, meta });
  };

  try {
    const service = new NovelCoreReviewService();
    await assert.rejects(
      service.reviewChapter("novel-1", "chapter-1", {}),
      /章节上下文装配失败，无法继续章节审阅/,
    );
    await assert.rejects(
      service.auditChapter("novel-1", "chapter-1", "plot", {}),
      /章节上下文装配失败，无法继续章节审计/,
    );
    assert.equal(auditCallCount, 0);
    assert.equal(loggedFailures.length, 2);
    assert.equal(loggedFailures[0].meta.operation, "review");
    assert.equal(loggedFailures[1].meta.operation, "audit");
  } finally {
    prisma.chapter.findFirst = originalChapterFindFirst;
    auditService.auditChapter = originalAuditChapter;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
    novelCoreShared.logPipelineError = originalLogPipelineError;
  }
});

test("repair stream fails loudly when chapter context assembly breaks", async () => {
  const originalNovelFindUnique = prisma.novel.findUnique;
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalBibleFindUnique = prisma.novelBible.findUnique;
  const originalAssemble = GenerationContextAssembler.prototype.assemble;
  const originalBuildContextBlock = ragServices.hybridRetrievalService.buildContextBlock;
  const originalLogPipelineError = novelCoreShared.logPipelineError;

  const loggedFailures = [];
  prisma.novel.findUnique = async () => ({ id: "novel-1", title: "测试小说" });
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "章节正文",
    novel: { title: "测试小说" },
  });
  prisma.novelBible.findUnique = async () => ({ rawContent: "作品圣经" });
  ragServices.hybridRetrievalService.buildContextBlock = async () => "";
  GenerationContextAssembler.prototype.assemble = async () => {
    throw new Error("legacy volume data missing");
  };
  novelCoreShared.logPipelineError = (message, meta) => {
    loggedFailures.push({ message, meta });
  };

  try {
    const service = new NovelCoreReviewService();
    await assert.rejects(
      service.createRepairStream("novel-1", "chapter-1", {
        reviewIssues: [{
          severity: "high",
          category: "coherence",
          evidence: "前后设定断裂",
          fixSuggestion: "回填设定约束",
        }],
      }),
      /章节上下文装配失败，无法继续章节修复/,
    );
    assert.equal(loggedFailures.length, 1);
    assert.equal(loggedFailures[0].meta.operation, "repair");
  } finally {
    prisma.novel.findUnique = originalNovelFindUnique;
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.novelBible.findUnique = originalBibleFindUnique;
    GenerationContextAssembler.prototype.assemble = originalAssemble;
    ragServices.hybridRetrievalService.buildContextBlock = originalBuildContextBlock;
    novelCoreShared.logPipelineError = originalLogPipelineError;
  }
});
