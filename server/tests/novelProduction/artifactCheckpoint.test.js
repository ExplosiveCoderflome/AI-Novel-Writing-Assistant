const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./sourceHarness.cjs");

function fixture({
  initialStatus,
  failOnce = false,
  contentVersionError = false,
  boundaryWriteError = false,
  deferRecovery = false,
  chapterContent = "draft",
  chapterOrder = 1,
  volumeTail = false,
  requiresFullReconcile = false,
  characterReview = false,
} = {}) {
  const recoveryArtifactType = "artifact_delta_recoverable:v1";
  let row = initialStatus ? { status: initialStatus, updatedAt: new Date() } : null;
  let calls = 0;
  const transitions = [];
  const applied = [];
  const reconciles = [];
  const recoveryInputs = [];
  let boundaryWrites = 0;
  let releaseRecovery;
  let markRecoveryStarted;
  const recoveryStarted = new Promise((resolve) => {
    markRecoveryStarted = resolve;
  });
  const checkpoint = {
    findUnique: async ({ where }) => {
      const artifactType = where.novelId_chapterId_contentHash_artifactType_syncMode.artifactType;
      return artifactType === recoveryArtifactType && row ? { ...row } : null;
    },
    create: async ({ data }) => {
      if (data.artifactType !== recoveryArtifactType) return;
      if (row) throw Object.assign(new Error("unique constraint"), { code: "P2002" });
      row = { ...data, updatedAt: new Date() };
      transitions.push(row.status);
    },
    updateMany: async ({ where, data }) => {
      if (where.artifactType !== recoveryArtifactType) return { count: 0 };
      if (!row || (where.status && row.status !== where.status)) return { count: 0 };
      if (where.OR && row.status === "running" && !(row.updatedAt < where.OR[1].updatedAt.lt)) return { count: 0 };
      row = { ...row, ...data };
      transitions.push(row.status);
      return { count: 1 };
    },
    upsert: async ({ where, create, update }) => {
      const artifactType = where.novelId_chapterId_contentHash_artifactType_syncMode.artifactType;
      if (artifactType !== recoveryArtifactType) {
        if (artifactType === "artifact_sync_boundary:v1") boundaryWrites++;
        if (boundaryWriteError) throw new Error("checkpoint storage unavailable");
        return;
      }
      row = row ? { ...row, ...update } : { ...create, updatedAt: new Date() };
      transitions.push(row.status);
    },
  };
  const ContentVersionError = class extends Error {};
  const ReviewRequiredError = class extends Error {constructor() {super("请确认人物"); this.reviewId = "review-1";}};
  const { ChapterArtifactBackgroundSyncService } = loadRuntimeSource("ChapterArtifactBackgroundSyncService.ts", {
    "../../../db/prisma": { prisma: {
      chapter: { findFirst: async () => ({ id: "c", order: chapterOrder, title: "Chapter", content: chapterContent }) },
      volumePlan: { findFirst: async () => volumeTail ? { chapters: [{ chapterOrder }] } : null },
      chapterArtifactSyncCheckpoint: checkpoint,
      generationJob: { findMany: async () => [] },
    } },
    "../../payoff/PayoffLedgerSyncService": { payoffLedgerSyncService: { syncLedger: async (_id, options) => reconciles.push(options) } },
    "../pipelineJobState": {},
    "./ChapterArtifactDeltaService": {
      buildContentHash: (value) => value,
    },
    "./artifactSync/ChapterArtifactSyncBoundary": {
      CHAPTER_ARTIFACT_BOUNDARY_TYPE: "artifact_sync_boundary:v1",
    },
    "./artifactSync/ChapterArtifactRecoveryService": {
      ChapterArtifactRecoveryPendingError: class extends Error {},
      ChapterArtifactRecoveryService: class {
        async syncChapterArtifacts(input) {
          recoveryInputs.push(input);
          calls++;
          assert.equal(row.status, "running", "must claim before extraction");
          if (deferRecovery) {
            markRecoveryStarted();
            await new Promise((resolve) => {
              releaseRecovery = resolve;
            });
          }
          if (contentVersionError) throw new ContentVersionError("章节正文版本已变化");
          if (characterReview && calls === 1) throw new ReviewRequiredError();
          applied.push("summary");
          if (failOnce && calls === 1) throw new Error("after summary");
          applied.push("remaining");
          return { requiresFullReconcile, output: { syncPlan: {}, confidence: 1 } };
        }
      },
    },
    "./artifactSync/ChapterArtifactSyncResult": {
      ChapterArtifactContentVersionError: ContentVersionError,
      CharacterCandidateReviewRequiredError: ReviewRequiredError,
    },
  });
  return {
    create: () => new ChapterArtifactBackgroundSyncService(),
    get status() { return row?.status; },
    get calls() { return calls; },
    transitions, applied, reconciles, recoveryInputs,
    get boundaryWrites() { return boundaryWrites; },
    set chapterContent(value) { chapterContent = value; },
    waitForRecoveryStart: () => recoveryStarted,
    releaseRecovery: () => releaseRecovery?.(),
  };
}

const sync = (service, artifactSyncMode = "deferred") => service.runChapterSyncNow("n", "c", "draft", { artifactSyncMode });

test("candidate confirmation releases the artifact claim without closing the chapter; a fresh instance can resume", async () => {
  const f = fixture({characterReview: true});
  const options = {artifactSyncPolicy: "director_v2", directorRunId: "run-1"};
  const first = await f.create().runChapterSyncNow("n", "c", "draft", options);
  assert.equal(first.status, "pending");
  assert.equal(first.characterReviewId, "review-1");
  assert.equal(f.status, "failed", "release the outer claim so explicit recovery does not wait for stale lease timeout");
  assert.equal(f.boundaryWrites, 0);
  assert.equal(f.recoveryInputs[0].directorRunId, "run-1");
  const resumed = await f.create().runChapterSyncNow("n", "c", "draft", options);
  assert.equal(resumed.status, "completed");
  assert.equal(f.boundaryWrites, 1);
});

test("checkpoint: partial failure marks failed, fresh instance reclaims, success skips extraction", async () => {
  const f = fixture({ failOnce: true });
  const failed = await sync(f.create());
  assert.equal(failed.status, "degraded");
  assert.equal(f.status, "failed");
  assert.deepEqual(f.transitions, ["running", "failed"]);
  const recovered = await sync(f.create());
  assert.equal(recovered.status, "completed");
  assert.equal(f.status, "succeeded");
  assert.deepEqual(f.transitions, ["running", "failed", "running", "succeeded"]);
  const cached = await sync(f.create());
  assert.equal(cached.status, "completed");
  assert.equal(f.calls, 2);
  assert.deepEqual(f.applied, ["summary", "summary", "remaining"]);
});

test("checkpoint: strict active running claim stays pending without another extraction", async () => {
  const f = fixture({ initialStatus: "running" });
  const result = await sync(f.create(), "strict");
  assert.equal(result.status, "pending");
  assert.equal(f.calls, 0);
  assert.equal(f.status, "running");
  assert.deepEqual(f.transitions, []);
});

test("checkpoint: deferred active running claim records degradation without another extraction", async () => {
  const f = fixture({ initialStatus: "running" });
  const result = await sync(f.create());
  assert.equal(result.status, "degraded");
  assert.equal(f.calls, 0);
  assert.equal(f.status, "running");
  assert.deepEqual(f.transitions, []);
});

test("checkpoint: succeeded claim skips extraction in a fresh instance", async () => {
  const f = fixture({ initialStatus: "succeeded" });
  const result = await sync(f.create());
  assert.equal(result.status, "completed");
  assert.equal(f.calls, 0);
  assert.deepEqual(f.transitions, []);
});

test("checkpoint: continuity boundary storage failure is a recoverable sync failure", async () => {
  const f = fixture({ boundaryWriteError: true });
  const result = await sync(f.create());
  assert.equal(result.status, "failed");
  assert.match(result.reason, /无法保存当前正文的资产完成边界/);
  assert.equal(f.status, "succeeded", "completed extraction remains available for recovery");
  assert.equal(f.calls, 1);
});

test("checkpoint: concurrent callers share a boundary persistence failure", async () => {
  const f = fixture({ boundaryWriteError: true, deferRecovery: true });
  const service = f.create();
  const owner = sync(service);
  await f.waitForRecoveryStart();
  const concurrent = sync(service);
  f.releaseRecovery();

  const [ownerResult, concurrentResult] = await Promise.all([owner, concurrent]);
  assert.equal(ownerResult.status, "failed");
  assert.equal(concurrentResult.status, "failed");
  assert.match(concurrentResult.reason, /资产完成边界/);
  assert.equal(f.calls, 1);
});

test("checkpoint: stale chapter content rejects artifact application before claiming", async () => {
  const f = fixture({ chapterContent: "new draft" });
  const result = await sync(f.create());
  assert.equal(result.status, "failed");
  assert.match(result.reason, /正文版本已变化/);
  assert.equal(f.calls, 0);
  assert.equal(f.status, undefined);
  assert.deepEqual(f.transitions, []);
});

test("C3: an in-flight content version change fails instead of publishing a degraded completion", async () => {
  const f = fixture({ contentVersionError: true });
  const result = await sync(f.create());
  assert.equal(result.status, "failed");
  assert.match(result.reason, /正文版本已变化/);
  assert.equal(f.status, "failed");
});

test("C3: completed delta checkpoints still evaluate strict payoff reconciliation", async () => {
  const f = fixture({ initialStatus: "succeeded" });
  const service = f.create();
  let reconcileChecks = 0;
  service.shouldRunPayoffFullReconcile = async () => {
    reconcileChecks++;
    return false;
  };
  const result = await service.runChapterSyncNow("n", "c", "draft", { artifactSyncMode: "strict" });
  assert.equal(result.status, "completed");
  assert.equal(f.calls, 0);
  assert.equal(reconcileChecks, 1);
});

test("V2: a running mandatory delta cannot publish a degraded completion boundary", async () => {
  const f = fixture({ initialStatus: "running" });
  const result = await f.create().runChapterSyncNow("n", "c", "draft", {
    artifactSyncMode: "adaptive", artifactSyncPolicy: "director_v2",
  });
  assert.equal(result.status, "pending");
  assert.equal(f.calls, 0);
  assert.equal(f.boundaryWrites, 0);
});

test("V2: failed mandatory application stays recoverable without publishing completion", async () => {
  const f = fixture({ failOnce: true });
  const options = { artifactSyncMode: "adaptive", artifactSyncPolicy: "director_v2" };
  const failed = await f.create().runChapterSyncNow("n", "c", "draft", options);
  assert.equal(failed.status, "failed");
  assert.equal(f.boundaryWrites, 0);
  const recovered = await f.create().runChapterSyncNow("n", "c", "draft", options);
  assert.equal(recovered.status, "completed");
  assert.equal(f.boundaryWrites, 1);
});

test("V2: chapter three uses its delta without an automatic whole-ledger model call", async () => {
  const f = fixture({ chapterOrder: 3 });
  const result = await f.create().runChapterSyncNow("n", "c", "draft", {
    artifactSyncMode: "adaptive", artifactSyncPolicy: "director_v2",
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(f.reconciles, []);
  assert.equal(f.recoveryInputs[0].artifactSyncPolicy, "director_v2");
});

test("V2: explicit AI reconciliation keeps the chosen model and chapter usage attribution", async () => {
  const f = fixture({ requiresFullReconcile: true });
  await f.create().runChapterSyncNow("n", "c", "draft", {
    artifactSyncPolicy: "director_v2", provider: "deepseek", model: "chosen-model",
  });
  assert.equal(f.reconciles.length, 1);
  assert.equal(f.reconciles[0].provider, "deepseek");
  assert.equal(f.reconciles[0].model, "chosen-model");
  assert.equal(f.reconciles[0].sourceChapterId, "c");
  assert.equal(f.reconciles[0].triggerReason, "artifact_delta_risk");
});

test("V2: cached completion cannot approve an author-edited chapter using an old hash", async () => {
  const f = fixture();
  const service = f.create();
  const options = {artifactSyncPolicy: "director_v2"};
  assert.equal((await service.runChapterSyncNow("n", "c", "draft", options)).status, "completed");
  f.chapterContent = "author edited draft";
  const stale = await service.runChapterSyncNow("n", "c", "draft", options);
  assert.equal(stale.status, "failed");
  assert.equal(f.calls, 1);
});
