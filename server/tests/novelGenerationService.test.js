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
