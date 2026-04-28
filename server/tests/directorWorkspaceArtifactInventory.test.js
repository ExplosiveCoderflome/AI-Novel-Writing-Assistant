const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorWorkspaceArtifactInventory,
} = require("../dist/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.js");

function row(id) {
  return { id, updatedAt: "2026-04-28T01:00:00.000Z" };
}

test("workspace artifact inventory links chapter task sheets to upstream planning assets", () => {
  const result = buildDirectorWorkspaceArtifactInventory({
    novelId: "novel-1",
    hasWorldBinding: true,
    hasSourceKnowledge: true,
    hasContinuationAnalysis: false,
    bookContract: row("contract-1"),
    storyMacro: row("macro-1"),
    characterCount: 3,
    latestCharacter: row("character-latest"),
    volumePlans: [row("volume-1")],
    chapterPlanCount: 1,
    volumeChapterPlans: [{ volumeId: "volume-1", chapterOrder: 1 }],
    world: { ...row("world-1"), status: "active", version: 2 },
    sourceKnowledgeDocument: {
      ...row("knowledge-1"),
      activeVersionId: "knowledge-version-1",
      activeVersionNumber: 1,
    },
    continuationBookAnalysis: null,
    chapters: [{
      id: "chapter-1",
      order: 1,
      taskSheet: "任务单",
      content: "正文",
      repairHistory: "需要修复",
      chapterStatus: "needs_repair",
      updatedAt: "2026-04-28T02:00:00.000Z",
    }],
    qualityReports: [{ id: "quality-1", chapterId: "chapter-1", updatedAt: "2026-04-28T02:10:00.000Z" }],
    auditReports: [{ id: "audit-1", chapterId: "chapter-1", updatedAt: "2026-04-28T02:20:00.000Z" }],
    draftedChapterCount: 1,
    pendingRepairChapterCount: 1,
  });

  const taskSheet = result.artifacts.find((artifact) => artifact.artifactType === "chapter_task_sheet");
  const repairTicket = result.artifacts.find((artifact) => artifact.artifactType === "repair_ticket");
  const taskSheetDeps = taskSheet.dependsOn.map((dependency) => dependency.artifactId).sort();
  const repairDeps = repairTicket.dependsOn.map((dependency) => dependency.artifactId).sort();

  assert.equal(result.hasChapterPlan, true);
  assert.equal(result.ledgerSummary.missingArtifactTypes.length, 0);
  assert.deepEqual(taskSheetDeps, [
    "character_cast:novel:novel-1:Character:novel:novel-1",
    "source_knowledge_pack:novel:novel-1:KnowledgeDocument:knowledge-1",
    "volume_strategy:volume:volume-1:VolumePlan:volume-1",
    "world_skeleton:novel:novel-1:World:world-1",
  ].sort());
  assert.deepEqual(repairDeps, [
    "audit_report:chapter:chapter-1:AuditReport:audit-1",
    "audit_report:chapter:chapter-1:QualityReport:quality-1",
    "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  ].sort());
});
