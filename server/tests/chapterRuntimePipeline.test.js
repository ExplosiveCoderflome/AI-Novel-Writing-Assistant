const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

const {
  runPipelineChapterWithRuntime,
} = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");

function createRuntimePackage(overallScore) {
  return {
    audit: {
      score: {
        coherence: overallScore,
        pacing: overallScore,
        repetition: 10,
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
    },
  };
}

test("runPipelineChapterWithRuntime skips review and repair when autoReview is disabled", async () => {
  const stages = [];
  const generationStates = [];
  const savedDrafts = [];
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
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async finalizeChapterContent() {
        finalizeCalled = true;
        throw new Error("should not finalize");
      },
      async markChapterGenerationState(_chapterId, generationState) {
        generationStates.push(generationState);
      },
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
  }]);
  assert.deepEqual(generationStates, ["approved"]);
  assert.equal(result.reviewExecuted, false);
  assert.equal(result.pass, true);
  assert.equal(result.retryCountUsed, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(result.runtimePackage, null);
  assert.deepEqual(result.score, {
    coherence: 100,
    pacing: 100,
    repetition: 0,
    engagement: 100,
    voice: 100,
    overall: 100,
  });
});

test("runPipelineChapterWithRuntime defaults to a single repair pass before stopping", async () => {
  const originalRunTextPrompt = promptRunner.runTextPrompt;
  const stages = [];
  const finalizeInputs = [];
  const savedDrafts = [];
  const generationStates = [];
  let reviewCount = 0;

  promptRunner.runTextPrompt = async () => ({
    output: "修后正文",
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
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          finalizeInputs.push(content);
          return {
            finalContent: reviewCount === 1 ? "初审正文" : "修后复审正文",
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 73),
          };
        },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
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
    assert.deepEqual(finalizeInputs, ["生成后的正文", "修后正文"]);
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
        content: "修后正文",
        generationState: "repaired",
      },
    ]);
  } finally {
    promptRunner.runTextPrompt = originalRunTextPrompt;
  }
});
