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
      getChapterArtifactConsumers: (input) => input.artifactSyncPolicy === "director_v2"
        ? ["summary_facts", "payoff", "knowledge", "character_locations"]
        : ["summary_facts", "payoff", "knowledge"],
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

test("V2 chapter identity review precedes resource writes and resume reuses the stored extraction", async () => {
  const checkpoints = createCheckpointStore();
  let extractions = 0, identities = 0, writes = 0, confirmed = false;
  const Service = loadRecoveryService();
  const service = new Service({checkpoints, readCurrentContent: async () => "draft",
    prepareCandidates: async (input, output) => {
      assert.equal(input.directorRunId, "r"); identities++;
      if (!confirmed) throw new Error("confirm candidates");
      return {...output, identityApplied: true};
    }, deltaService: {
      async extractChapterArtifacts() {extractions++; return {contentHash: "draft", output: {}};},
      async applyChapterArtifactConsumer(input) {assert.equal(input.output.identityApplied, true); writes++; return {};},
      toSyncResult: extraction => extraction,
    }});
  const input = {novelId: "n", chapterId: "c", content: "draft", artifactSyncMode: "adaptive", artifactSyncPolicy: "director_v2", directorRunId: "r"};
  await assert.rejects(service.syncChapterArtifacts(input), /confirm candidates/);
  assert.equal(writes, 0);
  confirmed = true;
  await service.syncChapterArtifacts(input);
  assert.equal(extractions, 1);
  assert.equal(identities, 2);
  assert.equal(writes, 4);
});

test("V2 recovery awaits location application and resumes it without another extraction; V1 stays independent", async () => {
  const checkpoints = createCheckpointStore();
  const applied = [];
  let extractionCount = 0;
  let failLocation = true;
  const Service = loadRecoveryService();
  const service = new Service({checkpoints,readCurrentContent: async () => "draft",deltaService:{
    async extractChapterArtifacts() { extractionCount++; return {contentHash:"draft",output:{characterLocationDeltas:[{characterId:"a"}]}}; },
    async applyChapterArtifactConsumer(input) {
      applied.push(input.consumer);
      if(input.consumer === "character_locations" && failLocation) {failLocation=false;throw new Error("location interrupted");}
      return {};
    },
    toSyncResult: (extraction) => extraction,
  }});
  const input={novelId:"n",chapterId:"c",content:"draft",artifactSyncMode:"adaptive",artifactSyncPolicy:"director_v2"};
  await assert.rejects(service.syncChapterArtifacts(input),/location interrupted/);
  await service.syncChapterArtifacts(input);
  assert.equal(extractionCount,1);
  assert.deepEqual(applied,["summary_facts","payoff","knowledge","character_locations","character_locations"]);
  applied.length=0;
  await service.syncChapterArtifacts({...input,novelId:"v1",artifactSyncPolicy:undefined});
  assert.deepEqual(applied,["summary_facts","payoff","knowledge"]);
});
