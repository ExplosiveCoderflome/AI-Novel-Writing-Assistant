const test = require("node:test");
const assert = require("node:assert/strict");
const { NovelProductionStatusService } = require("../dist/services/novel/NovelProductionStatusService.js");

function buildNovel(overrides = {}) {
  const chapterCount = overrides.chapterCount ?? 20;
  return {
    id: "novel-1",
    title: "事实进展测试",
    world: overrides.world === undefined ? { id: "world-1", name: "测试世界" } : overrides.world,
    novelWorld: overrides.novelWorld ?? null,
    bible: { mainPromise: "读者承诺", coreSetting: "核心设定" },
    characters: [{ id: "character-1" }, { id: "character-2" }, { id: "character-3" }],
    outline: "发展走向",
    structuredOutline: "",
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      id: `chapter-${index + 1}`,
      order: index + 1,
    })),
    generationJobs: overrides.job ? [overrides.job] : [],
  };
}

function buildFactSummary(overrides = {}) {
  const plannedChapterCount = overrides.plannedChapterCount ?? 20;
  const draftedChapterCount = overrides.draftedChapterCount ?? 8;
  const reviewedChapterCount = overrides.reviewedChapterCount ?? 4;
  const committedChapterCount = overrides.committedChapterCount ?? 2;
  const needsRepairChapterCount = overrides.needsRepairChapterCount ?? 0;
  return {
    hasNovelProject: true,
    candidate: {
      batchCount: 0,
      candidateCount: 0,
      mode: null,
      checkpointReady: false,
    },
    book: {
      hasStoryMacro: true,
      hasBookContract: true,
      characterCount: 3,
    },
    outline: {
      hasVolumeStrategy: true,
      volumeCount: 4,
      plannedChapterCount,
      beatSheetReady: true,
      chapterListReady: true,
      chapterDetailReady: true,
      selectedChapterCount: plannedChapterCount,
      completedDetailSteps: plannedChapterCount,
      totalDetailSteps: plannedChapterCount,
      syncedChapterCount: plannedChapterCount,
      cursorStep: "completed",
    },
    chapterExecution: null,
    repair: {
      draftedChapterCount,
      reviewedChapterCount,
      committedChapterCount,
      needsRepairChapterCount,
      hasReviewableDrafts: draftedChapterCount > 0,
    },
    artifactSync: {
      payoffArtifactCount: 0,
      characterResourceArtifactCount: 0,
    },
  };
}

function buildChapterProgress(overrides = {}) {
  const totalChapters = overrides.totalChapters ?? 20;
  const draftedChapterCount = overrides.draftedChapterCount ?? 8;
  const reviewedChapterCount = overrides.reviewedChapterCount ?? 4;
  const committedChapterCount = overrides.committedChapterCount ?? 2;
  const needsRepairChapters = overrides.needsRepairChapters ?? 0;
  return {
    totalChapters,
    draftedChapterCount,
    approvedChapterCount: overrides.approvedChapterCount ?? 0,
    completedChapters: overrides.completedChapters ?? 0,
    needsRepairChapters,
    activeChapterId: null,
    activeChapterOrder: null,
    currentChapterId: draftedChapterCount < totalChapters ? `chapter-${draftedChapterCount + 1}` : null,
    currentChapterOrder: draftedChapterCount < totalChapters ? draftedChapterCount + 1 : null,
    currentStage: null,
    recoverableRange: { startOrder: 1, endOrder: totalChapters },
    ratio: overrides.ratio ?? draftedChapterCount / Math.max(1, totalChapters),
    chapters: Array.from({ length: totalChapters }, (_, index) => {
      const order = index + 1;
      const completedStages = [];
      if (order <= draftedChapterCount) completedStages.push("draft_saved");
      if (order <= reviewedChapterCount) completedStages.push("audit_completed");
      if (order <= committedChapterCount) completedStages.push("chapter_state_committed");
      return {
        chapterId: `chapter-${order}`,
        chapterOrder: order,
        status: order <= needsRepairChapters ? "needs_repair" : "running",
        currentStage: "reviewable_or_approved",
        completedStages,
        missingStages: [],
        evidence: {},
        recoverable: true,
        nextAction: "continue_next_chapter",
      };
    }),
  };
}

function createService(novel, factSummary, chapterProgress) {
  return new NovelProductionStatusService({
    db: {
      novel: {
        findUnique: async () => novel,
        findFirst: async () => novel,
      },
    },
    factSummaryService: {
      getBaseSummary: async () => factSummary,
    },
    chapterInspector: {
      inspectNovel: async () => chapterProgress,
    },
    novelWorldReader: async () => novel.novelWorld ?? null,
  });
}

test("NovelProductionStatusService does not complete the book from a succeeded job alone", async () => {
  const novel = buildNovel({
    job: { id: "job-1", status: "succeeded", error: null },
  });
  const factSummary = buildFactSummary({ draftedChapterCount: 8, reviewedChapterCount: 4, committedChapterCount: 2 });
  const chapterProgress = buildChapterProgress({ draftedChapterCount: 8, reviewedChapterCount: 4, committedChapterCount: 2 });
  const status = await createService(novel, factSummary, chapterProgress).getNovelProductionStatus({
    novelId: "novel-1",
    targetChapterCount: 20,
  });
  assert.equal(status.progressBasis, "facts");
  assert.equal(status.factProgress.draftedChapterCount, 8);
  assert.equal(status.runtimeStatus.state, "succeeded");
  assert.equal(status.currentStage, "章节正文写作中");
  assert.doesNotMatch(status.currentStage, /完成/);
});

test("NovelProductionStatusService treats NovelWorld as the production world asset", async () => {
  const novel = buildNovel({
    world: null,
    novelWorld: {
      id: "novel-world-1",
      title: "本书雾港",
      coverSummary: "黑雾与审判机构共同塑造的本书世界。",
      sourceWorldId: null,
      hasStructuredData: true,
      hasStorySlice: false,
    },
  });
  const factSummary = buildFactSummary({ draftedChapterCount: 0, reviewedChapterCount: 0, committedChapterCount: 0 });
  const chapterProgress = buildChapterProgress({ draftedChapterCount: 0, reviewedChapterCount: 0, committedChapterCount: 0 });
  const status = await createService(novel, factSummary, chapterProgress).getNovelProductionStatus({
    novelId: "novel-1",
    targetChapterCount: 20,
  });

  const worldStage = status.assetStages.find((stage) => stage.key === "world");
  assert.equal(status.factProgress.facts.hasWorld, true);
  assert.equal(status.worldId, null);
  assert.equal(status.worldName, "本书雾港");
  assert.equal(worldStage?.label, "本书世界");
  assert.equal(worldStage?.status, "completed");
  assert.equal(worldStage?.detail, "本书雾港");
  assert.notEqual(status.currentStage, "等待生成世界观");
  assert.doesNotMatch(status.recoveryHint ?? "", /世界观/);
});

test("NovelProductionStatusService keeps fact progress when the latest job failed", async () => {
  const novel = buildNovel({
    job: { id: "job-2", status: "failed", error: "模型调用失败" },
  });
  const factSummary = buildFactSummary({ draftedChapterCount: 8, reviewedChapterCount: 8, committedChapterCount: 6 });
  const chapterProgress = buildChapterProgress({ draftedChapterCount: 8, reviewedChapterCount: 8, committedChapterCount: 6 });
  const status = await createService(novel, factSummary, chapterProgress).getNovelProductionStatus({
    novelId: "novel-1",
    targetChapterCount: 20,
  });
  assert.equal(status.currentStage, "章节正文写作中");
  assert.equal(status.factProgress.reviewedChapterCount, 8);
  assert.equal(status.factProgress.committedChapterCount, 6);
  assert.equal(status.runtimeStatus.state, "failed");
  assert.equal(status.failureSummary, "模型调用失败");
  assert.match(status.summary, /正文 8\/20 章/);
});

test("NovelProductionStatusService prioritizes repair facts over writing completion", async () => {
  const novel = buildNovel({
    job: { id: "job-3", status: "succeeded", error: null },
  });
  const factSummary = buildFactSummary({
    draftedChapterCount: 20,
    reviewedChapterCount: 20,
    committedChapterCount: 18,
    needsRepairChapterCount: 2,
  });
  const chapterProgress = buildChapterProgress({
    draftedChapterCount: 20,
    reviewedChapterCount: 20,
    committedChapterCount: 18,
    needsRepairChapters: 2,
  });
  const status = await createService(novel, factSummary, chapterProgress).getNovelProductionStatus({
    novelId: "novel-1",
    targetChapterCount: 20,
  });
  assert.equal(status.currentStage, "质量修复待处理");
  assert.equal(status.factProgress.needsRepairChapters, 2);
  assert.match(status.recoveryHint, /质量修复/);
  assert.notEqual(status.currentStage, "小说事实进展可交付");
});

test("NovelProductionStatusService reports delivery-ready facts without a job", async () => {
  const novel = buildNovel();
  const factSummary = buildFactSummary({
    draftedChapterCount: 20,
    reviewedChapterCount: 20,
    committedChapterCount: 20,
    needsRepairChapterCount: 0,
  });
  const chapterProgress = buildChapterProgress({
    draftedChapterCount: 20,
    reviewedChapterCount: 20,
    committedChapterCount: 20,
    approvedChapterCount: 20,
    completedChapters: 20,
    ratio: 1,
  });
  const status = await createService(novel, factSummary, chapterProgress).getNovelProductionStatus({
    novelId: "novel-1",
    targetChapterCount: 20,
  });
  assert.equal(status.currentStage, "小说事实进展可交付");
  assert.equal(status.pipelineStatus, null);
  assert.equal(status.runtimeStatus.state, "idle");
  assert.equal(status.factProgress.draftedChapterCount, 20);
  assert.equal(status.factProgress.committedChapterCount, 20);
});
