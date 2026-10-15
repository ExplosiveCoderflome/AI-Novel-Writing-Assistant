const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./novelProduction/sourceHarness.cjs");

const quality = loadRuntimeSource("../state/stateProposalSourceQuality.ts", {});
const compactText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const policy = { compactText, buildVersionSummary: () => "confirmed", validateStateProposals: () => { throw new Error("unexpected extraction"); } };
const contracts = {
  ChapterArtifactContentVersionError: class extends Error {},
  buildChapterArtifactContentHash: (content) => `hash:${content}`,
};

function harness({ beforeClaim, applyError, chapterMatches = true } = {}) {
  let row = {
    id: "proposal", novelId: "novel", chapterId: "chapter", sourceSnapshotId: null,
    sourceType: "chapter_background_sync", sourceStage: "chapter_execution",
    proposalType: "character_resource_update", riskLevel: "low", status: "pending_review",
    summary: "钥匙交接", payloadJson: JSON.stringify({ chapterOrder: 3, syncContentHash: "hash:正文" }),
    evidenceJson: '["正文"]', validationNotesJson: '[]',
  };
  let applied = 0;
  let versions = 0;
  let linked = 0;
  let snapshots = 0;
  let transactionOpen = false;
  const events = [];
  const matches = (where) => row && Object.entries(where).every(([key, expected]) => {
    if (key === "id" && expected && typeof expected === "object") return expected.in.includes(row.id);
    return row[key] === expected;
  });
  const proposalDb = {
    async findMany({ where }) {
      const found = matches(where) ? [{ ...row }] : [];
      if (beforeClaim) await beforeClaim(review.characterResourceReviewStore);
      return found;
    },
    async updateMany({ where, data }) {
      if (data.committedVersionId) { linked += 1; return { count: 1 }; }
      if (!matches(where)) return { count: 0 };
      Object.assign(row, data);
      events.push(data.status);
      return { count: 1 };
    },
  };
  const tx = { stateChangeProposal: proposalDb,
    chapter: { findFirst: async () => chapterMatches ? { id: "chapter", order: 3 } : null },
  };
  const db = { stateChangeProposal: proposalDb,
    $transaction: async (work) => {
      const previous = { ...row };
      const previousApplied = applied;
      transactionOpen = true;
      try { return await work(tx); }
      catch (error) { row = previous; applied = previousApplied; throw error; }
      finally { transactionOpen = false; }
    },
  };
  const store = loadRuntimeSource("../state/persistence/StateProposalStore.ts", {
    "../../../../db/prisma": { prisma: db }, "../../runtime/artifactSync/contracts": contracts,
    "../stateProposalSourceQuality": quality, "../domain/StateProposalPolicy": policy,
  });
  const review = loadRuntimeSource("../characterResource/persistence/CharacterResourceReviewStore.ts", {
    "../../../../db/prisma": { prisma: db },
  });
  const { StateCommitService } = loadRuntimeSource("../state/StateCommitService.ts", {
    "@ai-novel/shared/types/characterResource": { characterResourceUpdatePayloadSchema: { safeParse: () => ({ success: false }) } },
    "./persistence/StateProposalStore": store, "./domain/StateProposalPolicy": policy,
    "../runtime/artifactSync/contracts": contracts,
    "./application/CommittedProposalApplication": { applyCommittedProposal: async (providedTx) => {
      assert.equal(providedTx, tx);
      assert.equal(row.status, "committed", "proposal must be claimed before applying state");
      assert.equal(transactionOpen, true);
      applied += 1;
      events.push("apply");
      if (applyError) throw applyError;
    } },
    "../characterResource/characterResourceShared": {},
    "../characterResource/CharacterResourceValidationService": { characterResourceValidationService: { validateProposal: (proposal) => ({ ...proposal, status: "committed" }) } },
    "./CanonicalStateService": { canonicalStateService: { getSnapshot: async () => { snapshots += 1; return {}; } } },
    "./ChapterFactExtractor": {},
    "./StateVersionLog": { stateVersionLog: { createVersion: async (input) => {
      versions += 1;
      assert.deepEqual(input.acceptedProposalIds, ["proposal"]);
      return { id: "version" };
    } } },
    "./stateProposalSourceQuality": quality,
  });
  return {
    service: new StateCommitService(), review: review.characterResourceReviewStore, tx, events,
    state: () => ({ status: row.status, applied, versions, linked, snapshots }),
  };
}

const confirm = (h, extra = {}) => h.service.commitExistingProposals({
  novelId: "novel", proposalIds: ["proposal", " proposal "], chapterId: "chapter", reason: "manual", ...extra,
});

test("concurrent confirmations apply and version a pending proposal only once", async () => {
  const h = harness();
  const results = await Promise.all([confirm(h), confirm(h)]);
  assert.equal(results.reduce((count, result) => count + result.committed.length, 0), 1);
  assert.deepEqual(h.state(), { status: "committed", applied: 1, versions: 1, linked: 1, snapshots: 1 });
  assert.deepEqual(h.events, ["committed", "apply"]);
  assert.equal((await h.review.rejectPending("novel", "proposal")).count, 0);
});

test("rejection winning after a confirmation read cannot be overwritten or applied", async () => {
  const h = harness({ beforeClaim: (review) => review.rejectPending("novel", "proposal") });
  const result = await confirm(h);
  assert.deepEqual(result, { versionRecord: null, committed: [], pendingReview: [], rejected: [] });
  assert.deepEqual(h.state(), { status: "rejected", applied: 0, versions: 0, linked: 0, snapshots: 0 });
});

test("state application failure rolls back the claim and does not create a version", async () => {
  const h = harness({ applyError: new Error("ledger write failed") });
  await assert.rejects(confirm(h), /ledger write failed/);
  assert.deepEqual(h.state(), { status: "pending_review", applied: 0, versions: 0, linked: 0, snapshots: 0 });
});

test("review persistence keeps confirmation and rejection scoped to the same novel", async () => {
  const h = harness();
  assert.equal((await h.review.rejectPending("other-novel", "proposal")).count, 0);
  assert.equal((await confirm(h, { novelId: "other-novel" })).committed.length, 0);
  assert.equal(h.state().status, "pending_review");
});

test("automatic review checks execution ownership and exact saved content before claiming", async () => {
  const h = harness({ chapterMatches: false });
  let ownershipChecked = false;
  await assert.rejects(confirm(h, { automaticResourceReview: {
    expectedChapterContent: "正文", assertExecutionOwnership: async (tx) => {
      assert.equal(tx, h.tx);
      ownershipChecked = true;
    },
  } }), /章节正文版本已变化/);
  assert.equal(ownershipChecked, true);
  assert.deepEqual(h.state(), { status: "pending_review", applied: 0, versions: 0, linked: 0, snapshots: 0 });
});
