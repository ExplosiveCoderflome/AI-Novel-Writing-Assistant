const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StateCommitService,
} = require("../dist/services/novel/state/StateCommitService.js");

test("StateCommitService validate auto-commits low-risk runtime updates", () => {
  const service = new StateCommitService();
  const result = service.validate([
    {
      novelId: "novel-1",
      chapterId: "chapter-5",
      sourceSnapshotId: "snapshot-5",
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      proposalType: "character_state_update",
      riskLevel: "low",
      status: "validated",
      summary: "hero state advanced",
      payload: {
        characterId: "char-1",
        currentState: "takes initiative",
        currentGoal: "push the counterattack",
      },
      evidence: ["hero finally starts moving"],
      validationNotes: [],
    },
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted[0].status, "committed");
});

test("StateCommitService validate routes disclosure and relation drift into pending review", () => {
  const service = new StateCommitService();
  const result = service.validate([
    {
      novelId: "novel-1",
      chapterId: "chapter-5",
      sourceSnapshotId: "snapshot-5",
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      proposalType: "information_disclosure",
      riskLevel: "medium",
      status: "validated",
      summary: "reader now knows the hidden employer",
      payload: {
        fact: "the employer is the prince",
      },
      evidence: ["the reveal is on page"],
      validationNotes: [],
    },
    {
      novelId: "novel-1",
      chapterId: "chapter-5",
      sourceSnapshotId: "snapshot-5",
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      proposalType: "relation_state_update",
      riskLevel: "medium",
      status: "validated",
      summary: "trust shifts between leads",
      payload: {
        sourceCharacterId: "char-1",
        targetCharacterId: "char-2",
      },
      evidence: ["they finally exchange the evidence"],
      validationNotes: [],
    },
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.pendingReview.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(
    result.pendingReview.map((item) => item.status),
    ["pending_review", "pending_review"],
  );
});

test("StateCommitService validate rejects malformed character updates", () => {
  const service = new StateCommitService();
  const result = service.validate([
    {
      novelId: "novel-1",
      chapterId: "chapter-5",
      sourceSnapshotId: "snapshot-5",
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      proposalType: "character_state_update",
      riskLevel: "low",
      status: "validated",
      summary: "missing character id",
      payload: {
        currentState: "unstable",
      },
      evidence: [],
      validationNotes: [],
    },
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].validationNotes.join(" "), /missing characterId/);
});
