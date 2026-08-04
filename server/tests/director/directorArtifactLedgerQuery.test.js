const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorArtifactBookSummary,
} = require("../../dist/services/novel/director/runtime/DirectorArtifactLedgerQueryService.js");

function row(overrides) {
  return {
    id: overrides.id,
    artifactType: overrides.artifactType,
    targetType: overrides.targetType ?? "chapter",
    targetId: overrides.targetId ?? "chapter-1",
    status: overrides.status ?? "active",
    protectedUserContent: overrides.protectedUserContent ?? false,
    contentHash: overrides.contentHash ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-04-30T00:00:00.000Z"),
    dependencies: overrides.dependencies ?? [],
  };
}

test("buildDirectorArtifactBookSummary exposes status, dependency, and type summaries", () => {
  const summary = buildDirectorArtifactBookSummary([
    row({
      id: "draft-1",
      artifactType: "chapter_draft",
      protectedUserContent: true,
      contentHash: "hash-a",
      dependencies: [{ id: "dep-1" }],
      updatedAt: new Date("2026-04-30T01:00:00.000Z"),
    }),
    row({
      id: "audit-1",
      artifactType: "audit_report",
      status: "stale",
      dependencies: [{ id: "dep-2" }, { id: "dep-3" }],
      updatedAt: new Date("2026-04-30T02:00:00.000Z"),
    }),
    row({
      id: "repair-1",
      artifactType: "repair_ticket",
      status: "active",
      dependencies: [],
      updatedAt: new Date("2026-04-30T03:00:00.000Z"),
    }),
  ]);

  assert.equal(summary.activeCount, 2);
  assert.equal(summary.staleCount, 1);
  assert.equal(summary.protectedUserContentCount, 1);
  assert.equal(summary.repairTicketCount, 1);
  assert.equal(summary.dependencyCount, 3);
  assert.equal(summary.recentArtifacts[0].id, "repair-1");
  assert.equal(summary.recentArtifacts[1].id, "audit-1");

  const draftType = summary.byType.find((item) => item.artifactType === "chapter_draft");
  assert.equal(draftType.totalCount, 1);
  assert.equal(draftType.protectedUserContentCount, 1);
  assert.equal(draftType.dependencyCount, 1);
});
