const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeDirectorStateProposalResolutionForSafety,
} = require("../../dist/services/novel/director/runtime/DirectorStateProposalResolutionService.js");

function proposal(overrides = {}) {
  return {
    id: "proposal-1",
    novelId: "novel-1",
    chapterId: "chapter-1",
    sourceSnapshotId: null,
    sourceType: "chapter_runtime",
    sourceStage: "chapter_execution",
    proposalType: "information_disclosure",
    riskLevel: "medium",
    status: "pending_review",
    summary: "主角知道了新情报",
    payload: {},
    evidence: [],
    validationNotes: [],
    ...overrides,
  };
}

test("state proposal resolution keeps confident ordinary disclosures automatic", () => {
  const normalized = normalizeDirectorStateProposalResolutionForSafety({
    decision: "apply",
    confidence: 0.82,
    riskLevel: "medium",
    reason: "证据可信，和当前状态不冲突。",
    affectedChapterWindow: { chapterOrders: [] },
    proposalIds: ["proposal-1"],
    blockingLedgerKeys: [],
  }, [proposal()], { chapterOrder: 5 });

  assert.equal(normalized.decision, "apply");
  assert.deepEqual(normalized.proposalIds, ["proposal-1"]);
  assert.deepEqual(normalized.affectedChapterWindow.chapterOrders, [5]);
  assert.deepEqual(normalized.blockingLedgerKeys, ["proposal-1"]);
});

test("state proposal resolution escalates low confidence or high risk apply to manual recovery", () => {
  const lowConfidence = normalizeDirectorStateProposalResolutionForSafety({
    decision: "apply",
    confidence: 0.4,
    riskLevel: "low",
    reason: "模型无法确认。",
    affectedChapterWindow: { chapterOrders: [3] },
    proposalIds: ["proposal-1"],
    blockingLedgerKeys: [],
  }, [proposal()], { chapterOrder: 3 });
  const highRiskApply = normalizeDirectorStateProposalResolutionForSafety({
    decision: "apply",
    confidence: 0.9,
    riskLevel: "high",
    reason: "涉及受保护内容。",
    affectedChapterWindow: { chapterOrders: [3] },
    proposalIds: ["proposal-1"],
    blockingLedgerKeys: [],
  }, [proposal()], { chapterOrder: 3 });

  assert.equal(lowConfidence.decision, "manual_required");
  assert.equal(highRiskApply.decision, "manual_required");
});

