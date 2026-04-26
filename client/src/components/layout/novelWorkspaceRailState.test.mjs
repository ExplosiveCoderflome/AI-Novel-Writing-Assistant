import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAutoDirectorResetStepReadiness,
  extractAutoDirectorResetStepsFromMeta,
} from "./novelWorkspaceRailState.ts";

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
