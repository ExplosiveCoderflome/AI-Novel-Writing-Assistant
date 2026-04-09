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
  NovelPipelineService,
} = require("../dist/services/novel/NovelPipelineService.js");

test("startPipelineJob resumes an existing active range job before reusing it", async () => {
  const calls = [];
  const service = new NovelPipelineService();
  service.core = {
    async findActivePipelineJobForRange(novelId, startOrder, endOrder) {
      calls.push(["findActivePipelineJobForRange", novelId, startOrder, endOrder]);
      return { id: "job-active", status: "queued" };
    },
    async resumePipelineJob(jobId) {
      calls.push(["resumePipelineJob", jobId]);
    },
    async createNovelSnapshot() {
      calls.push(["createNovelSnapshot"]);
      throw new Error("should not create a snapshot when reusing an active job");
    },
    async startPipelineJob() {
      calls.push(["startPipelineJob"]);
      throw new Error("should not start a new pipeline when reusing an active job");
    },
  };

  const result = await service.startPipelineJob("novel-1", {
    startOrder: 1,
    endOrder: 10,
  });

  assert.deepEqual(calls, [
    ["findActivePipelineJobForRange", "novel-1", 1, 10],
    ["resumePipelineJob", "job-active"],
  ]);
  assert.deepEqual(result, { id: "job-active", status: "queued" });
});
