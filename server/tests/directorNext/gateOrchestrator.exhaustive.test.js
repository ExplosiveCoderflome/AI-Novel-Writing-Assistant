const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, artifact, contract, facts, deepFreeze } = require("./fixtures");

/*
 * Locked input domain for createGateOrchestrator().next({plan, contract, facts})
 *
 * Plans:
 * - The real production plan `directorProductionPlan` (director-next-production-v1,
 *   10 steps; gateable: character_setup / volume_strategy / chapter_detail_bundle /
 *   execution_contract_sync / chapter_batch) is the primary locked topology.
 *   Covered sweeps: all 6^5 gateable status combinations (7776), all 4^5
 *   non-gateable status combinations (1024), and a structured scope matrix.
 * - A local mirror plan (`mirror_plan`) with two parallel ready steps locks the
 *   documented "recovery gate is evaluated on ready[0] only" rule.
 *
 * Artifact state per produced type: missing | draft | confirmed | user_edited |
 *   stale | stale + protectedUserContent. `novel_seed` is held at confirmed in the
 *   broad sweeps and varied in explicit tables; artifact scope isolation and
 *   multi-version latest selection are covered by dedicated explicit tables.
 *
 * stopSignal variants: null, replan, manual_recovery, safety, data_integrity,
 *   no_usable_content, safety+stop_for_replan, and any signal carrying fail_task.
 *
 * stepIdsInScope variants: null (full plan), [] (empty scope), single-step scopes,
 *   multi-step scopes, and scopes containing only an unknown id.
 *
 * Quality debts: absent or present (two debt sets); they must never change decisions.
 *
 * Decision priority locked here: stopSignal > draft gate (in-scope gateable draft,
 *   in plan order) > ready step (+ protected stale recovery gate on ready[0]) >
 *   complete > pause(no_runnable_step).
 *
 * Broad sweeps pair an independent specification oracle with the production
 * orchestrator; explicit tables state expectations by hand. Every case asserts the
 * exact action (including gateId with latest version) and input purity.
 */

const { directorProductionPlan: productionPlan } = require("../../dist/modules/director/steps/planDefinition");

const mirrorPlan = domain.definePlan({
  version: "gate-exhaustive-mirror-v1",
  externalArtifacts: ["novel_seed"],
  steps: [
    { id: "alpha", label: "Alpha", requires: ["novel_seed"], produces: "mirror_alpha", needs: [], gateable: true, overwrites: [] },
    { id: "beta", label: "Beta", requires: ["novel_seed"], produces: "mirror_beta", needs: [], gateable: true, overwrites: [] },
    { id: "gamma", label: "Gamma", requires: ["mirror_alpha", "mirror_beta"], produces: "mirror_gamma", needs: [], gateable: false, overwrites: [] },
  ],
});

const gateable = productionPlan.steps.filter((step) => step.gateable);
const nonGateable = productionPlan.steps.filter((step) => !step.gateable);

function scopeIds(stepIdsInScope) {
  return stepIdsInScope ? [...stepIdsInScope] : null;
}

function runPlan(plan, artifacts, options = {}) {
  const runContract = contract({
    planVersion: plan.version,
    stepIdsInScope: scopeIds(options.stepIdsInScope === undefined ? null : options.stepIdsInScope),
    scope: options.scope || "book",
  });
  const snapshot = facts(artifacts, options.factsExtra || {});
  return { plan, contract: runContract, facts: snapshot };
}

function nextFor(input) {
  return domain.createGateOrchestrator().next(input);
}

function statusArtifact(type, status, scope = "book") {
  if (status === "missing") return null;
  if (status === "staleProtected") {
    return artifact(type, { status: "stale", protectedUserContent: true, scope });
  }
  return artifact(type, { status, scope });
}

function artifactsFrom(statusByType, scope = "book") {
  return Object.entries(statusByType)
    .map(([type, status]) => statusArtifact(type, status, scope))
    .filter(Boolean);
}

function artifactStatuses(plan, statusFor) {
  const map = { novel_seed: "confirmed" };
  for (const step of plan.steps) map[step.produces] = statusFor(step);
  return artifactsFrom(map);
}

function mapArtifacts(plan, statusByType) {
  const map = { novel_seed: "confirmed" };
  for (const step of plan.steps) map[step.produces] = statusByType[step.produces] || "missing";
  return artifactsFrom(map);
}

function product(statusArray) {
  const [head, ...tail] = statusArray;
  if (!head) return [[]];
  return product(tail).flatMap((rest) => head.map((value) => [value, ...rest]));
}

function latestIn(factsSnapshot, type, scope) {
  let latest;
  for (const item of factsSnapshot.artifacts) {
    if (item.type === type && item.scope === scope && (!latest || item.version > latest.version)) {
      latest = item;
    }
  }
  return latest;
}

/**
 * Specification oracle written from the documented priority rules. It is only used
 * by the combinatorial sweeps; explicit tables below state expectations by hand.
 */
function specNext({ plan, contract: runContract, facts: snapshot }) {
  const signal = snapshot.stopSignal;
  if (signal) {
    if (signal.kind === "replan") return { kind: "pause", pause: { kind: "replan", reason: signal.reason } };
    if (signal.kind === "manual_recovery") return { kind: "pause", pause: { kind: "manual_recovery", reason: signal.reason } };
    if (signal.action === "fail_task") return { kind: "fail", reason: signal.reason };
    return { kind: "pause", pause: { kind: "safety", reason: signal.reason } };
  }

  const inScope = (step) => !runContract.stepIdsInScope || runContract.stepIdsInScope.includes(step.id);
  const latest = (type) => latestIn(snapshot, type, runContract.scope);
  const pending = plan.steps
    .filter((step) => step.gateable && inScope(step))
    .filter((step) => latest(step.produces)?.status === "draft");
  if (pending.length) {
    return {
      kind: "open_gate",
      gateId: `gate:${runContract.runId}:${pending.map((step) => `${step.produces}@${latest(step.produces).version}`).join(",")}`,
      artifactTypes: pending.map((step) => step.produces),
    };
  }

  const satisfied = (type, requireConfirmed) => {
    const item = latest(type);
    if (!item || item.status === "stale") return false;
    return requireConfirmed ? item.status === "confirmed" || item.status === "user_edited" : true;
  };
  const scopedSteps = plan.steps.filter(inScope);
  const remaining = scopedSteps.filter((step) => !satisfied(step.produces, false));
  const ready = remaining.filter((step) => step.requires.every((type) => satisfied(type, true)));
  if (ready.length) {
    const first = ready[0];
    const item = latest(first.produces);
    if (first.gateable && item?.status === "stale" && item.protectedUserContent) {
      return { kind: "open_gate", gateId: `recovery:${runContract.runId}:${first.produces}`, artifactTypes: [first.produces] };
    }
    return { kind: "run_step", stepId: first.id };
  }
  if (remaining.length === 0) return { kind: "complete" };
  return { kind: "pause", pause: { kind: "manual_recovery", reason: "no_runnable_step" } };
}

function assertPure(input, run) {
  const frozen = deepFreeze(input);
  const before = JSON.stringify(frozen);
  const first = run(frozen);
  const second = run(frozen);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(frozen), before);
  return first;
}

function assertMatchesSpec(input, label) {
  const actual = assertPure(input, nextFor);
  const expected = specNext(input);
  assert.deepEqual(actual, expected, label);
}

// ---------------------------------------------------------------------------
// Combinatorial sweeps
// ---------------------------------------------------------------------------

test("production gateable status matrix: exact decisions across draft/confirmed/stale states", () => {
  const statuses = ["missing", "draft", "confirmed", "user_edited", "stale", "staleProtected"];
  const combinations = product(gateable.map(() => statuses));
  let checked = 0;
  for (const combo of combinations) {
    const statusByType = {};
    gateable.forEach((step, index) => { statusByType[step.produces] = combo[index]; });
    for (const step of nonGateable) statusByType[step.produces] = "confirmed";
    const input = runPlan(productionPlan, mapArtifacts(productionPlan, statusByType));
    assertMatchesSpec(input, `gateable combo ${JSON.stringify(statusByType)}`);
    checked += 1;
  }
  assert.equal(checked, statuses.length ** gateable.length);
  assert.equal(checked, 7776);
});

test("production non-gateable status matrix: run/pause/complete boundaries", () => {
  const statuses = ["missing", "draft", "confirmed", "stale"];
  const combinations = product(nonGateable.map(() => statuses));
  let checked = 0;
  for (const combo of combinations) {
    const statusByType = {};
    nonGateable.forEach((step, index) => { statusByType[step.produces] = combo[index]; });
    for (const step of gateable) statusByType[step.produces] = "missing";
    const input = runPlan(productionPlan, mapArtifacts(productionPlan, statusByType));
    assertMatchesSpec(input, `non-gateable combo ${JSON.stringify(statusByType)}`);
    checked += 1;
  }
  assert.equal(checked, statuses.length ** nonGateable.length);
  assert.equal(checked, 1024);
});

test("scope matrix: null/empty/single/multi/unknown scopes keep decisions exact", () => {
  const statuses = ["missing", "draft", "confirmed", "staleProtected"];
  let checked = 0;
  productionPlan.steps.forEach((target, index) => {
    const other = productionPlan.steps[(index + 1) % productionPlan.steps.length].id;
    const scopes = [null, [], [target.id], [target.id, other], [other], ["__unknown__"]];
    for (const status of statuses) {
      const statusByType = {};
      for (const step of productionPlan.steps) statusByType[step.produces] = "confirmed";
      statusByType[target.produces] = status;
      const artifacts = mapArtifacts(productionPlan, statusByType);
      for (const stepIdsInScope of scopes) {
        const input = runPlan(productionPlan, artifacts, { stepIdsInScope });
        assertMatchesSpec(input, `scope ${JSON.stringify(stepIdsInScope)} target ${target.id}=${status}`);
        checked += 1;
      }
    }
  });
  assert.equal(checked, productionPlan.steps.length * statuses.length * 6);
  assert.equal(checked, 240);
});

test("stop signals dominate every artifact and scope state", () => {
  const scenarios = [
    { label: "empty", artifacts: [] },
    { label: "draft gate", artifacts: artifactsFrom({ story_macro: "draft" }) },
    { label: "all confirmed", artifacts: artifactStatuses(productionPlan, () => "confirmed") },
    { label: "protected stale", artifacts: artifactsFrom({
      story_macro: "confirmed", book_contract: "confirmed", world_skeleton: "confirmed", character_cast: "staleProtected",
    }) },
  ];
  const signals = [
    null,
    { kind: "replan", reason: "plan-invalid" },
    { kind: "replan", reason: "plan-invalid", action: "fail_task" },
    { kind: "manual_recovery", reason: "user-requested" },
    { kind: "manual_recovery", reason: "user-requested", action: "fail_task" },
    { kind: "safety", reason: "budget" },
    { kind: "safety", reason: "budget", action: "stop_for_replan" },
    { kind: "safety", reason: "budget", action: "fail_task" },
    { kind: "data_integrity", reason: "bad-facts" },
    { kind: "no_usable_content", reason: "empty-chapter", action: "fail_task" },
  ];
  const scopes = [null, [], ["character_setup"], ["chapter_detail_bundle", "execution_contract_sync"]];
  let checked = 0;
  for (const scenario of scenarios) {
    for (const stopSignal of signals) {
      for (const stepIdsInScope of scopes) {
        const input = runPlan(productionPlan, scenario.artifacts, { stepIdsInScope, factsExtra: { stopSignal } });
        assertMatchesSpec(input, `signal ${JSON.stringify(stopSignal)} / ${scenario.label} / ${JSON.stringify(stepIdsInScope)}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, scenarios.length * signals.length * scopes.length);
  assert.equal(checked, 160);
});

// ---------------------------------------------------------------------------
// Explicit tables: stop signal mapping
// ---------------------------------------------------------------------------

test("stop signal mapping is exact and independent of available work", () => {
  const table = [
    { signal: { kind: "replan", reason: "plan-invalid" }, expected: { kind: "pause", pause: { kind: "replan", reason: "plan-invalid" } } },
    { signal: { kind: "replan", reason: "plan-invalid", action: "fail_task" }, expected: { kind: "pause", pause: { kind: "replan", reason: "plan-invalid" } } },
    { signal: { kind: "manual_recovery", reason: "user-requested" }, expected: { kind: "pause", pause: { kind: "manual_recovery", reason: "user-requested" } } },
    { signal: { kind: "manual_recovery", reason: "user-requested", action: "fail_task" }, expected: { kind: "pause", pause: { kind: "manual_recovery", reason: "user-requested" } } },
    { signal: { kind: "safety", reason: "budget" }, expected: { kind: "pause", pause: { kind: "safety", reason: "budget" } } },
    { signal: { kind: "safety", reason: "budget", action: "stop_for_replan" }, expected: { kind: "pause", pause: { kind: "safety", reason: "budget" } } },
    { signal: { kind: "safety", reason: "budget", action: "fail_task" }, expected: { kind: "fail", reason: "budget" } },
    { signal: { kind: "data_integrity", reason: "bad-facts" }, expected: { kind: "pause", pause: { kind: "safety", reason: "bad-facts" } } },
    { signal: { kind: "no_usable_content", reason: "empty-chapter" }, expected: { kind: "pause", pause: { kind: "safety", reason: "empty-chapter" } } },
    { signal: { kind: "no_usable_content", reason: "empty-chapter", action: "fail_task" }, expected: { kind: "fail", reason: "empty-chapter" } },
  ];
  const artifactStates = [
    [],
    artifactsFrom({ novel_seed: "confirmed", story_macro: "draft" }),
    artifactStatuses(productionPlan, () => "confirmed"),
  ];
  for (const { signal, expected } of table) {
    for (const artifacts of artifactStates) {
      const input = runPlan(productionPlan, artifacts, { factsExtra: { stopSignal: signal } });
      assert.deepEqual(nextFor(input), expected, JSON.stringify(signal));
    }
  }
});

// ---------------------------------------------------------------------------
// Explicit tables: gate selection, versions, recovery
// ---------------------------------------------------------------------------

test("draft gates list every in-scope gateable draft in production plan order", () => {
  const statusByType = {
    novel_seed: "confirmed",
    story_macro: "draft",
    character_cast: "draft",
    chapter_task_sheet: "draft",
    chapter_execution_contract: "draft",
    chapter_batch_closed: "draft",
  };
  const input = runPlan(productionPlan, mapArtifacts(productionPlan, statusByType));
  assert.deepEqual(nextFor(input), {
    kind: "open_gate",
    gateId: "gate:run-1:character_cast@1,chapter_task_sheet@1,chapter_execution_contract@1,chapter_batch_closed@1",
    artifactTypes: ["character_cast", "chapter_task_sheet", "chapter_execution_contract", "chapter_batch_closed"],
  });
});

test("draft gates use the latest artifact version and skip confirmed/non-gateable types", () => {
  const base = {
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
  };
  const supersededDraft = [
    artifact("character_cast", { version: 1, status: "confirmed" }),
    artifact("character_cast", { version: 2, status: "draft" }),
    ...artifactsFrom(base),
  ];
  assert.deepEqual(nextFor(runPlan(productionPlan, supersededDraft)), {
    kind: "open_gate",
    gateId: "gate:run-1:character_cast@2",
    artifactTypes: ["character_cast"],
  });

  const latestConfirmed = [
    artifact("character_cast", { version: 1, status: "draft" }),
    artifact("character_cast", { version: 2, status: "confirmed" }),
    ...artifactsFrom(base),
  ];
  assert.deepEqual(nextFor(runPlan(productionPlan, latestConfirmed)), { kind: "run_step", stepId: "volume_strategy" });

  const nonGateableDraft = artifactsFrom({ ...base, story_macro: "draft" });
  assert.deepEqual(nextFor(runPlan(productionPlan, nonGateableDraft)), {
    kind: "pause",
    pause: { kind: "manual_recovery", reason: "no_runnable_step" },
  });
});

test("other scopes never satisfy or gate the contracted scope", () => {
  const completedElsewhere = [
    artifact("novel_seed", { status: "confirmed" }),
    artifact("story_macro", { status: "confirmed", scope: "volume:2" }),
    artifact("book_contract", { status: "confirmed", scope: "volume:2" }),
    artifact("world_skeleton", { status: "confirmed", scope: "volume:2" }),
    artifact("character_cast", { status: "draft", scope: "volume:2" }),
  ];
  assert.deepEqual(nextFor(runPlan(productionPlan, completedElsewhere)), { kind: "run_step", stepId: "story_macro" });

  const draftOnlyHere = [
    artifact("novel_seed", { status: "confirmed" }),
    artifact("story_macro", { status: "confirmed" }),
    artifact("book_contract", { status: "confirmed" }),
    artifact("world_skeleton", { status: "confirmed" }),
    artifact("character_cast", { status: "draft", scope: "volume:2" }),
    artifact("character_cast", { status: "confirmed" }),
  ];
  assert.deepEqual(nextFor(runPlan(productionPlan, draftOnlyHere)), { kind: "run_step", stepId: "volume_strategy" });
});

test("draft + protectedUserContent opens the ordinary draft gate, not recovery", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "draft",
  });
  const input = runPlan(productionPlan, artifacts);
  const protectedDraft = { ...input, facts: facts(input.facts.artifacts.map((item) => (
    item.type === "character_cast" ? { ...item, protectedUserContent: true } : item
  ))) };
  assert.deepEqual(nextFor(protectedDraft), {
    kind: "open_gate",
    gateId: "gate:run-1:character_cast@1",
    artifactTypes: ["character_cast"],
  });
});

test("ready gateable stale protected content opens a recovery gate", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "staleProtected",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts)), {
    kind: "open_gate",
    gateId: "recovery:run-1:character_cast",
    artifactTypes: ["character_cast"],
  });

  const laterArtifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "confirmed",
    volume_strategy: "confirmed",
    volume_beat_sheet: "confirmed",
    volume_chapter_list: "confirmed",
    chapter_task_sheet: "staleProtected",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, laterArtifacts)), {
    kind: "open_gate",
    gateId: "recovery:run-1:chapter_task_sheet",
    artifactTypes: ["chapter_task_sheet"],
  });
});

test("stale without protected content reruns the step instead of opening a recovery gate", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "stale",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts)), { kind: "run_step", stepId: "character_setup" });
});

test("out-of-scope drafts and protected stale artifacts never open a gate", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "missing",
    character_cast: "draft",
  });
  assert.deepEqual(
    nextFor(runPlan(productionPlan, artifacts, { stepIdsInScope: ["story_macro"] })),
    { kind: "run_step", stepId: "story_macro" },
  );

  const protectedStale = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "staleProtected",
  });
  assert.deepEqual(
    nextFor(runPlan(productionPlan, protectedStale, { stepIdsInScope: ["story_macro"] })),
    { kind: "complete" },
  );
});

test("empty and fully satisfied scopes complete without consulting out-of-scope debt", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "draft",
    character_cast: "draft",
    chapter_task_sheet: "staleProtected",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts, { stepIdsInScope: [] })), { kind: "complete" });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts, { stepIdsInScope: ["__unknown__"] })), { kind: "complete" });

  const everything = artifactStatuses(productionPlan, () => "confirmed");
  assert.deepEqual(nextFor(runPlan(productionPlan, everything)), { kind: "complete" });
});

test("completion depends on produced artifacts, not on external seed state", () => {
  const everything = artifactStatuses(productionPlan, () => "confirmed")
    .filter((item) => item.type !== "novel_seed");
  assert.deepEqual(nextFor(runPlan(productionPlan, everything)), { kind: "complete" });
});

test("user_edited dependencies are accepted as confirmed prerequisites", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "user_edited",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts)), { kind: "run_step", stepId: "character_setup" });
});

test("a protected stale artifact that is not yet runnable stays pending behind its prerequisites", () => {
  const artifacts = artifactsFrom({
    novel_seed: "confirmed",
    story_macro: "confirmed",
    book_contract: "confirmed",
    world_skeleton: "confirmed",
    character_cast: "confirmed",
    volume_strategy: "confirmed",
    volume_beat_sheet: "confirmed",
    volume_chapter_list: "missing",
    chapter_task_sheet: "staleProtected",
  });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts)), { kind: "run_step", stepId: "volume_chapter_list" });
});

test("missing prerequisites without any runnable step pause on manual_recovery/no_runnable_step", () => {
  const artifacts = artifactsFrom({ novel_seed: "draft" });
  assert.deepEqual(nextFor(runPlan(productionPlan, artifacts)), {
    kind: "pause",
    pause: { kind: "manual_recovery", reason: "no_runnable_step" },
  });
});

// ---------------------------------------------------------------------------
// Mirror plan: recovery gate is evaluated on ready[0] only
// ---------------------------------------------------------------------------

test("mirror plan: only the first ready step can open a recovery gate", () => {
  const firstProtected = artifactsFrom({ novel_seed: "confirmed", mirror_alpha: "staleProtected" });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, firstProtected)), {
    kind: "open_gate",
    gateId: "recovery:run-1:mirror_alpha",
    artifactTypes: ["mirror_alpha"],
  });

  const secondProtected = artifactsFrom({ novel_seed: "confirmed", mirror_beta: "staleProtected" });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, secondProtected)), { kind: "run_step", stepId: "alpha" });
});

test("mirror plan: real draft gate takes precedence over a ready sibling", () => {
  const alphaDraft = artifactsFrom({ novel_seed: "confirmed", mirror_alpha: "draft" });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, alphaDraft)), {
    kind: "open_gate",
    gateId: "gate:run-1:mirror_alpha@1",
    artifactTypes: ["mirror_alpha"],
  });

  const betaDraft = artifactsFrom({ novel_seed: "confirmed", mirror_alpha: "confirmed", mirror_beta: "draft" });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, betaDraft)), {
    kind: "open_gate",
    gateId: "gate:run-1:mirror_beta@1",
    artifactTypes: ["mirror_beta"],
  });
});

test("mirror plan: complete, non-gateable stale rerun and out-of-scope draft stay exact", () => {
  const allConfirmed = artifactsFrom({
    novel_seed: "confirmed", mirror_alpha: "confirmed", mirror_beta: "confirmed", mirror_gamma: "confirmed",
  });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, allConfirmed)), { kind: "complete" });

  const gammaProtected = artifactsFrom({
    novel_seed: "confirmed", mirror_alpha: "confirmed", mirror_beta: "confirmed", mirror_gamma: "staleProtected",
  });
  assert.deepEqual(nextFor(runPlan(mirrorPlan, gammaProtected)), { kind: "run_step", stepId: "gamma" });

  const outOfScopeDraft = artifactsFrom({ novel_seed: "confirmed", mirror_beta: "draft" });
  assert.deepEqual(
    nextFor(runPlan(mirrorPlan, outOfScopeDraft, { stepIdsInScope: ["alpha"] })),
    { kind: "run_step", stepId: "alpha" },
  );
});

// ---------------------------------------------------------------------------
// Debts never change decisions
// ---------------------------------------------------------------------------

test("quality debts never change gate, run, complete or pause decisions", () => {
  const scenarios = [
    { label: "empty", artifacts: [] },
    { label: "draft", artifacts: artifactsFrom({ novel_seed: "confirmed", story_macro: "draft" }) },
    { label: "protected stale", artifacts: artifactsFrom({
      novel_seed: "confirmed", story_macro: "confirmed", book_contract: "confirmed",
      world_skeleton: "confirmed", character_cast: "staleProtected",
    }) },
    { label: "complete", artifacts: artifactStatuses(productionPlan, () => "confirmed") },
    { label: "scoped complete", artifacts: artifactsFrom({ novel_seed: "confirmed", story_macro: "draft" }), stepIdsInScope: [] },
    { label: "scoped pause", artifacts: artifactsFrom({ novel_seed: "confirmed", story_macro: "draft" }), stepIdsInScope: ["character_cast"] },
  ];
  const debtSets = [
    [],
    [{ chapterOrder: 1, code: "local_patch" }],
    [{ chapterOrder: 1, code: "local_patch" }, { chapterOrder: 7, code: "draft_obligation_unmet" }],
  ];
  for (const scenario of scenarios) {
    const results = debtSets.map((debts) => nextFor(runPlan(productionPlan, scenario.artifacts, {
      stepIdsInScope: scenario.stepIdsInScope,
      factsExtra: { debts },
    })));
    assert.deepEqual(results[1], results[0], scenario.label);
    assert.deepEqual(results[2], results[0], scenario.label);
  }
});

// ---------------------------------------------------------------------------
// Purity / determinism
// ---------------------------------------------------------------------------

test("every representative input stays frozen and deterministic across repeated calls", () => {
  const inputs = [
    runPlan(productionPlan, []),
    runPlan(productionPlan, artifactsFrom({ novel_seed: "confirmed", character_cast: "draft", chapter_task_sheet: "draft" })),
    runPlan(productionPlan, artifactsFrom({ novel_seed: "confirmed", story_macro: "confirmed", book_contract: "confirmed", world_skeleton: "confirmed", character_cast: "staleProtected" })),
    runPlan(productionPlan, artifactStatuses(productionPlan, () => "confirmed")),
    runPlan(productionPlan, artifactsFrom({ novel_seed: "confirmed", story_macro: "draft" }), { stepIdsInScope: [] }),
    runPlan(mirrorPlan, artifactsFrom({ novel_seed: "confirmed", mirror_alpha: "staleProtected" })),
  ];
  for (const input of inputs) {
    assertPure(input, nextFor);
  }
});
