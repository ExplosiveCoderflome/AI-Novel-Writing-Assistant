const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPipelineBudgetContext,
  resolvePipelineCostGuardPolicy,
  resolvePipelineCostMode,
  resolvePipelinePrefetchMode,
} = require("../dist/services/novel/production/pipelineCostGuard.js");

test("economy mode applies conservative per-chapter and job budgets", () => {
  const policy = resolvePipelineCostGuardPolicy({
    costMode: "economy",
    chapterCount: 3,
  });

  assert.equal(policy.maxJobTotalTokens, 180000);
  assert.equal(policy.maxJobLlmCalls, 21);
  assert.equal(policy.maxChapterTotalTokens, 55000);
  assert.equal(policy.maxChapterLlmCalls, 6);
  assert.equal(policy.warningRatio, 0.8);
});

test("balanced mode keeps a wider budget and allows prefetch by default", () => {
  const policy = resolvePipelineCostGuardPolicy({
    costMode: "balanced",
    chapterCount: 2,
  });

  assert.equal(policy.maxJobTotalTokens, 180000);
  assert.equal(policy.maxJobLlmCalls, 20);
  assert.equal(policy.maxChapterTotalTokens, 75000);
  assert.equal(policy.maxChapterLlmCalls, 9);
  assert.equal(resolvePipelinePrefetchMode({ costMode: "balanced" }), "enabled");
});

test("unlimited mode disables hard budget context", () => {
  assert.equal(resolvePipelineCostGuardPolicy({
    costMode: "unlimited",
    chapterCount: 10,
  }), null);
  assert.equal(buildPipelineBudgetContext({ policy: null }), undefined);
});

test("explicit cost guard overrides base limits", () => {
  const policy = resolvePipelineCostGuardPolicy({
    costMode: "economy",
    chapterCount: 10,
    costGuard: {
      maxJobTotalTokens: 1000,
      maxChapterLlmCalls: 2,
      warningRatio: 0.5,
    },
  });

  assert.equal(policy.maxJobTotalTokens, 1000);
  assert.equal(policy.maxJobLlmCalls, 70);
  assert.equal(policy.maxChapterTotalTokens, 55000);
  assert.equal(policy.maxChapterLlmCalls, 2);
  assert.equal(policy.warningRatio, 0.5);
});

test("cost mode defaults to economy", () => {
  assert.equal(resolvePipelineCostMode(undefined), "economy");
  assert.equal(resolvePipelinePrefetchMode({ costMode: "economy" }), "disabled");
});
