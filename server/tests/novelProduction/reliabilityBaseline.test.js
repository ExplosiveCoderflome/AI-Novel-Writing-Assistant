const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { loadRuntimeSource, createPipelineHarness } = require("./sourceHarness.cjs");

const hashContent = (text) => createHash("sha256").update(text).digest("hex");
// Characterization assertions record known defects, not desired product behavior.
// Fixes must replace the corresponding assertion with the target contract.

function gateHarness() {
  const stored = new Map();
  let calls = 0;
  const { ChapterQualityGateService } = loadRuntimeSource("ChapterQualityGateService.ts", {
    "../../../db/prisma": { prisma: { chapterArtifactSyncCheckpoint: {
      findUnique: async ({ where }) => stored.get(JSON.stringify(where)) ?? null,
      upsert: async ({ where, create }) => { stored.set(JSON.stringify(where), create); },
    } } },
    "./ChapterAcceptanceAssessmentService": {},
    "./chapterRuntimePackageBuilders": { hashContent, rememberCacheValue: (map, key, value) => map.set(key, value) },
  });
  const input = {
    novelId: "n", chapterId: "c", content: "unchanged content", request: { model: "mock" },
    contextPackage: { chapter: { order: 1, title: "Chapter", targetWordCount: 2000 }, plan: { objective: "original objective" } },
  };
  return {
    input,
    get calls() { return calls; },
    create: (unavailable = false) => new ChapterQualityGateService({ acceptanceAssessmentService: {
      getCacheIdentity: async (input) => hashContent(JSON.stringify(input)),
      assess: async () => {
        calls++;
        return { assessment: { riskTags: unavailable ? ["acceptance_gate_unavailable"] : [], blockingIssues: [] } };
      },
    } }),
  };
}

function backgroundHarness() {
  const { ChapterArtifactBackgroundSyncService } = loadRuntimeSource("ChapterArtifactBackgroundSyncService.ts", {
    "../../../db/prisma": { prisma: {
      chapter: { findFirst: async () => ({ id: "c", order: 1, title: "Chapter", content: "draft" }) },
      chapterArtifactSyncCheckpoint: { findUnique: async () => null, upsert: async () => ({}) },
    } },
    "../../payoff/PayoffLedgerSyncService": {},
    "../pipelineJobState": {},
    "./ChapterArtifactDeltaService": { buildContentHash: hashContent },
    "./artifactSync/ChapterArtifactSyncBoundary": {
      CHAPTER_ARTIFACT_BOUNDARY_TYPE: "artifact_sync_boundary:v1",
    },
    "./artifactSync/ChapterArtifactRecoveryService": {
      ChapterArtifactRecoveryPendingError: class extends Error {},
      ChapterArtifactRecoveryService: class {},
    },
    "./artifactSync/ChapterArtifactSyncResult": {
      ChapterArtifactContentVersionError: class extends Error {},
    },
  });
  return new ChapterArtifactBackgroundSyncService();
}

test("baseline: unchanged acceptance input reuses memory and persisted results", async () => {
  const h = gateHarness();
  const gate = h.create();
  await gate.runAcceptanceGate(h.input);
  await gate.runAcceptanceGate(h.input);
  await h.create().runAcceptanceGate(h.input);
  assert.equal(h.calls, 1);
});

test("baseline: changed draft requires fresh acceptance", async () => {
  const h = gateHarness();
  const gate = h.create();
  await gate.runAcceptanceGate(h.input);
  await gate.runAcceptanceGate({ ...h.input, content: "different draft" });
  assert.equal(h.calls, 2);
});

test("R1: changed requirements invalidate acceptance", async () => {
  const h = gateHarness();
  const gate = h.create();
  await gate.runAcceptanceGate(h.input);
  await gate.runAcceptanceGate({ ...h.input, contextPackage: {
    chapter: { ...h.input.contextPackage.chapter, targetWordCount: 9000 }, plan: { objective: "new objective" },
  } });
  assert.equal(h.calls, 2);
});

test("R2: unavailable acceptance is retried in the same instance", async () => {
  const h = gateHarness();
  const gate = h.create(true);
  await gate.runAcceptanceGate(h.input);
  await gate.runAcceptanceGate(h.input);
  assert.equal(h.calls, 2);
});

test("baseline: unavailable acceptance is not persisted across instances", async () => {
  const h = gateHarness();
  await h.create(true).runAcceptanceGate(h.input);
  await h.create().runAcceptanceGate(h.input);
  assert.equal(h.calls, 2);
});

test("R3: failed repair request consumes its reserved budget", async () => {
  const h = createPipelineHarness({ scores: [60], repairError: new Error("transport failure") });
  await assert.rejects(h.run(), /transport failure/);
  assert.equal(h.events.filter((event) => event === "repair").length, 1);
  assert.equal(h.budget, 1);
});

test("R4a: running artifact checkpoint degrades adaptive sync instead of blocking chapter completion", async () => {
  const service = backgroundHarness();
  let inspections = 0;
  service.hasCompletedCheckpoint = async () => { inspections++; return false; };
  service.claimCheckpoint = async () => "running";
  const first = await service.runChapterSyncNow("n", "c", "draft");
  const second = await service.runChapterSyncNow("n", "c", "draft");
  assert.equal(first.status, "degraded");
  assert.equal(second.status, "degraded");
  assert.equal(inspections, 0, "running checkpoint is resolved by the durable claim, not a success-cache probe");
});

test("R4b: awaited synchronization failure returns a failed result", async () => {
  const service = backgroundHarness();
  service.runChapterSync = async () => { throw new Error("extraction failed"); };
  let result;
  let error;
  try { result = await service.runChapterSyncNow("n", "c", "draft"); } catch (caught) { error = caught; }
  assert.equal(error, undefined);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /extraction failed/);
});

test("R5: deteriorated repair retains the original and commits it once", async () => {
  const h = createPipelineHarness({ scores: [70, 20] });
  const result = await h.run();
  assert.equal(h.content, "original draft");
  assert.equal(h.budget, 1);
  assert.equal(h.events.filter((event) => event === "acceptance").length, 2);
  assert.deepEqual(h.committedContents, ["original draft"]);
  assert.deepEqual(h.syncedContents, ["original draft"]);
  assert.equal(result.repairSelection.selected, "original");
  assert.equal(result.repairSelection.reasonCode, "original_retained_no_clear_improvement");
});

test("R6 boundary: sync failure propagates; direct reentry retries final sync", async () => {
  const h = createPipelineHarness({ stopAt: "artifact_sync" });
  await assert.rejects(h.run(), /artifact_sync/);
  const before = h.events.length;
  h.resume();
  await h.run();
  assert.equal(h.events.slice(before).filter((event) => event === "artifact_sync").length, 1);
  assert.equal(h.events.includes("writer"), false);
  // Outer job filtering and real Worker recovery remain separate integration coverage.
});

test("baseline: cancellation before chapter execution issues no model request", async () => {
  const h = createPipelineHarness({ scores: [60] });
  await assert.rejects(h.run({}, { onCheckCancelled: async () => { throw new Error("cancelled"); } }), /cancelled/);
  assert.deepEqual(h.events, []);
  assert.equal(h.budget, 0);
});

test("baseline: lease loss after acceptance prevents terminal chapter side effects", async () => {
  const h = createPipelineHarness();
  let checks = 0;
  await assert.rejects(h.run({}, {
    onCheckCancelled: async () => {
      checks += 1;
      if (checks >= 2) throw new Error("PIPELINE_EXECUTION_LEASE_LOST");
    },
  }), /PIPELINE_EXECUTION_LEASE_LOST/);
  assert.equal(h.events.includes("terminal_commit"), false);
  assert.equal(h.events.includes("artifact_sync"), false);
  assert.equal(h.approved, false);
});

test("baseline: interruption after draft persistence retains readable content", async () => {
  const h = createPipelineHarness({ content: "", stopAt: "after_save" });
  await assert.rejects(h.run(), /after_save/);
  assert.equal(h.content, "generated draft");
  assert.deepEqual(h.events, ["writer", "save"]);
});

test("baseline: repair is charged before a later recheck failure", async () => {
  const h = createPipelineHarness({ scores: [60], stopAt: "recheck" });
  await assert.rejects(h.run(), /recheck/);
  assert.equal(h.budget, 1);
  assert.equal(h.events.filter((event) => event === "repair").length, 1);
  assert.equal(h.approved, false);
  assert.equal(h.content, "original draft");
  assert.deepEqual(h.committedContents, []);
  assert.deepEqual(h.syncedContents, []);
});

test("baseline: successful generation uses one writer and one acceptance", async () => {
  const h = createPipelineHarness({ content: "" });
  const result = await h.run();
  assert.equal(result.pass, true);
  assert.equal(h.budget, 0);
  assert.deepEqual(h.events, ["writer", "save", "acceptance", "terminal_commit", "artifact_sync", "approved"]);
});

test("C2: pending final artifacts do not publish an approved chapter state", async () => {
  const h = createPipelineHarness({ artifactSyncStatus: "pending" });
  await assert.rejects(h.run(), /artifact sync pending/);
  assert.equal(h.approved, false);
  assert.deepEqual(h.committedContents, ["original draft"]);
});

test("C2: explicit degraded continuity permits completion without pretending artifact success", async () => {
  const h = createPipelineHarness({ artifactSyncStatus: "degraded" });
  const result = await h.run({ autoReview: false });
  assert.equal(result.reviewExecuted, false);
  assert.equal(result.artifactSyncResult.status, "degraded");
  assert.equal(h.approved, true);
});

test("baseline: successful repair uses one repair, two acceptances and one final sync", async () => {
  const h = createPipelineHarness({ scores: [60, 90] });
  const result = await h.run();
  assert.equal(result.pass, true);
  assert.equal(h.budget, 1);
  assert.equal(result.repairSelection.selected, "candidate");
  assert.deepEqual(h.committedContents, ["repair candidate"]);
  assert.deepEqual(h.syncedContents, ["repair candidate"]);
  assert.deepEqual(h.events, ["acceptance", "repair", "acceptance", "save", "terminal_commit", "artifact_sync", "approved"]);
});

test("baseline: retained quality debt completes with at most one repair", async () => {
  const h = createPipelineHarness({ scores: [60, 60] });
  const result = await h.run({ maxRetries: 8 });
  assert.equal(result.pass, false);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
  assert.equal(h.events.filter((event) => event === "artifact_sync").length, 1);
});

test("cancellation at repairing prevents repair, save and budget consumption", async () => {
  const h = createPipelineHarness({ scores: [60] });
  let cancelled = false;
  await assert.rejects(h.run({}, {
    onCheckCancelled: async () => { if (cancelled) throw new Error("cancelled"); },
    onStageChange: async (stage) => { if (stage === "repairing") cancelled = true; },
  }), /cancelled/);
  assert.deepEqual(h.events, ["acceptance"]);
  assert.equal(h.budget, 0);
});
