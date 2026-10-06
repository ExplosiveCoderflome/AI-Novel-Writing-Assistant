const test = require("node:test");
const assert = require("node:assert/strict");
const { createStoryMacroStepHandler } = require("../../../dist/modules/director/steps/planning/storyMacro");
const { artifactContentHash } = require("../../../dist/modules/director/infrastructure/artifactContentHash");

function context(overrides = {}) {
  return {
    runId: "run-1",
    contract: {
      runId: "run-1",
      novelId: "novel-1",
      driver: "auto",
      planVersion: "director-next-production-v1",
      scope: "book",
      stepIdsInScope: null,
      chapterRange: null,
      issuePolicy: { mode: "completion_first", version: "v1" },
      modelConfig: { route: "default", model: "default", version: "v1" },
      tokenBudget: null,
      rejectionBudget: 3,
    },
    control: { version: 2, status: "running", pause: null, gate: null, cursorStepId: "story_macro", failureReason: null },
    facts: { artifacts: [], debts: [], stopSignal: null },
    step: { id: "story_macro", label: "生成故事宏观规划", requires: ["novel_seed"], produces: "story_macro", needs: ["structured_output"], gateable: false, overwrites: ["story_macro"] },
    ...overrides,
  };
}

test("story macro adapter delegates to the plan service and returns a ledger-ready artifact", async () => {
  const calls = [];
  const plan = {
    storyInput: "一名失忆的守门人守护一座会移动的城",
    expansion: { core: "守门人必须找回记忆" },
    decomposition: { premise: "城在移动" },
    constraints: ["不能离开城门"],
    constraintEngine: { phase_model: [] },
  };
  const handler = createStoryMacroStepHandler({
    storyMacroService: {
      decompose: async (...args) => {
        calls.push(args);
        return plan;
      },
    },
    inputProvider: async () => ({ storyInput: "一名失忆的守门人守护一座会移动的城", provider: "openai", model: "saved-model", temperature: 0.35 }),
    contentHash: artifactContentHash,
  });

  const result = await handler(context());

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ["novel-1", "一名失忆的守门人守护一座会移动的城"]);
  assert.deepEqual(calls[0][2], { provider: "openai", model: "saved-model", temperature: 0.35 });
  assert.equal(result.artifact.scope, "book");
  assert.equal(result.artifact.status, "draft");
  assert.equal(result.artifact.protectedUserContent, false);
  assert.equal(result.artifact.contentRef, "story_macro:novel-1");
  assert.match(result.artifact.contentHash, /^[a-f0-9]{64}$/);
});

test("story macro adapter rejects an empty novel seed before invoking the model", async () => {
  let called = false;
  const handler = createStoryMacroStepHandler({
    storyMacroService: { decompose: async () => { called = true; throw new Error("unexpected"); } },
    inputProvider: async () => ({storyInput: "  "}),
    contentHash: artifactContentHash,
  });

  await assert.rejects(() => handler(context()), /故事想法不能为空/);
  assert.equal(called, false);
});

test("story macro input is resolved against the active run rather than mutable book defaults", async () => {
  const active = context();
  let seen;
  const handler = createStoryMacroStepHandler({
    inputProvider: async input => { seen = input; return {storyInput: "保存的故事想法", model: input.contract.modelConfig.model}; },
    storyMacroService: {decompose: async (_id, _story, options) => ({model: options.model})},
    contentHash: artifactContentHash,
  });
  await handler(active);
  assert.equal(seen, active);
});
