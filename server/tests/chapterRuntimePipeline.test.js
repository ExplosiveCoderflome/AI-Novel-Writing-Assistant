const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

const {
  runPipelineChapterWithRuntime,
} = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");
const {
  ChapterEmptyContentError,
} = require("../dist/services/novel/runtime/chapterEmptyContentError.js");

function createTextStreamLLM(content) {
  return {
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield { content };
      },
    }),
  };
}

function createRuntimePackage(overallScore, options = {}) {
  return {
    novelId: "novel-1",
    chapterId: "chapter-1",
    audit: {
      score: {
        coherence: overallScore,
        pacing: overallScore,
        repetition: overallScore,
        engagement: overallScore,
        voice: overallScore,
        overall: overallScore,
      },
      openIssues: [{
        auditType: "continuity",
        severity: "medium",
        evidence: "存在承接问题。",
        fixSuggestion: "补足承接。",
        code: "CONTINUITY_GAP",
      }],
      reports: [],
    },
    context: {
      chapterRepairContext: null,
      bookContract: null,
      macroConstraints: null,
      volumeWindow: null,
      styleContext: options.styleContext ?? null,
    },
  };
}

function createAcceptanceGateUnavailableRuntimePackage(overallScore) {
  return {
    ...createRuntimePackage(overallScore),
    audit: {
      score: {
        coherence: overallScore,
        pacing: overallScore,
        repetition: overallScore,
        engagement: overallScore,
        voice: overallScore,
        overall: overallScore,
      },
      openIssues: [{
        auditType: "continuity",
        severity: "medium",
        evidence: "章节接收闸门未返回可用结构化结果，系统保留复查风险。",
        fixSuggestion: "重新审校章节接收判断，不直接修改正文。",
        code: "acceptance_gate_unavailable",
      }],
      reports: [],
      hasBlockingIssues: false,
    },
    meta: {
      acceptanceStatus: "continue_with_risk",
      continuePolicy: "continue",
    },
  };
}

function createProseRiskRuntimePackage(overallScore, options = {}) {
  const base = createRuntimePackage(overallScore, options);
  const severity = options.severity ?? "high";
  const issue = {
    auditType: "mode_fit",
    severity,
    evidence: "第 1 行：他不是害怕，而是终于明白自己不能回头。",
    fixSuggestion: "改成具体动作和感官细节，删除模板化否定翻转。",
    code: options.code ?? "prose_negative_flip",
  };
  return {
    ...base,
    audit: {
      ...base.audit,
      openIssues: [issue],
      reports: [{
        auditType: "mode_fit",
        issues: [issue],
      }],
      hasBlockingIssues: severity === "high" || severity === "critical",
    },
    meta: {
      acceptanceStatus: "accepted",
      continuePolicy: "continue",
    },
    replanRecommendation: {
      recommended: severity === "high" || severity === "critical",
      action: severity === "high" || severity === "critical" ? "local_patch_plan" : "continue_with_warning",
      reason: "Prose quality issue should stay local to the chapter.",
      blockingIssueIds: severity === "high" || severity === "critical" ? ["prose-negative-flip"] : [],
      blockingLedgerKeys: [],
      affectedChapterOrders: [],
    },
    failureClassification: {
      code: "draft_repair_exhausted",
      summary: "正文自然度问题仍未修复。",
      decisionReason: "prose quality issue stays local",
      blockingObligations: [],
    },
  };
}

test("runPipelineChapterWithRuntime skips review and repair when autoReview is disabled", async () => {
  const stages = [];
  const generationStates = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const timelineFinalizationCalls = [];
  let finalizeCalled = false;

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
        savedDrafts.push({ content, generationState, options });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent() {
        finalizeCalled = true;
        throw new Error("should not finalize");
      },
      async finalizeChapterTimeline(input) {
        timelineFinalizationCalls.push(input);
      },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
    "novel-1",
    "chapter-1",
    {
      autoReview: false,
      autoRepair: true,
    },
    {
      async onStageChange(stage) {
        stages.push(stage);
      },
    },
  );

  assert.equal(finalizeCalled, false);
  assert.equal(timelineFinalizationCalls.length, 0);
  assert.deepEqual(stages, ["generating_chapters"]);
  assert.deepEqual(savedDrafts, [{
    content: "生成后的正文",
    generationState: "drafted",
    options: {
      scheduleBackgroundSync: false,
      artifactSyncMode: "adaptive",
      syncArtifacts: false,
    },
  }]);
  assert.equal(finalSyncs.length, 1);
  assert.deepEqual(generationStates, ["approved"]);
  assert.equal(result.reviewExecuted, false);
  assert.equal(result.pass, true);
  assert.equal(result.retryCountUsed, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(result.runtimePackage, null);
  assert.deepEqual(result.score, {
    coherence: 100,
    pacing: 100,
    repetition: 100,
    engagement: 100,
    voice: 100,
    overall: 100,
  });
});

test("runPipelineChapterWithRuntime does not approve when timeline check fails", async () => {
  const generationStates = [];
  const finalizedContent = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts() {},
      async finalizeChapterContent(input) {
        finalizedContent.push(input.content);
        return {
          finalContent: input.content,
          runtimePackage: {
            audit: {
              score: {
                coherence: 98,
                pacing: 98,
                repetition: 98,
                engagement: 98,
                voice: 98,
                overall: 98,
              },
              openIssues: [],
              reports: [],
              hasBlockingIssues: false,
            },
            meta: {
              acceptanceStatus: "accepted",
              continuePolicy: "continue",
            },
            timelineCheck: {
              status: "failed",
            },
            context: {
              styleContext: null,
            },
          },
        };
      },
      async markChapterGenerationState(_chapterId, generationState) {
        generationStates.push(generationState);
      },
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: false,
    },
  );

  assert.deepEqual(finalizedContent, ["生成后的正文"]);
  assert.deepEqual(generationStates, ["reviewed"]);
  assert.equal(result.pass, false);
  assert.equal(result.runtimePackage.timelineCheck.status, "failed");
  assert.deepEqual(result.qualityDebtAttribution.firstFailureIssueCodes, []);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 0);
  assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 0);
});

test("runPipelineChapterWithRuntime passes confirmed provenance for approved final artifact sync", async () => {
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: "已有正文",
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        throw new Error("existing content should not be regenerated");
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
        finalSyncs.push({ content, options });
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
  );

  assert.equal(result.pass, true);
  assert.deepEqual(finalSyncs, [{
    content: "已有正文",
    options: {
      artifactSyncMode: "adaptive",
      contentProvenance: "confirmed",
    },
  }]);
});

test("runPipelineChapterWithRuntime passes debt provenance for retained failed content", async () => {
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
        finalSyncs.push({ content, options });
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: `${content}，保留但待复核。`,
          runtimePackage: createRuntimePackage(70),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: false,
    },
  );

  assert.equal(result.pass, false);
  assert.deepEqual(finalSyncs, [{
    content: "生成后的正文，保留但待复核。",
    options: {
      artifactSyncMode: "adaptive",
      contentProvenance: "debt",
    },
  }]);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 0);
  assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 0);
});

test("runPipelineChapterWithRuntime keeps the draft when a light patch cannot be applied", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  let needsRepairMarked = false;
  let reviewCount = 0;
  let patchPlanCalls = 0;
  let heavyRewriteCalls = 0;

  promptRunner.runStructuredPrompt = async () => {
    patchPlanCalls += 1;
    return {
      output: {
        strategy: "patch_first",
        summary: "补足承接。",
        patches: [{
          id: "patch-missing",
          targetExcerpt: "模型认为存在但正文里没有的片段。",
          replacement: "替换后的片段。",
          reason: "目标片段不存在。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("light repair must not escalate to a full rewrite");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文需要承接。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 90),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {
          needsRepairMarked = true;
        },
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing"]);
    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.match(result.recoverableRepairFailure.message, /目标片段不存在/);
    assert.equal(needsRepairMarked, true);
    assert.equal(finalSyncs.length, 1);
    assert.equal(patchPlanCalls, 1);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
      options: {
        scheduleBackgroundSync: false,
        artifactSyncMode: "adaptive",
        syncArtifacts: false,
      },
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime sends critical prose findings to repair and retains exhausted prose debt", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const finalizationCalls = [];
  const patchIssues = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async (request) => {
    patchIssues.push(request.promptInput.issuesJson);
    return {
      output: {
        strategy: "patch_first",
        summary: "去掉模板化否定翻转。",
        patches: [{
          id: "patch-prose-negative-flip",
          targetExcerpt: "他不是害怕，而是终于明白自己不能回头。",
          replacement: "他握紧刀柄，指节发白，仍一步踏进雨里。",
          reason: "把抽象解释改成动作。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "他不是害怕，而是终于明白自己不能回头。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
          finalSyncs.push({ content, options });
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createProseRiskRuntimePackage(92),
          };
        },
        async finalizeChapterTimeline(input) {
          finalizationCalls.push(input);
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.pass, false);
    assert.equal(result.runtimePackage.audit.openIssues[0].code, "prose_negative_flip");
    assert.match(patchIssues[0], /第 1 行/);
    assert.match(patchIssues[0], /模板化否定翻转/);
    assert.deepEqual(savedDrafts.map((item) => item.generationState), ["drafted", "repaired"]);
    assert.equal(finalSyncs[0].options.contentProvenance, "debt");
    assert.equal(finalizationCalls.length, 0);
    assert.deepEqual(result.qualityDebtAttribution.firstFailureIssueCodes, ["prose_negative_flip"]);
    assert.deepEqual(result.qualityDebtAttribution.secondFailureIssueCodes, ["prose_negative_flip"]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("runPipelineChapterWithRuntime does not rewrite the chapter when a patch target is unsafe", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const savedDrafts = [];
  let reviewCount = 0;
  let heavyRewriteCalls = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "尝试局部修文。",
      patches: [{
        id: "patch-short-target",
        targetExcerpt: "短",
        replacement: "替换后的安全句段。",
        reason: "模型给出了过短定位片段。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("unsafe patch must remain recoverable");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文需要承接。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 90),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
    );

    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.match(result.recoverableRepairFailure.message, /局部补丁计划不可安全应用/);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime defers acceptance gate unavailable risk without local patch prompt", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const needsRepairMarked = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    throw new Error("patch repair should not run for acceptance gate unavailable risk");
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      throw new Error("heavy repair should not run for acceptance gate unavailable risk");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文可保留。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createAcceptanceGateUnavailableRuntimePackage(72),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair(chapterId) {
          needsRepairMarked.push(chapterId);
        },
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing"]);
    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.equal(result.recoverableRepairFailure.message, "章节接收判断暂时不可用，正文已保留，后续需要重新审校或人工复查。");
    assert.deepEqual(result.recoverableRepairFailure.failureTypes, ["review_gate_unavailable"]);
    assert.deepEqual(needsRepairMarked, ["chapter-1"]);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文可保留。",
      generationState: "drafted",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime uses the selected light repair for style source leakage", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  let patchRepairCalled = false;
  let heavyRewriteCalls = 0;
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    patchRepairCalled = true;
    return {
      output: {
        strategy: "patch_first",
        summary: "移除来源作品实体。",
        patches: [{
          id: "patch-style-source",
          targetExcerpt: "北凉王世子踏进城门，所有人都屏住呼吸。",
          replacement: "年轻世子踏进城门，所有人都屏住呼吸。",
          reason: "保留场景节奏，移除来源实体。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("light repair must not invoke full rewrite");
    },
  }));

  try {
    const styleContext = {
      sanitizedGenerationProfile: {
        writingGuidance: ["keep fast scene turns without copying source entities"],
        forbiddenEntities: ["北凉王世子"],
        sourceProfileNames: ["source style"],
        sanitizedAt: "2026-05-01T00:00:00.000Z",
        strategy: "deterministic",
      },
    };

    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "test novel" },
            chapter: {
              id: "chapter-1",
              title: "chapter one",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: { styleContext },
          };
        },
        async generateDraftFromWriter() {
          return { content: "北凉王世子踏进城门，所有人都屏住呼吸。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(92, { styleContext }),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.equal(patchRepairCalled, true);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.deepEqual(savedDrafts, [{
      content: "北凉王世子踏进城门，所有人都屏住呼吸。",
      generationState: "drafted",
    }, {
      content: "年轻世子踏进城门，所有人都屏住呼吸。",
      generationState: "repaired",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime does not save a generated draft twice when writer already synced artifacts", async () => {
  const savedDrafts = [];
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "test novel" },
          chapter: {
            id: "chapter-1",
            title: "chapter one",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "generated draft", artifactsAlreadySynced: true };
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
  );

  assert.deepEqual(savedDrafts, []);
  assert.deepEqual(finalSyncs, ["generated draft"]);
  assert.equal(result.pass, true);
  assert.equal(result.reviewExecuted, true);
});

test("runPipelineChapterWithRuntime does not resave unchanged existing chapter content as a draft", async () => {
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "test novel" },
          chapter: {
            id: "chapter-1",
            title: "chapter one",
            order: 1,
            content: "existing reviewed content",
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        throw new Error("existing content should not be regenerated");
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState(_chapterId, generationState) {
        generationStates.push(generationState);
      },
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
    {
      async onStageChange(stage) {
        stages.push(stage);
      },
    },
  );

  assert.deepEqual(stages, ["reviewing"]);
  assert.deepEqual(savedDrafts, []);
  assert.deepEqual(finalSyncs, ["existing reviewed content"]);
  assert.deepEqual(generationStates, ["reviewed", "approved"]);
  assert.equal(result.pass, true);
});

test("runPipelineChapterWithRuntime leaves empty writer retries to the outer execution budget", async () => {
  const stages = [];
  const emptyEvents = [];
  const savedDrafts = [];
  let generationCount = 0;

  await assert.rejects(
    () => runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          generationCount += 1;
          return { content: "   " };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent() {
          throw new Error("empty drafts should not be reviewed");
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
        async onEmptyContent(event) {
          emptyEvents.push({
            attempt: event.attempt,
            willRetry: event.willRetry,
            contentLength: event.contentLength,
          });
        },
      },
    ),
    ChapterEmptyContentError,
  );

  assert.equal(generationCount, 1);
  assert.deepEqual(stages, ["generating_chapters"]);
  assert.deepEqual(emptyEvents, [{ attempt: 1, willRetry: false, contentLength: 0 }]);
  assert.deepEqual(savedDrafts, []);
});

test("runPipelineChapterWithRuntime defaults to a single repair pass before stopping", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const finalizeInputs = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];
  const finalizationCalls = [];
  const consumedRetries = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "补足承接。",
      patches: [{
        id: "patch-1",
        targetExcerpt: "初审正文需要承接。",
        replacement: "修后正文补足承接。",
        reason: "补足承接。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          finalizeInputs.push(content);
          return {
            finalContent: reviewCount === 1 ? "初审正文需要承接。" : "修后复审正文",
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 73),
          };
        },
        async finalizeChapterTimeline(input) {
          finalizationCalls.push(input);
        },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
        async onRetryConsumed(kind) {
          consumedRetries.push(kind);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.deepEqual(finalizeInputs, ["生成后的正文", "修后正文补足承接。"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.deepEqual(consumedRetries, ["quality_repair"]);
    assert.equal(result.pass, false);
    assert.deepEqual(generationStates, ["reviewed", "reviewed"]);
    assert.deepEqual(savedDrafts, [
      {
        content: "生成后的正文",
        generationState: "drafted",
      },
      {
        content: "修后正文补足承接。",
        generationState: "repaired",
      },
    ]);
    assert.equal(finalSyncs.length, 1);
    assert.equal(finalizationCalls.length, 0);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("runPipelineChapterWithRuntime clamps maxRetries to a single repair pass", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const finalizeInputs = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "补足承接。",
      patches: [{
        id: "patch-1",
        targetExcerpt: "初审正文需要承接。",
        replacement: "修后正文补足承接。",
        reason: "补足承接。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          finalizeInputs.push(content);
          return {
            finalContent: reviewCount === 1 ? "初审正文需要承接。" : "修后复审正文",
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 73),
          };
        },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        maxRetries: 5,
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.deepEqual(finalizeInputs, ["生成后的正文", "修后正文补足承接。"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.pass, false);
    assert.deepEqual(generationStates, ["reviewed", "reviewed"]);
    assert.deepEqual(savedDrafts, [
      {
        content: "生成后的正文",
        generationState: "drafted",
        options: {
          scheduleBackgroundSync: false,
          artifactSyncMode: "adaptive",
          syncArtifacts: false,
        },
      },
      {
        content: "修后正文补足承接。",
        generationState: "repaired",
        options: {
          scheduleBackgroundSync: false,
          artifactSyncMode: "adaptive",
          syncArtifacts: false,
        },
      },
    ]);
    assert.equal(finalSyncs.length, 1);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});
