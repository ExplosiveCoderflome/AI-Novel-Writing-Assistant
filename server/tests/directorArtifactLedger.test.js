const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorArtifactId,
  normalizeDirectorArtifactTargets,
  reconcileDirectorArtifactLedger,
  stableDirectorContentHash,
  summarizeDirectorArtifactLedger,
} = require("../dist/services/novel/director/runtime/DirectorArtifactLedger.js");

function chapterDraft(hash, version = 1) {
  return {
    id: buildDirectorArtifactId({
      type: "chapter_draft",
      targetType: "chapter",
      targetId: "chapter-1",
      table: "Chapter",
      id: "chapter-1",
    }),
    novelId: "novel-1",
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: "chapter-1",
    version,
    status: "active",
    source: "user_edited",
    contentRef: { table: "Chapter", id: "chapter-1" },
    contentHash: hash,
    schemaVersion: "legacy-wrapper-v1",
    protectedUserContent: true,
    updatedAt: "2026-04-28T01:00:00.000Z",
  };
}

function auditReport(depVersion = 1) {
  return {
    id: buildDirectorArtifactId({
      type: "audit_report",
      targetType: "chapter",
      targetId: "chapter-1",
      table: "AuditReport",
      id: "audit-1",
    }),
    novelId: "novel-1",
    artifactType: "audit_report",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "backfilled",
    contentRef: { table: "AuditReport", id: "audit-1" },
    schemaVersion: "legacy-wrapper-v1",
    dependsOn: [{ artifactId: chapterDraft("hash-old").id, version: depVersion }],
    updatedAt: "2026-04-28T01:00:00.000Z",
  };
}

test("director artifact ledger increments versions when content hash changes", () => {
  const result = reconcileDirectorArtifactLedger(
    [chapterDraft("hash-old")],
    [chapterDraft("hash-new")],
    { runId: "task-1", sourceStepRunId: "task-1:chapter_execution_node:novel:novel-1" },
  );

  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].version, 2);
  assert.equal(result.artifacts[0].contentHash, "hash-new");
  assert.equal(result.artifacts[0].protectedUserContent, true);
  assert.equal(result.artifacts[0].sourceStepRunId, "task-1:chapter_execution_node:novel:novel-1");
  assert.deepEqual(result.indexedArtifacts.map((artifact) => artifact.id), [chapterDraft("hash-new").id]);
});

test("director artifact ledger marks dependents stale when dependency version advances", () => {
  const existingDraft = chapterDraft("hash-old");
  const existingAudit = auditReport(1);
  const result = reconcileDirectorArtifactLedger(
    [existingDraft, existingAudit],
    [chapterDraft("hash-new")],
  );
  const audit = result.artifacts.find((artifact) => artifact.artifactType === "audit_report");

  assert.equal(result.artifacts.find((artifact) => artifact.artifactType === "chapter_draft").version, 2);
  assert.equal(audit.status, "stale");
  assert.deepEqual(result.staleArtifacts.map((artifact) => artifact.id), [existingAudit.id]);
});

test("director artifact targets normalize hashes and stable ids", () => {
  const artifacts = normalizeDirectorArtifactTargets([
    {
      artifactType: "chapter_draft",
      targetType: "chapter",
      targetId: "chapter-1",
      contentRef: { table: "Chapter", id: "chapter-1" },
      source: "user_edited",
      contentHash: stableDirectorContentHash("  正文内容  "),
      protectedUserContent: true,
    },
  ], "novel-1");

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].id, "chapter_draft:chapter:chapter-1:Chapter:chapter-1");
  assert.equal(artifacts[0].contentHash.length, 64);
  assert.equal(artifacts[0].source, "user_edited");
  assert.equal(artifacts[0].protectedUserContent, true);
});

test("director artifact ledger summary exposes missing, stale and protected content", () => {
  const staleAudit = { ...auditReport(1), status: "stale" };
  const protectedDraft = chapterDraft("hash-new", 2);
  const summary = summarizeDirectorArtifactLedger(
    [protectedDraft, staleAudit],
    ["book_contract", "chapter_draft", "audit_report"],
  );

  assert.deepEqual(summary.missingArtifactTypes, ["book_contract"]);
  assert.deepEqual(summary.staleArtifacts.map((artifact) => artifact.id), [staleAudit.id]);
  assert.deepEqual(summary.protectedUserContentArtifacts.map((artifact) => artifact.id), [protectedDraft.id]);
  assert.deepEqual(summary.needsRepairArtifacts, []);
});
