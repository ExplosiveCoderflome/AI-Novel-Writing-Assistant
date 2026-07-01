const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CharacterResourceValidationService,
} = require("../dist/services/novel/characterResource/CharacterResourceValidationService.js");

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
      confidence: 0.91,
      ...payloadOverrides,
    },
    evidence: ["Hero puts the service tunnel key in his inner pocket."],
    validationNotes: [],
    ...proposalOverrides,
  };
}

test("CharacterResourceValidationService routes debt source proposals into pending review", () => {
  const service = new CharacterResourceValidationService();
  const result = service.validateProposal(makeResourceProposal({
    sourceQuality: "debt",
  }));

  assert.equal(result.status, "pending_review");
  assert.match(result.validationNotes.join(" "), /source_quality:debt/);
  assert.match(result.validationNotes.join(" "), /quality debt source requires manual review/);
});

test("CharacterResourceValidationService still rejects malformed debt proposals", () => {
  const service = new CharacterResourceValidationService();
  const result = service.validateProposal(makeResourceProposal({
    sourceQuality: "debt",
    evidence: [],
  }));

  assert.equal(result.status, "rejected");
  assert.match(result.validationNotes.join(" "), /missing evidence/);
});
