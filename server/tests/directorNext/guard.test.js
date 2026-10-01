const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts, contract, runningControl } = require("./fixtures");

function check(overrides = {}) {
  return domain.checkAction({
    action: { kind: "run_step", stepId: "story_macro" },
    plan,
    contract: contract(),
    control: runningControl(),
    facts: facts([artifact("novel_seed")]),
    tokensUsed: 0,
    rejections: 0,
    ...overrides,
  });
}

function codeOf(verdict) {
  assert.equal(verdict.ok, false, "expected a rejection");
  return verdict.code;
}

test("a legal run_step is accepted", () => {
  assert.deepEqual(check(), { ok: true });
});

test("actions are only accepted while the run is running", () => {
  for (const status of ["queued", "waiting_gate", "paused", "completed", "failed", "cancelled"]) {
    assert.equal(codeOf(check({ control: runningControl({ status }) })), "run_not_active");
  }
});

test("run_step rejects unknown steps, out-of-scope steps and unmet requirements", () => {
  assert.equal(codeOf(check({ action: { kind: "run_step", stepId: "nope" } })), "unknown_step");
  assert.equal(
    codeOf(check({ contract: contract({ stepIdsInScope: ["character_cast"] }) })),
    "step_out_of_scope",
  );
  assert.equal(
    codeOf(check({ action: { kind: "run_step", stepId: "character_cast" } })),
    "requires_unmet",
  );
});

test("assisted runs require confirmed dependencies, auto runs accept drafts", () => {
  const draftMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "draft" })]);
  const action = { kind: "run_step", stepId: "character_cast" };
  assert.deepEqual(check({ action, facts: draftMacro }), { ok: true });
  assert.equal(
    codeOf(check({ action, facts: draftMacro, contract: contract({ driver: "assisted" }) })),
    "requires_unmet",
  );
  const confirmedMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "confirmed" })]);
  assert.deepEqual(
    check({ action, facts: confirmedMacro, contract: contract({ driver: "assisted" }) }),
    { ok: true },
  );
});

test("run_step never overwrites protected user content", () => {
  const protectedMacro = facts([
    artifact("novel_seed"),
    artifact("story_macro", { status: "stale", protectedUserContent: true }),
  ]);
  assert.equal(codeOf(check({ facts: protectedMacro })), "protected_content");
});

test("run_step is rejected once the token budget is reached", () => {
  assert.deepEqual(check({ contract: contract({ tokenBudget: 100 }), tokensUsed: 99 }), { ok: true });
  assert.equal(codeOf(check({ contract: contract({ tokenBudget: 100 }), tokensUsed: 100 })), "budget_exceeded");
});

test("open_gate is only valid for assisted runs with existing artifacts", () => {
  const withMacro = facts([artifact("novel_seed"), artifact("story_macro")]);
  const gate = { kind: "open_gate", gateId: "g1", artifactTypes: ["story_macro"] };
  assert.equal(codeOf(check({ action: gate, facts: withMacro })), "invalid_action");
  assert.deepEqual(
    check({ action: gate, facts: withMacro, contract: contract({ driver: "assisted" }) }),
    { ok: true },
  );
  assert.equal(
    codeOf(
      check({
        action: { kind: "open_gate", gateId: "g1", artifactTypes: [] },
        facts: withMacro,
        contract: contract({ driver: "assisted" }),
      }),
    ),
    "invalid_action",
  );
  assert.equal(
    codeOf(
      check({
        action: { kind: "open_gate", gateId: "g1", artifactTypes: ["character_cast"] },
        facts: withMacro,
        contract: contract({ driver: "assisted" }),
      }),
    ),
    "invalid_action",
  );
});

test("record_debt validates its payload", () => {
  assert.deepEqual(check({ action: { kind: "record_debt", chapterOrder: 3, code: "quality.local_patch" } }), { ok: true });
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 0, code: "x" } })), "invalid_action");
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 1.5, code: "x" } })), "invalid_action");
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 1, code: "" } })), "invalid_action");
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 11, code: "x" } })), "chapter_out_of_scope");
});

test("complete is rejected while steps remain, accepted when none remain", () => {
  assert.equal(codeOf(check({ action: { kind: "complete" } })), "steps_remaining");
  const allDone = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
    artifact("volume_strategy"),
    artifact("chapter_list"),
  ]);
  assert.deepEqual(check({ action: { kind: "complete" }, facts: allDone }), { ok: true });
  assert.deepEqual(
    check({ action: { kind: "complete" }, contract: contract({ stepIdsInScope: ["story_macro"] }), facts: facts([artifact("novel_seed"), artifact("story_macro")]) }),
    { ok: true },
  );
});

test("pause and fail require a structured stop signal", () => {
  assert.equal(codeOf(check({ action: { kind: "pause", pause: { kind: "replan", reason: "x" } } })), "stop_signal_required");
  assert.equal(codeOf(check({ action: { kind: "fail", reason: "x" } })), "stop_signal_required");
  assert.deepEqual(check({
    action: { kind: "pause", pause: { kind: "safety", reason: "risk" } },
    facts: facts([], { stopSignal: { kind: "safety", reason: "risk" } }),
  }), { ok: true });
  assert.deepEqual(check({
    action: { kind: "pause", pause: { kind: "manual_recovery", reason: "quality" } },
    contract: contract({ issuePolicy: { mode: "quality_first", version: "policy-2" } }),
    facts: facts([], { stopSignal: { kind: "manual_recovery", reason: "quality", action: "pause_for_manual" } }),
  }), { ok: true });
  assert.deepEqual(check({
    action: { kind: "fail", reason: "no content" },
    facts: facts([], { stopSignal: { kind: "no_usable_content", reason: "no content" } }),
  }), { ok: true });
});

test("the rejection budget stops a misbehaving orchestrator", () => {
  assert.equal(codeOf(check({ rejections: 3 })), "rejection_budget_exhausted");
  assert.deepEqual(check({ rejections: 2 }), { ok: true });
});

// 契约测试：一个故意提交非法动作的“假 agent”，守卫必须逐个拒绝，且不依赖 agent 自觉。
test("a misbehaving agent orchestrator cannot get illegal actions past the guard", () => {
  const badAgent = {
    proposals: [
      { kind: "run_step", stepId: "does_not_exist" },
      { kind: "run_step", stepId: "chapter_list" },
      { kind: "complete" },
      { kind: "open_gate", gateId: "g", artifactTypes: ["story_macro"] },
      { kind: "record_debt", chapterOrder: -1, code: "x" },
    ],
    next() {
      return this.proposals.shift();
    },
  };
  const expectedCodes = ["unknown_step", "requires_unmet", "steps_remaining", "invalid_action", "invalid_action"];
  const seen = [];
  let rejections = 0;
  for (let index = 0; index < expectedCodes.length; index += 1) {
    const verdict = check({ action: badAgent.next(), rejections: Math.min(rejections, 2) });
    assert.equal(verdict.ok, false);
    seen.push(verdict.code);
    rejections += 1;
  }
  assert.deepEqual(seen, expectedCodes);
  assert.equal(codeOf(check({ action: { kind: "run_step", stepId: "story_macro" }, rejections })), "rejection_budget_exhausted");
});
