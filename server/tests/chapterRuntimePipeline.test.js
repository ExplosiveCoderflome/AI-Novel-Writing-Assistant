const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

const {
  runPipelineChapterWithRuntime,
} = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");
const {
  ChapterEmptyContentError,
} = require("../dist/services/novel/runtime/chapterEmptyContentError.js");

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

test("runPipelineChapterWithRuntime skips review and repair when autoReview is disabled", async () => {
  const stages = [];
  const generationStates = [];
  const savedDrafts = [];
  const finalSyncs = [];
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
});

test("runPipelineChapterWithRuntime escalates patch failures to heavy repair and rechecks the chapter", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  let needsRepairMarked = false;
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => ({
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
  });
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    invoke: async () => ({
      content: "rewritten chapter after safe full repair",
    }),
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

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.recoverableRepairFailure, null);
    assert.equal(needsRepairMarked, false);
    assert.equal(finalSyncs.length, 1);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
      options: {
        scheduleBackgroundSync: false,
        artifactSyncMode: "adaptive",
        syncArtifacts: false,
      },
    }, {
      content: "rewritten chapter after safe full repair",
      generationState: "repaired",
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

test("runPipelineChapterWithRuntime escalates short patch targets to heavy repair", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const savedDrafts = [];
  let reviewCount = 0;

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
    invoke: async () => ({
      content: "rewritten chapter after short patch target",
    }),
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

    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.recoverableRepairFailure, null);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
    }, {
      content: "rewritten chapter after short patch target",
      generationState: "repaired",
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
    invoke: async () => {
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
    assert.equal(result.retryCountUsed, 0);
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

test("runPipelineChapterWithRuntime forces full rewrite when style source entities leak", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  let patchRepairCalled = false;
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    patchRepairCalled = true;
    throw new Error("patch repair should not run for style source leakage");
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    invoke: async () => ({
      content: "clean rewritten chapter with transferable pacing only",
    }),
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

    assert.equal(patchRepairCalled, false);
    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.deepEqual(savedDrafts, [{
      content: "北凉王世子踏进城门，所有人都屏住呼吸。",
      generationState: "drafted",
    }, {
      content: "clean rewritten chapter with transferable pacing only",
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

test("runPipelineChapterWithRuntime retries once when writer returns empty content", async () => {
  const stages = [];
  const emptyEvents = [];
  const savedDrafts = [];
  let generationCount = 0;

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
        generationCount += 1;
        return { content: generationCount === 1 ? "   " : "重试后的正文" };
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async syncFinalChapterArtifacts() {},
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
  );

  assert.equal(generationCount, 2);
  assert.deepEqual(stages, ["generating_chapters", "generating_chapters", "reviewing"]);
  assert.deepEqual(emptyEvents, [{ attempt: 1, willRetry: true, contentLength: 0 }]);
  assert.deepEqual(savedDrafts, [{
    content: "重试后的正文",
    generationState: "drafted",
  }]);
  assert.equal(result.pass, true);
});

test("runPipelineChapterWithRuntime fails empty writer output without saving or advancing state", async () => {
  const emptyEvents = [];
  const savedDrafts = [];
  const generationStates = [];
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
          return { content: generationCount === 1 ? "" : "\n\n" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent() {
          throw new Error("empty drafts should not be reviewed");
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

  assert.equal(generationCount, 2);
  assert.deepEqual(emptyEvents, [
    { attempt: 1, willRetry: true, contentLength: 0 },
    { attempt: 2, willRetry: false, contentLength: 0 },
  ]);
  assert.deepEqual(savedDrafts, []);
  assert.deepEqual(generationStates, []);
});

test("runPipelineChapterWithRuntime defaults to a single repair pass before stopping", async () => {
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
      },
      {
        content: "修后正文补足承接。",
        generationState: "repaired",
      },
    ]);
    assert.equal(finalSyncs.length, 1);
    assert.equal(result.qualityDebtAttribution?.firstFailureIssueCodes.includes("CONTINUITY_GAP"), true);
    assert.equal(result.qualityDebtAttribution?.secondFailureIssueCodes.includes("CONTINUITY_GAP"), true);
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
