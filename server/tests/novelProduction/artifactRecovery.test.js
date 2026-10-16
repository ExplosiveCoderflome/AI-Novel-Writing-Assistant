const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./sourceHarness.cjs");
const {StructuredOutputError} = require("../../dist/llm/structuredOutput");

function createCheckpointStore() {
  const rows = new Map();
  const transitions = [];
  const keyOf = (identity) => JSON.stringify(identity);
  return {
    rows,
    transitions,
    async read(identity) {
      return rows.get(keyOf(identity)) ?? null;
    },
    async claim(identity, metadata) {
      const key = keyOf(identity);
      const current = rows.get(key);
      if (current?.status === "succeeded") return "already_done";
      if (current?.status === "running") return "running";
      rows.set(key, { status: "running", metadataJson: JSON.stringify(metadata), updatedAt: new Date() });
      transitions.push("running");
      return "claimed";
    },
    async succeed(identity, metadata) {
      rows.set(keyOf(identity), { status: "succeeded", metadataJson: JSON.stringify(metadata), updatedAt: new Date() });
      transitions.push("succeeded");
    },
    async fail(identity, error) {
      rows.set(keyOf(identity), {
        status: "failed",
        metadataJson: JSON.stringify({ reason: error.message }),
        updatedAt: new Date(),
      });
      transitions.push("failed");
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
    "../../../../llm/structuredOutput": {StructuredOutputError},
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

function formatFailure(category = "schema_mismatch", message = "summary、stateDeltas 缺失，结构纠正仍未通过") {
  return new StructuredOutputError({category, message, diagnostics: {}});
}

function serializationFixture({firstError = formatFailure(), failFirst = true, alwaysFail = false, veto, mutateAfterFailure = false, mutateAfterSuccess = false} = {}) {
  const checkpoints = createCheckpointStore(), attempts = [], consumers = [];
  let current = "draft", checks = 0, failConsumer = false;
  const Service = loadRecoveryService();
  const service = new Service({checkpoints, readCurrentContent: async () => current, deltaService: {
    async extractChapterArtifacts(input) {
      attempts.push(input);
      if ((failFirst && attempts.length === 1) || alwaysFail) {
        if (mutateAfterFailure) current = "new draft";
        throw firstError;
      }
      if (mutateAfterSuccess) current = "new draft";
      return {contentHash: "draft", output: {summary: "已完成的正文记忆"}};
    },
    async applyChapterArtifactConsumer(input) {
      consumers.push(input.consumer);
      if (failConsumer && input.consumer === "payoff") {failConsumer = false; throw new Error("consumer interrupted");}
      return {};
    },
    toSyncResult: extraction => extraction,
  }});
  const input = {novelId: "n", chapterId: "c", content: "draft", artifactSyncMode: "adaptive",
    artifactSyncPolicy: "director_v2", provider: "local", model: "qwen", temperature: 0.2,
    beforeSerializationRetry: async () => {checks++; if (veto) throw veto;},
  };
  return {service, checkpoints, attempts, consumers, input, checks: () => checks,
    interruptConsumer: () => {failConsumer = true;}};
}

test("healthy guarded V2 extraction does not reserve another retry or add another model call", async () => {
  const f = serializationFixture({failFirst: false});
  await f.service.syncChapterArtifacts(f.input);
  assert.equal(f.attempts.length, 1); assert.equal(f.checks(), 0);
  const row = [...f.checkpoints.rows.entries()].find(([key]) => key.includes("artifact_delta_extraction"))[1];
  assert.equal(JSON.parse(row.metadataJson).serializationRecovery, undefined);
});

test("V2 retries recorded missing-field failures once with fresh diagnostics and stores only a valid extraction", async () => {
  for (const message of ["characterResourceDeltas.2.narrativeImpact 缺失", "summary、stateDeltas 缺失，JSON repair 未通过"]) {
    const f = serializationFixture({firstError: formatFailure("schema_mismatch", message)});
    const result = await f.service.syncChapterArtifacts(f.input);
    assert.equal(result.contentHash, "draft");
    assert.equal(f.attempts.length, 2); assert.equal(f.checks(), 1);
    assert.equal(f.attempts[0].serializationRetryFeedback, undefined);
    const second = f.attempts[1];
    for (const key of ["novelId", "chapterId", "content", "provider", "model", "temperature"]) assert.equal(second[key], f.input[key]);
    assert.equal(second.serializationRetryFeedback.attempt, 2);
    assert.equal(second.serializationRetryFeedback.category, "schema_mismatch");
    assert.ok(second.serializationRetryFeedback.message.includes(message));
    const row = [...f.checkpoints.rows.entries()].find(([key]) => key.includes("artifact_delta_extraction"))[1];
    const metadata = JSON.parse(row.metadataJson);
    assert.equal(row.status, "succeeded"); assert.equal(metadata.serializationRecovery.attempts, 2);
    assert.deepEqual(f.checkpoints.transitions.slice(0, 4), ["running", "failed", "running", "succeeded"]);
    assert.equal(metadata.output.summary, "已完成的正文记忆");
    assert.deepEqual(f.consumers, ["summary_facts", "payoff", "knowledge", "character_locations"]);
  }
});

test("serialization retry is bounded; repeated invalid output never reaches a consumer", async () => {
  const error = formatFailure(), f = serializationFixture({firstError: error, alwaysFail: true});
  await assert.rejects(f.service.syncChapterArtifacts(f.input), value => value === error);
  assert.equal(f.attempts.length, 2); assert.equal(f.checks(), 1); assert.equal(f.consumers.length, 0);
  assert.equal([...f.checkpoints.rows.values()][0].status, "failed");
});

test("transport, native-mode and ordinary failures are not misclassified as model-format recovery", async () => {
  for (const error of [formatFailure("transport_error"), formatFailure("unsupported_native_json"),
    new Error("[STRUCTURED_OUTPUT:schema_mismatch] database or ownership failure")]) {
    const f = serializationFixture({firstError: error});
    await assert.rejects(f.service.syncChapterArtifacts(f.input), value => value === error);
    assert.equal(f.attempts.length, 1); assert.equal(f.checks(), 0); assert.equal(f.consumers.length, 0);
  }
});

test("only the four typed output-format failures can request a fresh extraction", async () => {
  for (const category of ["thinking_pollution", "incomplete_json", "malformed_json", "schema_mismatch"]) {
    const f = serializationFixture({firstError: formatFailure(category)});
    await f.service.syncChapterArtifacts(f.input);
    assert.equal(f.attempts.length, 2); assert.equal(f.attempts[1].serializationRetryFeedback.category, category);
  }
});

test("legacy and detached V2 callers keep one attempt when no active retry guard is available", async () => {
  for (const change of [{artifactSyncPolicy: undefined}, {beforeSerializationRetry: undefined}]) {
    const f = serializationFixture();
    await assert.rejects(f.service.syncChapterArtifacts({...f.input, ...change}), /summary/);
    assert.equal(f.attempts.length, 1); assert.equal(f.consumers.length, 0);
  }
});

test("cancellation, lost ownership and hard-budget vetoes prevent the additional model call", async () => {
  for (const message of ["cancelled", "ownership lost", "hard token budget exhausted"]) {
    const veto = new Error(message), f = serializationFixture({veto});
    await assert.rejects(f.service.syncChapterArtifacts(f.input), value => value === veto);
    assert.equal(f.attempts.length, 1); assert.equal(f.checks(), 1); assert.equal(f.consumers.length, 0);
  }
});

test("a content change during the failed attempt prevents retry and all memory writes", async () => {
  const f = serializationFixture({mutateAfterFailure: true});
  await assert.rejects(f.service.syncChapterArtifacts(f.input), /正文版本已变化/);
  assert.equal(f.attempts.length, 1); assert.equal(f.consumers.length, 0);
});

test("the successful retry still cannot persist memory after the prose version changes", async () => {
  const f = serializationFixture({mutateAfterSuccess: true});
  await assert.rejects(f.service.syncChapterArtifacts(f.input), /正文版本已变化/);
  assert.equal(f.attempts.length, 2); assert.equal(f.consumers.length, 0);
});

test("after a serialization recovery, consumer resume reuses the saved extraction without another model call", async () => {
  const f = serializationFixture(); f.interruptConsumer();
  await assert.rejects(f.service.syncChapterArtifacts(f.input), /consumer interrupted/);
  await f.service.syncChapterArtifacts(f.input);
  assert.equal(f.attempts.length, 2); assert.equal(f.checks(), 1);
  assert.deepEqual(f.consumers, ["summary_facts", "payoff", "payoff", "knowledge", "character_locations"]);
});

test("retry diagnostics stay bounded without mutating the original error", async () => {
  const error = formatFailure("malformed_json", "x".repeat(10000));
  const f = serializationFixture({firstError: error});
  await f.service.syncChapterArtifacts(f.input);
  assert.equal(f.attempts[1].serializationRetryFeedback.message.length, 1600);
  assert.ok(error.message.length > 10000);
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


test("all seven observed resource narrative-impact failures reach the single guarded retry intact", async () => {
  const message = Array.from({length: 7}, (_, i) => `characterResourceDeltas.${i}.narrativeImpact: Invalid input: expected string, received undefined`).join("\n");
  const f = serializationFixture({firstError: formatFailure("schema_mismatch", message)});
  await f.service.syncChapterArtifacts(f.input);
  assert.equal(f.attempts.length, 2); assert.equal(f.checks(), 1);
  for (let i = 0; i < 7; i++) assert.ok(f.attempts[1].serializationRetryFeedback.message.includes(`characterResourceDeltas.${i}.narrativeImpact`));
  assert.equal(f.attempts[1].content, f.input.content);
});
