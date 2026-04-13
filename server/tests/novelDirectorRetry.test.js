const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyDirectorLlmOverride,
} = require("../dist/services/novel/director/novelDirectorHelpers.js");

function buildDirectorInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    batchId: "batch_1",
    round: 1,
    candidate: {
      id: "candidate_1",
      workingTitle: "Rulebound Courier",
      logline: "A courier is dragged into a hidden network of rules, debts and urban anomalies.",
      positioning: "Urban rule-based growth thriller",
      sellingPoint: "Rule anomalies + grassroots climb",
      coreConflict: "To survive she must exploit the same rules that are hunting her.",
      protagonistPath: "From self-preserving courier to rule-breaking operator.",
      endingDirection: "Costly breakthrough with room for escalation.",
      hookStrategy: "Every delivery exposes one deeper rule and one stronger predator.",
      progressionLoop: "Discover rule, pay cost, gain leverage, strike back.",
      whyItFits: "Strong serialized pressure and fast beginner-friendly drive.",
      toneKeywords: ["urban", "rules", "growth"],
      targetChapterCount: 30,
    },
    workflowTaskId: "task_retry_demo",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.7,
    runMode: "auto_to_ready",
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    estimatedChapterCount: 30,
    ...overrides,
  };
}

test("applyDirectorLlmOverride rewrites persisted auto director model selection", () => {
  const nextSeedPayload = applyDirectorLlmOverride({
    novelId: "novel_retry_demo",
    directorInput: buildDirectorInput(),
  }, {
    provider: "openai",
    model: "gpt-5-mini",
    temperature: 1,
  });

  assert.ok(nextSeedPayload);
  assert.equal(nextSeedPayload.directorInput.provider, "openai");
  assert.equal(nextSeedPayload.directorInput.model, "gpt-5-mini");
  assert.equal(nextSeedPayload.directorInput.temperature, 1);
  assert.equal(nextSeedPayload.directorInput.candidate.workingTitle, "Rulebound Courier");
});
