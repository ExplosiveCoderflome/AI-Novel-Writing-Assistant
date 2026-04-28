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
    volumePlans: [{
      ...row("volume-1"),
      mainPromise: "本卷持续兑现逆袭承诺",
      openPayoffsJson: "[\"公开打脸\"]",
      escalationMode: "逐层加压",
      protagonistChange: "更敢承担选择",
      nextVolumeHook: "新敌人出现",
    }],
    chapterPlanCount: 1,
    volumeChapterPlans: [{
      ...row("volume-chapter-1"),
      volumeId: "volume-1",
      chapterOrder: 1,
      purpose: "让读者看到主角主动破局",
      conflictLevel: 7,
      revealLevel: 4,
      mustAvoid: "不要跳过选择压力",
      taskSheet: "任务单",
      sceneCards: "场景卡",
      payoffRefsJson: "[\"公开打脸\"]",
    }],
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
      hook: "章末出现新选择",
      expectation: "下一章兑现公开打脸",
      riskFlags: "连续性风险",
      content: "正文",
      repairHistory: "需要修复",
      chapterStatus: "needs_repair",
      updatedAt: "2026-04-28T02:00:00.000Z",
    }],
    qualityReports: [{ id: "quality-1", chapterId: "chapter-1", updatedAt: "2026-04-28T02:10:00.000Z" }],
    auditReports: [{ id: "audit-1", chapterId: "chapter-1", updatedAt: "2026-04-28T02:20:00.000Z" }],
    storyStateSnapshots: [{
      id: "state-1",
      sourceChapterId: "chapter-1",
      summary: "主角完成一次选择，留下新压力。",
      rawStateJson: "{\"pressure\":\"new\"}",
      updatedAt: "2026-04-28T02:30:00.000Z",
    }],
    payoffLedgerItems: [{
      id: "payoff-1",
      currentStatus: "pending_payoff",
      lastTouchedChapterId: "chapter-1",
      setupChapterId: "chapter-1",
      payoffChapterId: null,
      sourceRefsJson: "[]",
      evidenceJson: "[]",
      riskSignalsJson: "[]",
      updatedAt: "2026-04-28T02:40:00.000Z",
    }],
    characterResourceItems: [{
      id: "resource-1",
      status: "available",
      ownerCharacterId: "character-1",
      holderCharacterId: "character-1",
      introducedChapterId: "chapter-1",
      lastTouchedChapterId: "chapter-1",
      riskSignalsJson: "[]",
      updatedAt: "2026-04-28T02:50:00.000Z",
    }],
    draftedChapterCount: 1,
    pendingRepairChapterCount: 1,
  });

  const taskSheet = result.artifacts.find((artifact) => artifact.artifactType === "chapter_task_sheet");
  const draft = result.artifacts.find((artifact) => artifact.artifactType === "chapter_draft");
  const repairTicket = result.artifacts.find((artifact) => artifact.artifactType === "repair_ticket");
  const retentionContracts = result.artifacts.filter((artifact) => artifact.artifactType === "chapter_retention_contract");
  const readerPromises = result.artifacts.filter((artifact) => artifact.artifactType === "reader_promise");
  const governance = result.artifacts.find((artifact) => artifact.artifactType === "character_governance_state");
  const continuity = result.artifacts.find((artifact) => artifact.artifactType === "continuity_state");
  const taskSheetDeps = taskSheet.dependsOn.map((dependency) => dependency.artifactId).sort();
  const draftDeps = draft.dependsOn.map((dependency) => dependency.artifactId).sort();
  const repairDeps = repairTicket.dependsOn.map((dependency) => dependency.artifactId).sort();

  assert.equal(result.hasChapterPlan, true);
  assert.equal(result.ledgerSummary.missingArtifactTypes.length, 0);
  assert.ok(readerPromises.length >= 3);
  assert.ok(governance);
  assert.ok(continuity);
  assert.equal(retentionContracts.length, 2);
  assert.deepEqual(taskSheetDeps, [
    "character_cast:novel:novel-1:Character:novel:novel-1",
    "character_governance_state:novel:novel-1:CharacterResourceLedgerItem:resource-1",
    "source_knowledge_pack:novel:novel-1:KnowledgeDocument:knowledge-1",
    "volume_strategy:volume:volume-1:VolumePlan:volume-1",
    "world_skeleton:novel:novel-1:World:world-1",
  ].sort());
  assert.deepEqual(draftDeps, [
    "chapter_retention_contract:chapter:chapter-1:Chapter:chapter-1",
    "chapter_retention_contract:chapter:chapter-1:VolumeChapterPlan:volume-chapter-1",
    "chapter_task_sheet:chapter:chapter-1:Chapter:chapter-1",
  ].sort());
  assert.deepEqual(repairDeps, [
    "audit_report:chapter:chapter-1:AuditReport:audit-1",
    "audit_report:chapter:chapter-1:QualityReport:quality-1",
    "chapter_retention_contract:chapter:chapter-1:Chapter:chapter-1",
    "chapter_retention_contract:chapter:chapter-1:VolumeChapterPlan:volume-chapter-1",
    "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  ].sort());
});
