const test = require("node:test");
const assert = require("node:assert/strict");
const { contract, runningControl, artifact, plan } = require("../fixtures");
const { FactsLoader, ProjectionService } = require("../../../dist/modules/director/application");

function loader({ events = [], control = runningControl(), runContract = contract(), artifacts = [] } = {}) {
  return new FactsLoader({
    runRepository: {
      getContract: async () => runContract,
      getControl: async () => control,
    },
    artifactLedger: { listByNovel: async () => artifacts },
    qualityDebtRepository: { listByNovel: async () => [{ chapterOrder: 2, code: "local_gap" }] },
    eventLog: { list: async () => events },
  });
}

function event(seq, type, payload) {
  return { seq, type, payload, createdAt: new Date("2026-10-01T00:00:00.000Z") };
}

test("fact loading preserves scope and quality debt without inventing a stop", async () => {
  const result = await loader({
    artifacts: [artifact("novel_seed"), artifact("story_macro", { scope: "volume:1" })],
    events: [event(1, "step_error", { message: "replan_required" })],
  }).load("run-1");
  assert.equal(result.contract.scope, "book");
  assert.equal(result.facts.artifacts[1].scope, "volume:1");
  assert.deepEqual(result.facts.debts, [{ chapterOrder: 2, code: "local_gap" }]);
  assert.equal(result.facts.stopSignal, null);
});

test("only an explicit clear for the current signal consumes a structured stop", async () => {
  const stopped = event(1, "stop_signal", { kind: "replan", reason: "window_invalid", action: "stop_for_replan" });
  const staleClear = event(2, "stop_signal_cleared", { commandId: "resume-1", signalSeq: 99 });
  assert.equal((await loader({ events: [stopped, staleClear] }).load("run-1")).facts.stopSignal.kind, "replan");
  const clear = event(3, "stop_signal_cleared", { commandId: "resume-2", signalSeq: 1 });
  assert.equal((await loader({ events: [stopped, staleClear, clear] }).load("run-1")).facts.stopSignal, null);
  const nextStop = event(4, "stop_signal", { kind: "safety", reason: "protected_content" });
  assert.equal((await loader({ events: [stopped, clear, nextStop] }).load("run-1")).facts.stopSignal.kind, "safety");
});

test("malformed stop facts raise an integrity error instead of being ignored", async () => {
  for (const payload of [null, { kind: "unknown", reason: "bad" }, { kind: "safety", reason: "" }, { kind: "safety", reason: "risk", action: "" }]) {
    await assert.rejects(
      () => loader({ events: [event(1, "stop_signal", payload)] }).load("run-1"),
      (error) => error.name === "InvalidStopSignalError",
    );
  }
  await assert.rejects(
    () => loader({ events: [event(1, "stop_signal_cleared", { signalSeq: 1 })] }).load("run-1"),
    (error) => error.name === "InvalidStopSignalError",
  );
});

test("the saved manual pause stays visible even after a signal clear event", async () => {
  const loaded = await loader({
    control: runningControl({ status: "paused", pause: { kind: "manual_recovery", reason: "quality_first_pause" } }),
    events: [
      event(1, "stop_signal", { kind: "replan", reason: "old_stop" }),
      event(2, "stop_signal_cleared", { signalSeq: 1, commandId: "resume-1" }),
    ],
  }).load("run-1");
  assert.deepEqual(loaded.facts.stopSignal, { kind: "manual_recovery", reason: "quality_first_pause", action: "pause_for_manual" });
});

test("missing contract or control fails rather than projecting a fabricated run", async () => {
  for (const overrides of [{ runContract: null }, { control: null }]) {
    await assert.rejects(() => loader(overrides).load("missing"), (error) => error.name === "DirectorRunNotFoundError");
  }
});

test("projection uses the saved plan version and the book source route", async () => {
  const service = new ProjectionService({
    factsLoader: loader({ artifacts: [artifact("novel_seed"), artifact("story_macro")] }),
    planRegistry: { get: (version) => version === "test-plan-1" ? plan : null },
  });
  const view = await service.get("run-1");
  assert.equal(view.mode, "running");
  assert.deepEqual(view.progress, { done: 1, total: 4, source: "artifact_ledger" });
  assert.equal(view.sourceRoute, "/lab/director/novel-1");
  assert.deepEqual(view.debts, { count: 1, chapterOrders: [2] });
  assert.equal("contract" in view, false);
});

test("projection rejects an unavailable saved plan instead of using a new plan", async () => {
  const service = new ProjectionService({
    factsLoader: loader({ runContract: contract({ planVersion: "retired-plan" }) }),
    planRegistry: { get: (version) => version === "test-plan-1" ? plan : null },
  });
  await assert.rejects(() => service.get("run-1"), (error) => error.name === "UnknownPlanVersionError");
});

test("review templates encode the saved book id while literal and empty routes retain their contract", async () => {
  const runContract = contract({novelId: 'book/中文?x=1'});
  for (const [registered, expected] of [
    ['/lab/director/:novelId?review=character_cast', `/lab/director/${encodeURIComponent(runContract.novelId)}?review=character_cast`],
    ['/registered/review', '/registered/review'],
    ['', `/lab/director/${encodeURIComponent(runContract.novelId)}`],
  ]) {
    const service = new ProjectionService({factsLoader: loader({runContract,
      control: runningControl({status: 'waiting_gate', gate: {gateId: 'cast', artifactTypes: ['character_cast']}})}),
      planRegistry: {get: () => plan}, artifactTypes: {character_cast: {label: '角色阵容', reviewRoute: registered}}});
    const view = await service.get('run-1');
    assert.equal(view.availableActions.find(action => action.id === 'review:character_cast').target, expected);
  }
});
