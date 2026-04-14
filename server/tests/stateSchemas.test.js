const test = require("node:test");
const assert = require("node:assert/strict");

const {
  snapshotExtractionOutputSchema,
} = require("../dist/services/state/stateSchemas.js");

test("snapshot extraction schema accepts nullable reader refs and payoff chapter ids", () => {
  const parsed = snapshotExtractionOutputSchema.parse({
    summary: "局势稳定",
    informationStates: [
      {
        holderType: "reader",
        holderRefId: null,
        holderRefName: null,
        fact: "读者知道主角暂时掌握主动权。",
        status: "known",
        summary: "信息差成立",
      },
    ],
    foreshadowStates: [
      {
        title: "后续回收伏笔",
        summary: "本章只完成铺垫，尚未兑现。",
        status: "setup",
        setupChapterId: "第2章",
        payoffChapterId: null,
      },
    ],
  });

  assert.equal(parsed.informationStates[0].holderRefId, null);
  assert.equal(parsed.informationStates[0].holderRefName, null);
  assert.equal(parsed.foreshadowStates[0].payoffChapterId, null);
});
