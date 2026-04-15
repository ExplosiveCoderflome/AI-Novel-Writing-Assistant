const test = require("node:test");
const assert = require("node:assert/strict");

const {
  snapshotExtractionOutputSchema,
} = require("../dist/services/state/stateSchemas.js");

test("snapshot extraction schema accepts omitted ids while preserving nullable reader refs", () => {
  const parsed = snapshotExtractionOutputSchema.parse({
    summary: "局势稳定",
    informationStates: [
      {
        holderType: "reader",
        holderRefId: null,
        holderRefName: null,
        fact: "读者知道主角暂时掌握主动权。",
        status: "known",
        summary: "信息差成立。",
      },
    ],
    relationStates: [
      {
        sourceCharacterName: "林青",
        targetCharacterName: "苏雨",
        summary: "两人从互相试探转入有限合作。",
      },
    ],
    foreshadowStates: [
      {
        title: "后续回收伏笔",
        summary: "本章只完成铺垫，尚未兑现。",
        status: "setup",
        setupChapterId: "第2章",
      },
    ],
  });

  assert.equal(parsed.informationStates[0].holderRefId, null);
  assert.equal(parsed.informationStates[0].holderRefName, null);
  assert.equal("targetCharacterId" in parsed.relationStates[0], false);
  assert.equal("payoffChapterId" in parsed.foreshadowStates[0], false);
});
