const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFailureClassification,
} = require("../dist/services/novel/runtime/chapterRuntimePackageBuilders.js");

function createAcceptance(repairability = "none") {
  return {
    repairability,
    decisionReason: "章节验收结构化判断。",
  };
}

test("buildFailureClassification keeps local quality issues out of replan_required", () => {
  const classification = buildFailureClassification({
    acceptance: createAcceptance(),
    hasBlockingIssues: true,
    replanRecommended: false,
    missingObligations: [],
  });

  assert.equal(classification.code, "draft_repair_exhausted");
});

test("buildFailureClassification preserves explicit plan misalignment as replan_required", () => {
  const classification = buildFailureClassification({
    acceptance: createAcceptance("plan_misalignment"),
    hasBlockingIssues: false,
    replanRecommended: false,
    missingObligations: [],
  });

  assert.equal(classification.code, "replan_required");
});
