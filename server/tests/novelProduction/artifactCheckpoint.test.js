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
} = {}) {
  const recoveryArtifactType = "artifact_delta_recoverable:v1";
  let row = initialStatus ? { status: initialStatus, updatedAt: new Date() } : null;
  let calls = 0;
  const transitions = [];
  const applied = [];
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
        if (boundaryWriteError) throw new Error("checkpoint storage unavailable");
        return;
      }
      row = row ? { ...row, ...update } : { ...create, updatedAt: new Date() };
      transitions.push(row.status);
    },
  };
  const ContentVersionError = class extends Error {};
  const { ChapterArtifactBackgroundSyncService } = loadRuntimeSource("ChapterArtifactBackgroundSyncService.ts", {
    "../../../db/prisma": { prisma: {
      chapter: { findFirst: async () => ({ id: "c", order: 1, title: "Chapter", content: chapterContent }) },
      chapterArtifactSyncCheckpoint: checkpoint,
      generationJob: { findMany: async () => [] },
    } },
    "../../payoff/PayoffLedgerSyncService": {},
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
        async syncChapterArtifacts() {
          calls++;
          assert.equal(row.status, "running", "must claim before extraction");
          if (deferRecovery) {
            markRecoveryStarted();
            await new Promise((resolve) => {
              releaseRecovery = resolve;
            });
          }
          if (contentVersionError) throw new ContentVersionError("章节正文版本已变化");
          applied.push("summary");
          if (failOnce && calls === 1) throw new Error("after summary");
          applied.push("remaining");
          return { requiresFullReconcile: false, output: { syncPlan: {}, confidence: 1 } };
        }
      },
    },
    "./artifactSync/ChapterArtifactSyncResult": {
      ChapterArtifactContentVersionError: ContentVersionError,
    },
  });
  return {
    create: () => new ChapterArtifactBackgroundSyncService(),
    get status() { return row?.status; },
    get calls() { return calls; },
    transitions, applied,
    waitForRecoveryStart: () => recoveryStarted,
    releaseRecovery: () => releaseRecovery?.(),
  };
}

const sync = (service) => service.runChapterSyncNow("n", "c", "draft", { artifactSyncMode: "deferred" });

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

test("checkpoint: active running claim does not start another extraction", async () => {
  const f = fixture({ initialStatus: "running" });
  const result = await sync(f.create());
  assert.equal(result.status, "pending");
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
