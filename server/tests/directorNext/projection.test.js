const test = require("node:test");
const assert = require("node:assert/strict");
const {
  domain,
  plan,
  artifactTypes,
  artifact,
  facts,
  contract,
  runningControl,
  deepFreeze,
} = require("./fixtures");

function view(overrides = {}) {
  return domain.project({
    contract: contract(),
    control: runningControl(),
    plan,
    facts: facts([artifact("novel_seed")]),
    artifactTypes,
    sourceRoute: "/novels/n1/edit",
    ...overrides,
  });
}

test("project is a pure function of its input", () => {
  const input = deepFreeze({
    contract: contract(),
    control: runningControl({ cursorStepId: "story_macro" }),
    plan,
    facts: facts([artifact("novel_seed")]),
    artifactTypes,
    sourceRoute: "/novels/n1/edit",
  });
  assert.deepEqual(domain.project(input), domain.project(input));
});

test("every run status projects to the same mode name", () => {
  for (const status of domain.RUN_STATUSES) {
    assert.equal(view({ control: runningControl({ status }) }).mode, status);
  }
});

test("running view names the current step and offers only cancel", () => {
  const current = view({ control: runningControl({ cursorStepId: "story_macro" }) });
  assert.equal(current.headline, "正在生成「故事宏观规划」");
  assert.deepEqual(current.availableActions.map((action) => action.id), ["cancel"]);

  assert.equal(view().headline, "正在推进创作");
});

test("both drivers can switch at a saved boundary, but not during a step or manual pause", () => {
  for (const driver of ["auto", "assisted"]) {
    const toDriver = driver === "auto" ? "assisted" : "auto";
    for (const status of ["queued", "running", "waiting_gate"]) {
      const projected = view({contract: contract({driver}), control: runningControl({status, cursorStepId: null})});
      const action = projected.availableActions.find(action => action.command === "handoff");
      assert.ok(action, driver+":"+status);
      assert.equal(action.toDriver, toDriver);
      assert.equal(action.primary, false);
    }
    for (const status of ["paused", "failed", "completed", "cancelled"]) {
      assert.equal(view({contract: contract({driver}), control: runningControl({status})}).availableActions.some(action => action.command === "handoff"), false);
    }
    assert.equal(view({contract: contract({driver}), control: runningControl({cursorStepId: "story_macro"})}).availableActions.some(action => action.command === "handoff"), false);
    assert.equal(view({contract: contract({driver}), facts: facts([], {stopSignal: {kind: "safety", reason: "stop"}})}).availableActions.some(action => action.command === "handoff"), false);
  }
});

test("waiting_gate view navigates to the review page of each gated artifact", () => {
  const gated = view({
    control: runningControl({
      status: "waiting_gate",
      gate: { id: "g1", artifactTypes: ["story_macro", "character_cast"] },
    }),
  });
  assert.equal(gated.headline, "请确认「故事宏观规划、角色阵容」后继续");
  assert.deepEqual(
    gated.availableActions.map((action) => [action.id, action.kind, action.primary, action.target]),
    [
      ["review:story_macro", "navigate", true, "/lab/director/n1?review=story_macro"],
      ["review:character_cast", "navigate", false, "/lab/director/n1?review=character_cast"],
      ["cancel", "command", false, undefined],
      ["handoff", "command", false, undefined],
    ],
  );
});

test("an unregistered artifact type falls back to its type name and the source route", () => {
  const gated = view({
    control: runningControl({ status: "waiting_gate", gate: { id: "g1", artifactTypes: ["mystery"] } }),
  });
  assert.equal(gated.headline, "请确认「mystery」后继续");
  assert.equal(gated.availableActions[0].target, "/novels/n1/edit");
});

test("paused view offers resume as the primary action, worded by pause kind", () => {
  const replan = view({
    control: runningControl({ status: "paused", pause: { kind: "replan", reason: "need replan" } }),
  });
  assert.equal(replan.headline, "需要重新规划后继续");
  assert.equal(replan.detail, "need replan");
  assert.deepEqual(
    replan.availableActions.map((action) => [action.id, action.label, action.primary, action.command]),
    [
      ["resume", "重新规划后继续", true, "resume"],
      ["cancel", "取消本次创作", false, "cancel"],
    ],
  );
  assert.equal(replan.sourceTrace.pauseKind, "replan");

  const manual = view({
    control: runningControl({ status: "paused", pause: { kind: "manual_recovery", reason: "stale" } }),
  });
  assert.equal(manual.availableActions[0].label, "从保存进度继续");

  const safety = view({
    control: runningControl({ status: "paused", pause: { kind: "safety", reason: "risk" } }),
  });
  assert.match(safety.headline, /风险/);
});

test("terminal views", () => {
  assert.deepEqual(view({ control: runningControl({ status: "completed" }) }).availableActions, []);
  const failed = view({ control: runningControl({ status: "failed", failureReason: "boom" }) });
  assert.equal(failed.detail, "boom");
  assert.deepEqual(failed.availableActions.map((action) => action.command), ["open_run"]);
  const cancelled = view({ control: runningControl({ status: "cancelled" }) });
  assert.deepEqual(cancelled.availableActions.map((action) => action.command), ["open_run"]);
});

test('chapter batch projection names the bound chapter and separates chapter completion from planning', () => {
  const current = view({control: runningControl({cursorStepId:'chapter_batch'}),
    contract: contract({chapterRange:{from:1,to:3}}),
    production: {chapterProgress:{from:1,to:3,done:2,total:3,current:{order:3,title:'迁出簿上的第三个人',phase:'reviewing'}},nextLaunchRange:{from:4,to:6}}});
  assert.equal(current.headline,'正在检查第 3 章《迁出簿上的第三个人》');
  assert.equal(current.chapterProgress.done,2);
  assert.match(current.nextActionGuidance,/等待/);
  assert.deepEqual(current.availableActions.map(a=>a.command),['cancel']);
  for (const [phase, text] of [['generating_chapters','写作'],['repairing','完善'],['finalizing','保存']]) {
    assert.match(view({control:runningControl({cursorStepId:'chapter_batch'}),production:{chapterProgress:{...current.chapterProgress,current:{order:3,title:'章名',phase}},nextLaunchRange:null}}).headline,new RegExp('正在'+text+'第 3 章'));
  }
});

test('completed ranges offer explicit authorization for the next range without extending this run', () => {
  const projected=view({control:runningControl({status:'completed'}),contract:contract({chapterRange:{from:1,to:3}}),
    production:{chapterProgress:{from:1,to:3,done:3,total:3,current:null},nextLaunchRange:{from:4,to:6}}});
  assert.equal(projected.headline,'第 1—3 章已完成');
  assert.deepEqual(projected.nextLaunchRange,{from:4,to:6});
  assert.equal(projected.availableActions[0].command,'open_run');
  assert.match(projected.availableActions[0].label,/第 4—6 章/);
  assert.match(projected.nextActionGuidance,/提交/);
  const finished=view({control:runningControl({status:'completed'}),production:{chapterProgress:null,nextLaunchRange:null}});
  assert.deepEqual(finished.availableActions,[]);
  assert.match(finished.nextActionGuidance,/目标章节/);
});

test('missing live chapter never invents a chapter number, and pauses and gates keep their own instructions', () => {
  const production={chapterProgress:{from:1,to:3,done:2,total:3,current:null},nextLaunchRange:{from:4,to:6}};
  assert.match(view({control:runningControl({cursorStepId:'chapter_batch'}),production}).headline,/第 1—3 章/);
  const paused=view({control:runningControl({status:'paused',pause:{kind:'safety',reason:'用量限制'}}),production});
  assert.match(paused.headline,/风险/);
  assert.match(paused.nextActionGuidance,/原因/);
  const gated=view({control:runningControl({status:'waiting_gate',gate:{id:'g',artifactTypes:['story_macro']}}),production});
  assert.match(gated.nextActionGuidance,/确认/);
});

test("progress comes from the artifact ledger and respects the run scope", () => {
  const partial = facts([artifact("novel_seed"), artifact("story_macro"), artifact("character_cast", { status: "stale" })]);
  const full = view({ facts: partial });
  assert.deepEqual(full.progress, { done: 1, total: 4, source: "artifact_ledger" });

  const scoped = view({
    facts: partial,
    contract: contract({ stepIdsInScope: ["story_macro", "character_cast"] }),
  });
  assert.deepEqual(scoped.progress, { done: 1, total: 2, source: "artifact_ledger" });
});

test("quality debt is summarised without changing the mode", () => {
  const indebted = view({
    facts: facts([artifact("novel_seed")], {
      debts: [
        { chapterOrder: 5, code: "a" },
        { chapterOrder: 2, code: "b" },
        { chapterOrder: 5, code: "c" },
      ],
    }),
  });
  assert.deepEqual(indebted.debts, { count: 3, chapterOrders: [2, 5] });
  assert.equal(indebted.mode, "running");
});

test("the view carries a source route without any task id and a source trace", () => {
  const projected = view({ control: runningControl({ version: 7 }) });
  assert.equal(projected.sourceRoute, "/novels/n1/edit");
  assert.doesNotMatch(JSON.stringify(projected), /taskId|directorTaskId|workspaceTaskId/);
  assert.deepEqual(projected.sourceTrace, {
    controlStatus: "running",
    controlVersion: 7,
    pauseKind: null,
    planVersion: "test-plan-1",
  });
  assert.equal(projected.driver, "auto");
  assert.equal(projected.runId, "run-1");
});
