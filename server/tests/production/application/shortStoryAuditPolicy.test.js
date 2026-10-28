const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../dist/modules/novel/short-story/application/shortStoryAuditPolicy");

test("short story v2 switch stays off unless explicitly enabled", () => {
  assert.equal(policy.shortStoryOnV2Enabled({}), false);
  assert.equal(policy.shortStoryOnV2Enabled({ SHORT_STORY_ON_V2: "false" }), false);
  assert.equal(policy.shortStoryOnV2Enabled({ SHORT_STORY_ON_V2: "true" }), true);
  assert.equal(policy.shortStoryOnV2Enabled({ SHORT_STORY_ON_V2: "1" }), true);
});

test("full audit refuses an unknown or insufficient context window", () => {
  const unknown = policy.evaluateShortStoryFullAuditBudget({ content: "正文", contextWindow: null });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, "unknown_context_window");
  assert.match(unknown.summary, /上下文/);

  const tooSmall = policy.evaluateShortStoryFullAuditBudget({ content: "正文".repeat(5000), contextWindow: 1000 });
  assert.equal(tooSmall.ok, false);
  assert.equal(tooSmall.reason, "context_budget_exceeded");
  assert.match(tooSmall.summary, /更换上下文更大的模型/);

  const fits = policy.evaluateShortStoryFullAuditBudget({ content: "短正文", contextWindow: 20000 });
  assert.equal(fits.ok, true);
});

test("configured context windows match only the exact provider and model", () => {
  const raw = JSON.stringify([
    { provider: "deepseek", model: "deepseek-flash", contextWindow: 1000000 },
    { provider: "other", model: "deepseek-flash", contextWindow: 32000 },
  ]);
  assert.equal(policy.contextWindowForConfiguredModel("deepseek", "deepseek-flash", raw), 1000000);
  assert.equal(policy.contextWindowForConfiguredModel("deepseek", "deepseek-chat", raw), null);
  assert.equal(policy.contextWindowForConfiguredModel("deepseek", "deepseek-flash", "not-json"), null);
});

test("a repair stays only when the second review accepts it", () => {
  assert.equal(policy.postRepairKeepsManuscript("accepted"), true);
  assert.equal(policy.postRepairKeepsManuscript("patchable"), false);
  assert.equal(policy.postRepairKeepsManuscript("replan_required"), false);
  assert.deepEqual(policy.qualityDebtFromAudit({
    summary: "修整后仍有因果问题。",
    issues: [{ description: "结局提前用掉了后文的关键证据。" }],
  }), ["结局提前用掉了后文的关键证据。"]);
});
