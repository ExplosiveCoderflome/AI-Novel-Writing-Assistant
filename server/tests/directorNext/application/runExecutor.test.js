const test = require("node:test");
const assert = require("node:assert/strict");
const { applyEvent, createPlanOrchestrator } = require("../../../dist/modules/director/domain");
const { RunExecutor, StepRegistry, FactsLoader } = require("../../../dist/modules/director/application");
const { plan, contract, artifact } = require("../fixtures");

function createHarness({ orchestrator = createPlanOrchestrator(), crashOnStepFinished = false, rejectionBudget = 2, resultFactory, contractOverrides = {} } = {}) {
  const runContract = contract({ rejectionBudget, ...contractOverrides });
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
      if (resultFactory) return resultFactory(step);
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
  const factsLoader = new FactsLoader({runRepository, artifactLedger, qualityDebtRepository, eventLog});
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
  return { executor, executed, artifacts, debts, events, getControl: () => control };
}

test("the executor runs every dependency step once and completes the run", async () => {
  const harness = createHarness();
  for (let index = 0; index < 10 && harness.getControl().status === "running"; index += 1) {
    await harness.executor.runOnce("run-1");
  }
  assert.deepEqual(harness.executed, ["story_macro", "character_cast", "volume_strategy", "chapter_list"]);
  assert.equal(harness.getControl().status, "completed");
});

test('multiple local quality debts are recorded while the dependency chain continues', async()=>{
  const harness=createHarness({resultFactory:step=>({artifact:{scope:'book',status:'confirmed',protectedUserContent:false,contentRef:step.id,contentHash:null},debts:[{chapterOrder:1,code:'local_patch',action:'continue'},{chapterOrder:2,code:'warning',action:'continue'}]})});
  await harness.executor.runOnce('run-1');
  assert.equal(harness.debts.length,2);
  assert.equal(harness.getControl().status,'running');
  await harness.executor.runOnce('run-1');
  assert.deepEqual(harness.executed,['story_macro','character_cast']);
});
test('explicit step replan signals are persisted and pause before any following step',async()=>{
  const harness=createHarness({resultFactory:()=>({stopSignal:{kind:'replan',reason:'AI明确要求重规划',action:'stop_for_replan'}})});
  assert.equal((await harness.executor.runOnce('run-1')).kind,'paused');
  assert.equal(harness.getControl().pause.kind,'replan');
  assert.equal(harness.events.filter(row=>row.type==='stop_signal').length,1);
  await harness.executor.runOnce('run-1');
  assert.deepEqual(harness.executed,['story_macro']);
});
test('manual quality pause is accepted only for a quality-first snapshot',async()=>{
  const factory=()=>({stopSignal:{kind:'manual_recovery',reason:'AI要求人工确认',action:'pause_for_manual'}});
  const allowed=createHarness({resultFactory:factory,contractOverrides:{issuePolicy:{mode:'quality_first',version:'v1'}}});
  assert.equal((await allowed.executor.runOnce('run-1')).kind,'paused');
  const denied=createHarness({resultFactory:factory});
  await assert.rejects(()=>denied.executor.runOnce('run-1'),/invalid step stop signal/);
  assert.equal(denied.events.some(row=>row.type==='stop_signal'),false);
});

test('a crash after artifact save retains the stop signal and never runs the following step',async()=>{
  const harness=createHarness({crashOnStepFinished:true,resultFactory:step=>({artifact:{scope:'book',status:'confirmed',protectedUserContent:false,contentRef:step.id,contentHash:null},stopSignal:{kind:'replan',reason:'明确重规划',action:'stop_for_replan'}})});
  await assert.rejects(()=>harness.executor.runOnce('run-1'),/simulated crash/);
  assert.equal((await harness.executor.runOnce('run-1')).kind,'paused');
  assert.deepEqual(harness.executed,['story_macro']);
});

test('safety, integrity and explicit unrecoverable failures stop the next step',async()=>{
  for(const stopSignal of [{kind:'safety',reason:'用量熔断'},{kind:'data_integrity',reason:'数据归属错误'},{kind:'no_usable_content',reason:'生成失败且无可用内容',action:'fail_task'}]) {
    const harness=createHarness({resultFactory:()=>({stopSignal})});
    const result=await harness.executor.runOnce('run-1');
    assert.equal(result.kind,stopSignal.action==='fail_task'?'failed':'paused');
    await harness.executor.runOnce('run-1');assert.deepEqual(harness.executed,['story_macro']);
  }
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
