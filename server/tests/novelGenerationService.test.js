const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const eventsEntry = path.resolve(__dirname, "../dist/events/index.js");
const eventsStub = new Module(eventsEntry);
eventsStub.filename = eventsEntry;
eventsStub.loaded = true;
eventsStub.exports = {
  novelEventBus: {
    async emit() {},
  },
};
require.cache[eventsEntry] = eventsStub;

const {
  NovelGenerationService,
} = require("../dist/services/novel/NovelGenerationService.js");
const { NovelCoreService } = require("../dist/services/novel/NovelCoreService.js");
const {
  getSharedNovelServices,
  _resetSharedNovelServicesForTest,
} = require("../dist/services/novel/application/sharedNovelServices.js");
const {
  novelProductionOrchestrator,
} = require("../dist/services/novel/production/NovelProductionOrchestrator.js");

test("createChapterStream routes manual chapter execution through the unified orchestrator", async () => {
  const calls = [];
  const streamResult = {
    stream: {
      async *[Symbol.asyncIterator]() {},
    },
    async onDone() {},
  };
  const service = new NovelGenerationService();
  service.chapterRuntimeCoordinator = {
    async createChapterStream(novelId, chapterId, options, config) {
      calls.push(["createChapterStream", novelId, chapterId, options.model, config.includeRuntimePackage]);
      return streamResult;
    },
  };

  const result = await service.createChapterStream("novel-1", "chapter-5", {
    model: "gpt-test",
  });

  assert.deepEqual(calls, [
    ["createChapterStream", "novel-1", "chapter-5", "gpt-test", true],
  ]);
  assert.equal(result, streamResult);
});

test("legacy NovelCoreService chapter stream enters the unified orchestrator", async () => {
  const calls = [];
  const streamResult = {
    stream: {
      async *[Symbol.asyncIterator]() {},
    },
    async onDone() {},
  };

  _resetSharedNovelServicesForTest();
  getSharedNovelServices();
  novelProductionOrchestrator.register("chapter_execution", {
    async run(input) {
      calls.push(input);
      return {
        stage: "chapter_execution",
        status: "checkpoint",
        summary: "test chapter execution",
        payload: streamResult,
      };
    },
  });

  const core = new NovelCoreService();
  const result = await core.createChapterStream("novel-legacy", "chapter-legacy", {
    model: "gpt-test",
  });

  assert.equal(result, streamResult);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "chapter_execution");
  assert.equal(calls[0].payload.mode, "single_chapter_stream");
  assert.equal(calls[0].payload.chapterId, "chapter-legacy");
  assert.equal(calls[0].payload.options.model, "gpt-test");
});
