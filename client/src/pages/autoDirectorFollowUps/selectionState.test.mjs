import test from "node:test";
import assert from "node:assert/strict";

import { reconcileSelectedTaskIds } from "./selectionState.ts";

test("directorTaskId remains the canonical follow-up selection identity", () => {
  const current = ["director-1", "legacy-only"];
  const next = reconcileSelectedTaskIds(current, [
    { directorTaskId: "director-1", taskId: "deprecated-task-id" },
    { taskId: "legacy-only" },
  ]);
  assert.deepEqual(next, current);
});

test("selection drops director ids that are no longer visible", () => {
  assert.deepEqual(
    reconcileSelectedTaskIds(["director-1", "director-2"], [{ directorTaskId: "director-2", taskId: "director-2" }]),
    ["director-2"],
  );
});
