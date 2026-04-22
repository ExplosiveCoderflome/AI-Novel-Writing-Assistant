import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSelectedTaskIds } from "../src/pages/autoDirectorFollowUps/selectionState.ts";

test("reconcileSelectedTaskIds keeps the same empty selection reference", () => {
  const current = [];

  const next = reconcileSelectedTaskIds(current, []);

  assert.equal(next, current);
});

test("reconcileSelectedTaskIds removes task ids that are no longer visible", () => {
  const current = ["task-a", "task-b"];

  const next = reconcileSelectedTaskIds(current, [{ taskId: "task-b" }, { taskId: "task-c" }]);

  assert.deepEqual(next, ["task-b"]);
  assert.notEqual(next, current);
});
