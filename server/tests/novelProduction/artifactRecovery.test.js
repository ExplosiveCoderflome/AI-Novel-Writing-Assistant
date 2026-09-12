const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./sourceHarness.cjs");

function createCheckpointStore() {
  const rows = new Map();
  const keyOf = (identity) => JSON.stringify(identity);
  return {
    rows,
    async read(identity) {
      return rows.get(keyOf(identity)) ?? null;
    },
    async claim(identity, metadata) {
      const key = keyOf(identity);
      const current = rows.get(key);
      if (current?.status === "succeeded") return "already_done";
      if (current?.status === "running") return "running";
      rows.set(key, { status: "running", metadataJson: JSON.stringify(metadata), updatedAt: new Date() });
      return "claimed";
    },
    async succeed(identity, metadata) {
      rows.set(keyOf(identity), { status: "succeeded", metadataJson: JSON.stringify(metadata), updatedAt: new Date() });
    },
    async fail(identity, error) {
      rows.set(keyOf(identity), {
        status: "failed",
        metadataJson: JSON.stringify({ reason: error.message }),
        updatedAt: new Date(),
      });
    },
  };
}

function loadRecoveryService() {
  return loadRuntimeSource("artifactSync/ChapterArtifactRecoveryService.ts", {
    "../../../../db/prisma": { prisma: {} },
    "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts": {
      chapterArtifactDeltaOutputSchema: { parse: (value) => value },
    },
    "../ChapterArtifactDeltaService": {
      buildContentHash: (value) => value,
      CHAPTER_ARTIFACT_CONSUMERS: ["summary_facts", "payoff", "knowledge"],
      ChapterArtifactDeltaService: class {},
    },
    "./ChapterArtifactCheckpointStore": { ChapterArtifactCheckpointStore: class {} },
    "./ChapterArtifactSyncResult": {
      ChapterArtifactContentVersionError: class extends Error {},
    },
  }).ChapterArtifactRecoveryService;
}

test("C3: recovery reuses extraction and only retries unfinished consumers", async () => {
  const checkpoints = createCheckpointStore();
  const calls = { extraction: 0, summary_facts: 0, payoff: 0, knowledge: 0 };
  let failPayoff = true;
  const deltaService = {
    async extractChapterArtifacts() {
      calls.extraction++;
      return { contentHash: "draft", output: { syncPlan: { payoffLedger: "delta" } } };
    },
    async applyChapterArtifactConsumer(input) {
      calls[input.consumer]++;
      const extractionRow = [...checkpoints.rows.entries()]
        .find(([key]) => key.includes("artifact_delta_extraction"))?.[1];
      assert.equal(extractionRow?.status, "succeeded", "extraction must be durable before application");
      if (input.consumer === "payoff" && failPayoff) {
        failPayoff = false;
        throw new Error("payoff interrupted");
      }
      return input.consumer === "summary_facts"
        ? { concreteFactCount: 2 }
        : input.consumer === "payoff"
          ? { payoffDeltaCount: 1 }
          : { characterKnowledgeStateCount: 1 };
    },
    toSyncResult(extraction, aggregate) {
      return { contentHash: extraction.contentHash, output: extraction.output, ...aggregate };
    },
  };
  const ChapterArtifactRecoveryService = loadRecoveryService();
  const service = new ChapterArtifactRecoveryService({
    deltaService,
    checkpoints,
    readCurrentContent: async () => "draft",
  });
  const input = { novelId: "n", chapterId: "c", content: "draft", artifactSyncMode: "adaptive" };

  await assert.rejects(service.syncChapterArtifacts(input), /payoff interrupted/);
  const recovered = await service.syncChapterArtifacts(input);

  assert.equal(recovered.concreteFactCount, 2);
  assert.equal(recovered.payoffDeltaCount, 1);
  assert.equal(calls.extraction, 1, "recovery must not call the model twice");
  assert.equal(calls.summary_facts, 1, "completed fact application must not repeat");
  assert.equal(calls.payoff, 2);
  assert.equal(calls.knowledge, 1);
});

test("C3: stale content is rejected before extraction or consumer writes", async () => {
  const checkpoints = createCheckpointStore();
  let extractionCalls = 0;
  let applyCalls = 0;
  const ChapterArtifactRecoveryService = loadRecoveryService();
  const service = new ChapterArtifactRecoveryService({
    checkpoints,
    readCurrentContent: async () => "new draft",
    deltaService: {
      async extractChapterArtifacts() { extractionCalls++; return { contentHash: "draft", output: {} }; },
      async applyChapterArtifactConsumer() { applyCalls++; return {}; },
      toSyncResult() { return {}; },
    },
  });

  await assert.rejects(
    service.syncChapterArtifacts({ novelId: "n", chapterId: "c", content: "draft", artifactSyncMode: "adaptive" }),
    /正文版本已变化/,
  );
  assert.equal(extractionCalls, 0);
  assert.equal(applyCalls, 0);
});
