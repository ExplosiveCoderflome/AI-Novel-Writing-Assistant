const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts } = require("./fixtures");

function step(overrides) {
  return {
    id: "a",
    label: "A",
    requires: [],
    produces: "type_a",
    needs: [],
    gateable: false,
    overwrites: [],
    ...overrides,
  };
}

test("definePlan rejects duplicate step ids", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x" }), step({ id: "a", produces: "y" })],
      }),
    (error) => error.name === "PlanValidationError" && /duplicate step id: a/.test(error.message),
  );
});

test("definePlan rejects two steps producing the same artifact type", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x" }), step({ id: "b", produces: "x" })],
      }),
    (error) => error.name === "PlanValidationError" && /produced by both/.test(error.message),
  );
});

test("definePlan rejects unknown required and overwritten artifact types", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x", requires: ["missing"] })],
      }),
    /requires unknown artifact type missing/,
  );
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x", overwrites: ["missing"] })],
      }),
    /overwrites unknown artifact type missing/,
  );
});

test("definePlan rejects dependency cycles", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [
          step({ id: "a", produces: "x", requires: ["y"] }),
          step({ id: "b", produces: "y", requires: ["x"] }),
        ],
      }),
    (error) => error.name === "PlanValidationError" && /cycle/.test(error.message),
  );
});

test("definePlan returns a frozen plan", () => {
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps), true);
  assert.equal(Object.isFrozen(plan.steps[0]), true);
});

test("readySteps only offers steps whose requirements are satisfied", () => {
  const seedOnly = facts([artifact("novel_seed")]);
  assert.deepEqual(
    domain.readySteps(plan, seedOnly, { scope: "book", requireConfirmed: false }).map((s) => s.id),
    ["story_macro"],
  );

  const afterMacro = facts([artifact("novel_seed"), artifact("story_macro")]);
  assert.deepEqual(
    domain.readySteps(plan, afterMacro, { scope: "book", requireConfirmed: false }).map((s) => s.id),
    ["character_cast"],
  );

  const afterCast = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
  ]);
  assert.deepEqual(
    domain.readySteps(plan, afterCast, { scope: "book", requireConfirmed: false }).map((s) => s.id),
    ["volume_strategy"],
  );
});

test("a stale artifact makes its step runnable again and its stale downstream steps wait", () => {
  const withStaleCast = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast", { status: "stale" }),
    artifact("volume_strategy", { status: "stale" }),
    artifact("chapter_list", { status: "stale" }),
  ]);
  assert.deepEqual(
    domain.readySteps(plan, withStaleCast, { scope: "book", requireConfirmed: false }).map((s) => s.id),
    ["character_cast"],
  );
});

test("downstreamArtifactTypes returns the transitive downstream types in plan order", () => {
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "story_macro"), [
    "character_cast",
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "character_cast"), [
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "chapter_list"), []);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "novel_seed"), [
    "story_macro",
    "character_cast",
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "chapter_draft"), []);
});

test("the latest artifact version decides whether a type is satisfied", () => {
  const replaced = facts([
    artifact("novel_seed"),
    artifact("story_macro", { version: 1, status: "stale" }),
    artifact("story_macro", { version: 2, status: "draft" }),
  ]);
  assert.equal(domain.isArtifactSatisfied(replaced, "story_macro", "book", false), true);

  const superseded = facts([
    artifact("novel_seed"),
    artifact("story_macro", { version: 1, status: "draft" }),
    artifact("story_macro", { version: 2, status: "stale" }),
  ]);
  assert.equal(domain.isArtifactSatisfied(superseded, "story_macro", "book", false), false);

  const crossScope = facts([
    artifact("novel_seed"),
    artifact("story_macro", { scope: "volume:2", version: 99 }),
  ]);
  assert.equal(domain.isArtifactSatisfied(crossScope, "story_macro", "book", false), false);
});

test("requireConfirmed only accepts confirmed or user_edited artifacts as dependencies", () => {
  const draftMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "draft" })]);
  assert.deepEqual(
    domain.readySteps(plan, draftMacro, { scope: "book", requireConfirmed: true }).map((s) => s.id),
    [],
  );

  for (const status of ["confirmed", "user_edited"]) {
    const unlocked = facts([artifact("novel_seed"), artifact("story_macro", { status })]);
    assert.deepEqual(
      domain.readySteps(plan, unlocked, { scope: "book", requireConfirmed: true }).map((s) => s.id),
      ["character_cast"],
    );
  }
});

test("stepIdsInScope limits both ready and remaining steps", () => {
  const seedOnly = facts([artifact("novel_seed")]);
  assert.deepEqual(
    domain.readySteps(plan, seedOnly, { scope: "book", requireConfirmed: false, stepIdsInScope: ["character_cast"] }).map((s) => s.id),
    [],
  );
  assert.deepEqual(
    domain.remainingSteps(plan, seedOnly, "book", ["story_macro", "character_cast"]).map((s) => s.id),
    ["story_macro", "character_cast"],
  );
  assert.deepEqual(
    domain.remainingSteps(plan, seedOnly, "book", null).map((s) => s.id),
    ["story_macro", "character_cast", "volume_strategy", "chapter_list"],
  );
});

