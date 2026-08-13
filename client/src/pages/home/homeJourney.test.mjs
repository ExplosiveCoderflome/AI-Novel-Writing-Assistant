import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeJourney } from "./homeJourney.ts";

function task(overrides = {}) {
  return {
    id: "task-1",
    status: "waiting_approval",
    progress: 0.46,
    currentStage: "volume_strategy",
    updatedAt: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

test("home journey groups structured workflow stages into beginner-facing milestones", () => {
  const journey = buildHomeJourney(task());

  assert.equal(journey.progressPercent, 46);
  assert.deepEqual(journey.stages.map((stage) => stage.status), [
    "completed",
    "completed",
    "completed",
    "current",
    "upcoming",
    "upcoming",
  ]);
});

test("completed workflow marks the whole creation journey complete", () => {
  const journey = buildHomeJourney(task({ status: "succeeded", progress: 1, currentStage: "quality_repair" }));

  assert.equal(journey.progressPercent, 100);
  assert.ok(journey.stages.every((stage) => stage.status === "completed"));
});
