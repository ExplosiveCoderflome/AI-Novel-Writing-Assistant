const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StateCommitService,
} = require("../dist/services/novel/state/StateCommitService.js");

function makeResourceProposal(overrides = {}) {
  const { payload: payloadOverrides = {}, ...proposalOverrides } = overrides;
  return {
    novelId: "novel-1",
    chapterId: "chapter-5",
    sourceSnapshotId: null,
    sourceType: "chapter_background_sync",
    sourceStage: "chapter_execution",
    proposalType: "character_resource_update",
    riskLevel: "low",
    status: "validated",
    summary: "hero acquires the service tunnel key",
    payload: {
      resourceKey: "service_tunnel_key:char-1",
      resourceName: "service tunnel key",
      chapterOrder: 5,
      resourceType: "credential",
      narrativeFunction: "key",
      updateType: "acquired",
      ownerType: "character",
      ownerId: "char-1",
      ownerName: "Hero",
      holderCharacterId: "char-1",
      holderCharacterName: "Hero",
      statusAfter: "available",
      visibilityAfter: {
        readerKnows: true,
        holderKnows: true,
        knownByCharacterIds: ["char-1"],
      },
      narrativeImpact: "Hero can enter the service tunnel but cannot bypass the vault door.",
      expectedFutureUse: "reach the underground corridor",
      constraints: ["only opens the service tunnel"],
      confidence: 0.86,
      ...payloadOverrides,
    },
    evidence: ["Hero puts the service tunnel key in his inner pocket."],
    validationNotes: [],
    ...proposalOverrides,
  };
}

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

test("StateCommitService validate auto-commits low-risk character resource updates", () => {
  const service = new StateCommitService();
  const result = service.validate([makeResourceProposal()]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted[0].status, "committed");
});

test("StateCommitService validate auto-commits medium background character resource updates", () => {
  const service = new StateCommitService();
  const result = service.validate([
    makeResourceProposal({
      riskLevel: "medium",
      payload: {
        narrativeImpact: "Hero can use the marked sword in the next escape beat.",
      },
    }),
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted[0].status, "committed");
  assert.match(result.accepted[0].validationNotes.join(" "), /auto-committed background resource update/);
});

test("StateCommitService validate routes manual medium character resource updates into pending review", () => {
  const service = new StateCommitService();
  const result = service.validate([
    makeResourceProposal({
      sourceType: "manual_resource_extract",
      riskLevel: "medium",
    }),
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.pendingReview.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.pendingReview[0].status, "pending_review");
});

test("StateCommitService validate routes risky character resource updates into pending review", () => {
  const service = new StateCommitService();
  const result = service.validate([
    makeResourceProposal({
      riskLevel: "high",
      payload: {
        resourceName: "villain hidden ledger",
        narrativeFunction: "hidden_card",
        updateType: "destroyed",
        statusAfter: "destroyed",
        confidence: 0.42,
        narrativeImpact: "The villain loses a core blackmail resource.",
      },
    }),
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.pendingReview.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.pendingReview[0].status, "pending_review");
  assert.match(result.pendingReview[0].validationNotes.join(" "), /low confidence|manual review/);
});

test("StateCommitService validate auto-commits risky AI-driver character resource updates", () => {
  const service = new StateCommitService();
  const result = service.validate([
    makeResourceProposal({
      sourceType: "chapter_background_sync",
      sourceStage: "ai_driver_chapter_execution",
      riskLevel: "high",
      payload: {
        resourceName: "villain hidden ledger",
        narrativeFunction: "hidden_card",
        updateType: "destroyed",
        statusAfter: "destroyed",
        confidence: 0.42,
        narrativeImpact: "The villain loses a core blackmail resource.",
      },
    }),
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted[0].status, "committed");
  assert.match(result.accepted[0].validationNotes.join(" "), /auto-committed AI-driver resource update/);
});

test("StateCommitService validate rejects character resource updates without evidence", () => {
  const service = new StateCommitService();
  const result = service.validate([
    makeResourceProposal({
      evidence: [],
    }),
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.pendingReview.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].validationNotes.join(" "), /missing evidence/);
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
