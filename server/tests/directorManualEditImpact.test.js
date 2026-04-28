const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildManualEditFallbackDecision,
  buildManualEditInventoryFromArtifacts,
} = require("../dist/services/novel/director/runtime/DirectorWorkspaceAnalyzer.js");

function chapterDraft(hash) {
  return {
    id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
    novelId: "novel-1",
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "user_edited",
    contentRef: { table: "Chapter", id: "chapter-1" },
    contentHash: hash,
    schemaVersion: "test",
    protectedUserContent: true,
    updatedAt: "2026-04-28T01:00:00.000Z",
  };
}

test("manual edit inventory detects changed chapter draft hashes and dependent reports", () => {
  const currentDraft = chapterDraft("hash-new");
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [
      currentDraft,
      {
        id: "audit_report:chapter:chapter-1:AuditReport:audit-1",
        novelId: "novel-1",
        artifactType: "audit_report",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "active",
        source: "backfilled",
        contentRef: { table: "AuditReport", id: "audit-1" },
        schemaVersion: "test",
        dependsOn: [{ artifactId: currentDraft.id, version: 1 }],
      },
    ],
    previousArtifacts: [chapterDraft("hash-old")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
        changedAt: "2026-04-28T01:00:00.000Z",
      },
    },
    generatedAt: "2026-04-28T01:01:00.000Z",
  });

  assert.equal(inventory.changedChapters.length, 1);
  assert.equal(inventory.changedChapters[0].chapterId, "chapter-1");
  assert.equal(inventory.changedChapters[0].contentHash, "hash-new");
  assert.equal(inventory.changedChapters[0].previousContentHash, "hash-old");
  assert.deepEqual(inventory.changedChapters[0].relatedArtifactIds.sort(), [
    "audit_report:chapter:chapter-1:AuditReport:audit-1",
    "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  ].sort());
});

test("manual edit fallback recommends local review for changed chapters", () => {
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [chapterDraft("hash-new")],
    previousArtifacts: [chapterDraft("hash-old")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
      },
    },
    generatedAt: "2026-04-28T01:01:00.000Z",
  });
  const decision = buildManualEditFallbackDecision(inventory);

  assert.equal(decision.impactLevel, "low");
  assert.equal(decision.safeToContinue, true);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.minimalRepairPath[0].action, "review_recent_chapters");
  assert.equal(decision.affectedArtifactIds.includes("chapter_draft:chapter:chapter-1:Chapter:chapter-1"), true);
});

test("manual edit inventory stays empty when tracked hashes did not change", () => {
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [chapterDraft("hash-same")],
    previousArtifacts: [chapterDraft("hash-same")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
      },
    },
  });
  const decision = buildManualEditFallbackDecision(inventory);

  assert.equal(inventory.changedChapters.length, 0);
  assert.equal(decision.impactLevel, "none");
  assert.equal(decision.safeToContinue, true);
});
