import test from "node:test";
import assert from "node:assert/strict";

import { reconcileSelectedTaskIds, resolveFollowUpSelectedTaskId } from "./selectionState.ts";

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

test("follow-up selection falls back to the current novel task without a manual selection", () => {
  assert.equal(resolveFollowUpSelectedTaskId({
    override: null,
    contextKey: "book-1|page-1",
    items: [],
    fallbackTaskId: "current-novel-task",
  }), "current-novel-task");
});

test("follow-up detail leaves a stale override when book or list context changes", () => {
  const override = { taskId: "book-1-task", contextKey: "book-1|page-1" };
  const items = [{ directorTaskId: "book-1-task", taskId: "book-1-task" }];
  assert.equal(resolveFollowUpSelectedTaskId({ override, contextKey: "book-2|page-1", items, fallbackTaskId: "book-2-task" }), "book-2-task");
  assert.equal(resolveFollowUpSelectedTaskId({ override, contextKey: "book-1|page-2", items: [], fallbackTaskId: "page-2-task" }), "page-2-task");
  assert.equal(resolveFollowUpSelectedTaskId({ override, contextKey: "book-1|page-1", items: [], fallbackTaskId: "current" }), "current");
});
