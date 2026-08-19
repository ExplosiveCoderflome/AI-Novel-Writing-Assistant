const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorArtifactId,
  compactDirectorArtifactDependencies,
  normalizeDirectorArtifactTargets,
  reconcileDirectorArtifactLedger,
  stableDirectorContentHash,
  summarizeDirectorArtifactLedger,
} = require("../../dist/services/novel/director/runtime/DirectorArtifactLedger.js");
const {
  buildDirectorArtifactBookSummary,
} = require("../../dist/services/novel/director/runtime/DirectorArtifactLedgerQueryService.js");

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

function repairTicket(status = "active") {
  return {
    id: buildDirectorArtifactId({
      type: "repair_ticket",
      targetType: "chapter",
      targetId: "chapter-1",
      table: "Chapter",
      id: "chapter-1",
    }),
    novelId: "novel-1",
    artifactType: "repair_ticket",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status,
    source: "ai_generated",
    contentRef: { table: "Chapter", id: "chapter-1" },
    schemaVersion: "legacy-wrapper-v1",
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

test("director artifact ledger keeps explicit content source when backfill refreshes the same artifact", () => {
  const existingDraft = {
    ...chapterDraft("hash-same"),
    protectedUserContent: null,
  };
  const backfilledDraft = {
    ...chapterDraft("hash-same"),
    source: "backfilled",
    protectedUserContent: null,
  };
  const result = reconcileDirectorArtifactLedger([existingDraft], [backfilledDraft]);

  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].source, "user_edited");
  assert.equal(result.artifacts[0].protectedUserContent, null);
});

test("director artifact ledger supersedes repair tickets no longer present in the workspace inventory", () => {
  const result = reconcileDirectorArtifactLedger(
    [chapterDraft("hash-old"), repairTicket()],
    [chapterDraft("hash-old")],
  );
  const resolvedTicket = result.artifacts.find((artifact) => artifact.artifactType === "repair_ticket");
  const summary = summarizeDirectorArtifactLedger(result.artifacts, ["chapter_draft"]);

  assert.equal(resolvedTicket.status, "superseded");
  assert.deepEqual(summary.needsRepairArtifacts, []);
});

test("director artifact ledger summary only counts active repair tickets", () => {
  const summary = summarizeDirectorArtifactLedger(
    [repairTicket("stale"), repairTicket("superseded"), { ...repairTicket("active"), id: "repair-active" }],
    ["chapter_draft"],
  );

  assert.deepEqual(summary.needsRepairArtifacts.map((artifact) => artifact.id), ["repair-active"]);
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

test("director artifact dependencies are compacted before snapshot persistence", () => {
  const artifacts = normalizeDirectorArtifactTargets([
    {
      artifactType: "audit_report",
      targetType: "chapter",
      targetId: "chapter-1",
      contentRef: { table: "AuditReport", id: "audit-1" },
      dependsOn: [
        { artifactId: " chapter_draft:chapter:chapter-1:Chapter:chapter-1 ", version: 1 },
        { artifactId: "chapter_draft:chapter:chapter-1:Chapter:chapter-1", version: 3 },
        { artifactId: "chapter_draft:chapter:chapter-1:Chapter:chapter-1", version: 2 },
        { artifactId: "", version: 1 },
      ],
    },
  ], "novel-1");

  assert.deepEqual(artifacts[0].dependsOn, [{
    artifactId: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
    version: 3,
  }]);
});

test("director artifact dependency helper deduplicates mixed dependency inputs", () => {
  const dependencies = compactDirectorArtifactDependencies([
    "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
    { artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1", version: 4 },
    { artifactId: " story_macro:novel:novel-1:StoryMacroPlan:macro-1 ", version: 2 },
    null,
  ]);

  assert.deepEqual(dependencies, [{
    artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
    version: 4,
  }]);
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

test("director artifact book summary exposes affected chapters and repair signals", () => {
  const summary = buildDirectorArtifactBookSummary([
    {
      id: "draft-1",
      artifactType: "chapter_draft",
      targetType: "chapter",
      targetId: "chapter-1",
      version: 2,
      status: "active",
      source: "auto_repaired",
      protectedUserContent: false,
      contentHash: "hash-1",
      updatedAt: new Date("2026-04-30T05:00:00.000Z"),
      dependencies: [],
    },
    {
      id: "audit-1",
      artifactType: "audit_report",
      targetType: "chapter",
      targetId: "chapter-1",
      version: 1,
      status: "stale",
      source: "ai_generated",
      protectedUserContent: false,
      contentHash: "hash-2",
      updatedAt: new Date("2026-04-30T05:01:00.000Z"),
      dependencies: [{ id: "dep-1" }],
    },
    {
      id: "repair-1",
      artifactType: "repair_ticket",
      targetType: "chapter",
      targetId: "chapter-2",
      version: 1,
      status: "active",
      source: "ai_generated",
      protectedUserContent: false,
      contentHash: "hash-3",
      updatedAt: new Date("2026-04-30T05:02:00.000Z"),
      dependencies: [],
    },
  ]);

  assert.equal(summary.affectedChapterCount, 2);
  assert.deepEqual(summary.affectedChapterIds, ["chapter-1", "chapter-2"]);
  assert.deepEqual(summary.recentStaleArtifacts.map((item) => item.id), ["audit-1"]);
  assert.deepEqual(summary.recentRepairArtifacts.map((item) => item.id), ["repair-1", "draft-1"]);
  assert.deepEqual(summary.recentVersionedArtifacts.map((item) => item.id), ["draft-1"]);
});
