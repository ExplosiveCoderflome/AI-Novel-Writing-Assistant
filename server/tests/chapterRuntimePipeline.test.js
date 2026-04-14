const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runPipelineChapterWithRuntime,
} = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");

test("runPipelineChapterWithRuntime skips review and repair when autoReview is disabled", async () => {
  const stages = [];
  const generationStates = [];
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
      async saveDraftAndArtifacts() {},
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
