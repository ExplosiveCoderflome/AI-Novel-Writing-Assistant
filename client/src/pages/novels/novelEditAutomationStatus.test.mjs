import test from "node:test";
import assert from "node:assert/strict";

import {
  canArchiveCompletedAutoDirectorTask,
} from "./novelEditAutomationStatus.ts";

function buildTask(overrides = {}) {
  return {
    status: "succeeded",
    checkpointType: "workflow_completed",
    ...overrides,
  };
}

test("completed workflow auto director tasks can be archived from the editor", () => {
  assert.equal(canArchiveCompletedAutoDirectorTask(buildTask()), true);
});

test("non-completed workflow tasks are not archived by the completion action", () => {
  assert.equal(canArchiveCompletedAutoDirectorTask(buildTask({ status: "waiting_approval" })), false);
  assert.equal(canArchiveCompletedAutoDirectorTask(buildTask({ status: "failed" })), false);
  assert.equal(canArchiveCompletedAutoDirectorTask(buildTask({ checkpointType: "chapter_batch_ready" })), false);
});
