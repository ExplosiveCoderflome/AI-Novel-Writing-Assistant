const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildNovelWorkflowDetailSteps,
} = require("../dist/services/task/novelWorkflowDetailSteps.js");

function mapStatuses(steps) {
  return Object.fromEntries(steps.map((step) => [step.key, step.status]));
}

test("detail steps project chapter-detail work onto structured outline stage", () => {
  const steps = buildNovelWorkflowDetailSteps({
    lane: "auto_director",
    novelId: "novel_demo",
    status: "running",
    currentItemKey: "chapter_detail_bundle",
    checkpointType: null,
    directorSessionPhase: "structured_outline",
    createdAt: new Date("2026-03-31T09:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-31T10:00:00.000Z").toISOString(),
  });
  const statuses = mapStatuses(steps);

  assert.equal(statuses.project_setup, "succeeded");
  assert.equal(statuses.auto_director, "succeeded");
  assert.equal(statuses.story_macro, "succeeded");
  assert.equal(statuses.character_setup, "succeeded");
  assert.equal(statuses.volume_strategy, "succeeded");
  assert.equal(statuses.structured_outline, "running");
  assert.equal(statuses.chapter_execution, "idle");
});

test("candidate selection keeps project setup idle before novel exists", () => {
  const steps = buildNovelWorkflowDetailSteps({
    lane: "auto_director",
    novelId: null,
    status: "waiting_approval",
    currentItemKey: "auto_director",
    checkpointType: "candidate_selection_required",
    directorSessionPhase: "candidate_selection",
    createdAt: new Date("2026-03-31T09:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-31T10:00:00.000Z").toISOString(),
  });
  const statuses = mapStatuses(steps);

  assert.equal(statuses.project_setup, "idle");
  assert.equal(statuses.auto_director, "cancelled");
  assert.equal(statuses.story_macro, "idle");
});

test("candidate setup preparation items stay inside auto director stage before novel exists", () => {
  const steps = buildNovelWorkflowDetailSteps({
    lane: "auto_director",
    novelId: null,
    status: "running",
    currentItemKey: "candidate_title_pack",
    checkpointType: null,
    directorSessionPhase: "candidate_selection",
    createdAt: new Date("2026-03-31T09:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-31T10:00:00.000Z").toISOString(),
  });
  const statuses = mapStatuses(steps);

  assert.equal(statuses.project_setup, "idle");
  assert.equal(statuses.auto_director, "running");
  assert.equal(statuses.story_macro, "idle");
});

test("manual workflow keeps auto director step hidden from progress state", () => {
  const steps = buildNovelWorkflowDetailSteps({
    lane: "manual_create",
    novelId: "novel_demo",
    status: "running",
    currentItemKey: "story_macro",
    checkpointType: null,
    directorSessionPhase: null,
    createdAt: new Date("2026-03-31T09:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-31T10:00:00.000Z").toISOString(),
  });
  const statuses = mapStatuses(steps);

  assert.equal(statuses.project_setup, "succeeded");
  assert.equal(statuses.auto_director, "idle");
  assert.equal(statuses.story_macro, "running");
});
