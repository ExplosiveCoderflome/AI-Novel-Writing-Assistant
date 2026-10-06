const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts, contract, runningControl, deepFreeze } = require("./fixtures");

const orchestrator = domain.createPlanOrchestrator();

function next(factsSnapshot, contractOverrides = {}) {
  return orchestrator.next({ plan, contract: contract(contractOverrides), facts: factsSnapshot });
}

test("the plan orchestrator walks the plan in dependency order", () => {
  assert.deepEqual(next(facts([artifact("novel_seed")])), { kind: "run_step", stepId: "story_macro" });
  assert.deepEqual(next(facts([artifact("novel_seed"), artifact("story_macro")])), {
    kind: "run_step",
    stepId: "character_cast",
  });
});

test("the plan orchestrator completes when nothing remains in scope", () => {
  const allDone = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
    artifact("volume_strategy"),
    artifact("chapter_list"),
  ]);
  assert.deepEqual(next(allDone), { kind: "complete" });
  assert.deepEqual(
    next(facts([artifact("novel_seed"), artifact("story_macro")]), { stepIdsInScope: ["story_macro"] }),
    { kind: "complete" },
  );
});

test("quality debt never stops the orchestrator", () => {
  const manyDebts = Array.from({ length: 100 }, (_, index) => ({
    chapterOrder: index + 1,
    code: "quality.local_patch_plan",
  }));
  assert.deepEqual(next(facts([artifact("novel_seed")], { debts: manyDebts })), {
    kind: "run_step",
    stepId: "story_macro",
  });
});

test("only explicit stop signals pause the run", () => {
  const seed = [artifact("novel_seed")];
  const cases = [
    [{ kind: "replan", reason: "r" }, "replan"],
    [{ kind: "safety", reason: "r" }, "safety"],
    [{ kind: "data_integrity", reason: "r" }, "safety"],
    [{ kind: "no_usable_content", reason: "r" }, "safety"],
  ];
  for (const [stopSignal, expectedKind] of cases) {
    assert.deepEqual(next(facts(seed, { stopSignal })), {
      kind: "pause",
      pause: { kind: expectedKind, reason: "r" },
    });
  }
});

test("when nothing can run but work remains, the run pauses for manual recovery", () => {
  assert.deepEqual(next(facts([])), {
    kind: "pause",
    pause: { kind: "manual_recovery", reason: "no_runnable_step" },
  });
});

test("next() is a pure function of its input", () => {
  const input = deepFreeze({
    plan,
    contract: contract(),
    facts: facts([artifact("novel_seed"), artifact("story_macro")]),
  });
  assert.deepEqual(orchestrator.next(input), orchestrator.next(input));
});

// 崩溃恢复：进度只来自产物台账。在任意步骤边界丢弃所有内存状态后重启，
// 每个步骤仍然恰好执行一次，最终得到 complete。
test("crash at any step boundary resumes from the ledger without repeating steps", () => {
  const stepCount = plan.steps.length;
  for (let crashAfter = 0; crashAfter <= stepCount; crashAfter += 1) {
    const ledger = [artifact("novel_seed")];
    const executions = [];

    function runLoop(stopAfterExecutions) {
      let executed = 0;
      for (let guardIterations = 0; guardIterations < 20; guardIterations += 1) {
        const snapshot = facts(ledger.map((entry) => ({ ...entry })));
        const action = orchestrator.next({ plan, contract: contract(), facts: snapshot });
        const verdict = domain.checkAction({
          action,
          plan,
          contract: contract(),
          control: runningControl(),
          facts: snapshot,
          tokensUsed: 0,
          rejections: 0,
        });
        assert.equal(verdict.ok, true, `guard must accept ${JSON.stringify(action)}`);
        if (action.kind === "complete") {
          return "complete";
        }
        assert.equal(action.kind, "run_step");
        if (executed >= stopAfterExecutions) {
          return "crashed";
        }
        executions.push(action.stepId);
        const step = plan.steps.find((candidate) => candidate.id === action.stepId);
        ledger.push(artifact(step.produces));
        executed += 1;
      }
      throw new Error("loop did not terminate");
    }

    const first = runLoop(crashAfter);
    assert.equal(first, crashAfter >= stepCount ? "complete" : "crashed");
    const second = runLoop(Infinity);
    assert.equal(second, "complete");
    assert.deepEqual(executions, plan.steps.map((candidate) => candidate.id));
  }
});
