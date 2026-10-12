import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAutoDirectorResetStepReadiness,
  extractAutoDirectorResetStepsFromMeta,
  resolveAutoDirectorResetStepsForWorkflowProgress,
} from "./novelWorkspaceRailState.ts";
import * as railState from "./novelWorkspaceRailState.ts";

test("auto director downstream reset marks preserved downstream assets as not ready in the rail", () => {
  const resetSteps = extractAutoDirectorResetStepsFromMeta({
    seedPayload: {
      takeover: {
        downstreamReset: {
          preserveAssets: true,
          resetStatus: "not_started",
          fromStep: "structured",
          resetSteps: ["chapter", "pipeline"],
        },
      },
    },
  });
  const readiness = applyAutoDirectorResetStepReadiness({
    basic: true,
    story_macro: true,
    character: true,
    outline: true,
    structured: true,
    chapter: true,
    pipeline: true,
  }, resetSteps);

  assert.deepEqual(Array.from(resetSteps).sort(), ["chapter", "pipeline"]);
  assert.equal(readiness.structured, true);
  assert.equal(readiness.chapter, false);
  assert.equal(readiness.pipeline, false);
});

test("restart takeover metadata overrides old chapter and pipeline asset readiness", () => {
  const resetSteps = extractAutoDirectorResetStepsFromMeta({
    seedPayload: {
      takeover: {
        source: "existing_novel",
        entryStep: "structured",
        strategy: "restart_current_step",
        effectiveStep: "structured",
        downstreamReset: {
          preserveAssets: false,
          resetStatus: "not_started",
          fromStep: "structured",
          resetSteps: ["chapter", "pipeline"],
        },
      },
    },
  });
  const readiness = applyAutoDirectorResetStepReadiness({
    basic: true,
    story_macro: true,
    character: true,
    outline: true,
    structured: true,
    chapter: true,
    pipeline: true,
  }, resetSteps);

  assert.deepEqual(Array.from(resetSteps).sort(), ["chapter", "pipeline"]);
  assert.equal(readiness.structured, true);
  assert.equal(readiness.chapter, false);
  assert.equal(readiness.pipeline, false);
});

test("auto director downstream reset ignores malformed task metadata", () => {
  const resetSteps = extractAutoDirectorResetStepsFromMeta({
    seedPayload: {
      takeover: {
        downstreamReset: {
          preserveAssets: true,
          resetStatus: "completed",
          resetSteps: ["chapter", "pipeline"],
        },
      },
    },
  });
  const readiness = applyAutoDirectorResetStepReadiness({
    basic: true,
    story_macro: true,
    character: true,
    outline: true,
    structured: true,
    chapter: true,
    pipeline: true,
  }, resetSteps);

  assert.equal(resetSteps.size, 0);
  assert.equal(readiness.chapter, true);
  assert.equal(readiness.pipeline, true);
});

test("auto director downstream reset does not mark completed earlier workflow steps as pending", () => {
  const resetSteps = new Set(["character", "outline", "structured", "chapter", "pipeline"]);
  const effectiveResetSteps = resolveAutoDirectorResetStepsForWorkflowProgress(resetSteps, "outline");
  const readiness = applyAutoDirectorResetStepReadiness({
    basic: true,
    story_macro: true,
    character: true,
    outline: true,
    structured: true,
    chapter: true,
    pipeline: true,
  }, effectiveResetSteps);

  assert.deepEqual(
    Array.from(effectiveResetSteps).sort(),
    ["chapter", "outline", "pipeline", "structured"],
  );
  assert.equal(readiness.character, true);
  assert.equal(readiness.outline, false);
  assert.equal(readiness.structured, false);
});

test("rail keeps the current failed or paused book projection visible without a URL task pin", () => {
  for (const status of ["failed", "blocked", "waiting_recovery"]) {
    assert.equal(railState.shouldShowBookAutomationProjectionWithoutActiveTask({ status, latestTaskId: "current" }), true, status);
  }
  assert.equal(railState.shouldShowBookAutomationProjectionWithoutActiveTask({ status: "failed", latestTaskId: null }), false);
  assert.equal(railState.shouldShowBookAutomationProjectionWithoutActiveTask({ status: "completed", latestTaskId: "current" }), false);
  assert.equal(railState.shouldShowBookAutomationProjectionWithoutActiveTask({ status: "cancelled", latestTaskId: "current" }), false);
});
