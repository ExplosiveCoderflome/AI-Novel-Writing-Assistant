const test = require("node:test");
const assert = require("node:assert/strict");
const { applyEvent, createPlanOrchestrator } = require("../../../dist/modules/director/domain");
const { RunExecutor, StepRegistry } = require("../../../dist/modules/director/application");
const { plan, contract, artifact } = require("../fixtures");

function createHarness({ orchestrator = createPlanOrchestrator(), crashOnStepFinished = false, rejectionBudget = 2 } = {}) {
  const runContract = contract({ rejectionBudget });
  let control = { version: 1, status: "running", pause: null, gate: null, cursorStepId: null, failureReason: null };
  const artifacts = [artifact("novel_seed", { status: "confirmed" })];
  const debts = [];
  const events = [];
  const executed = [];
  let crash = crashOnStepFinished;

  const runRepository = {
    getContract: async () => runContract,
    getControl: async () => control,
    transition: async (_runId, event, expectedVersion) => {
      if (control.version !== expectedVersion) throw new Error("version conflict");
      if (event.type === "step_finished" && crash) {
        crash = false;
        throw new Error("simulated crash after artifact save");
      }
      control = applyEvent(control, event, expectedVersion);
      return control;
    },
  };
  const artifactLedger = {
    listByNovel: async () => artifacts,
    record: async (input) => {
      const next = { type: input.type, scope: input.scope, version: artifacts.filter((item) => item.type === input.type && item.scope === input.scope).length + 1, status: input.status, protectedUserContent: input.protectedUserContent };
      artifacts.push(next);
      return next;
    },
  };
  const qualityDebtRepository = {
    listByNovel: async () => debts,
    record: async (input) => { debts.push({ chapterOrder: input.chapterOrder, code: input.code }); },
  };
  const eventLog = {
    list: async () => events,
    append: async (input) => { events.push({ seq: events.length + 1, type: input.type, payload: input.payload, createdAt: new Date() }); },
  };
  const registry = new StepRegistry();
  for (const step of plan.steps) {
    registry.register(step.id, async () => {
      executed.push(step.id);
      return {
        artifact: {
          scope: "book",
          status: "confirmed",
          protectedUserContent: false,
          contentRef: `${step.id}-content`,
          contentHash: null,
        },
        tokensUsed: 1,
      };
    });
  }
  const factsLoader = {
    load: async () => ({ contract: runContract, control, facts: { artifacts: [...artifacts], debts: [...debts], stopSignal: null } }),
  };
  const executor = new RunExecutor({
    factsLoader,
    planRegistry: { get: () => plan },
    orchestrator,
    runRepository,
    artifactLedger,
    qualityDebtRepository,
    eventLog,
    stepRegistry: registry,
  });
  return { executor, executed, artifacts, events, getControl: () => control };
}

test("the executor runs every dependency step once and completes the run", async () => {
  const harness = createHarness();
  for (let index = 0; index < 10 && harness.getControl().status === "running"; index += 1) {
    await harness.executor.runOnce("run-1");
  }
  assert.deepEqual(harness.executed, ["story_macro", "character_cast", "volume_strategy", "chapter_list"]);
  assert.equal(harness.getControl().status, "completed");
});

test("a crash after artifact save resumes at the next step without repeating the saved step", async () => {
  const harness = createHarness({ crashOnStepFinished: true });
  await assert.rejects(() => harness.executor.runOnce("run-1"), /simulated crash/);
  for (let index = 0; index < 10 && harness.getControl().status === "running"; index += 1) {
    await harness.executor.runOnce("run-1");
  }
  assert.deepEqual(harness.executed, ["story_macro", "character_cast", "volume_strategy", "chapter_list"]);
  assert.equal(harness.getControl().status, "completed");
});

test("rejected actions are recorded and exhaust the rejection budget into a manual pause", async () => {
  const harness = createHarness({
    rejectionBudget: 2,
    orchestrator: { next: () => ({ kind: "run_step", stepId: "not-registered" }) },
  });
  assert.equal((await harness.executor.runOnce("run-1")).kind, "rejected");
  const result = await harness.executor.runOnce("run-1");
  assert.equal(result.kind, "paused");
  assert.equal(harness.getControl().status, "paused");
  assert.equal(harness.events.filter((event) => event.type === "action_rejected").length, 2);
  assert.equal(harness.events.filter((event) => event.type === "stop_signal").length, 1);
});
