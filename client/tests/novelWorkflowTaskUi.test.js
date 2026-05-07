import test from "node:test";
import assert from "node:assert/strict";
import {
  canCancelDirectorTask,
  canContinueChapterBatchAutoExecution,
  canContinueDirector,
} from "../src/lib/novelWorkflowTaskUi.ts";

function buildTask(overrides = {}) {
  return {
    id: "task-1",
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
    ...overrides,
  };
}

test("waiting chapter batch approval waits for the batch execution continuation", () => {
  const task = buildTask();

  assert.equal(canContinueChapterBatchAutoExecution(task), false);
  assert.equal(canContinueDirector(task), false);
});

test("failed chapter batch can still use automatic execution continuation", () => {
  const task = buildTask({ status: "failed" });

  assert.equal(canContinueChapterBatchAutoExecution(task), true);
  assert.equal(canContinueDirector(task), false);
});

test("pending manual recovery tasks can still be cancelled", () => {
  const task = buildTask({
    status: "queued",
    pendingManualRecovery: true,
  });

  assert.equal(canCancelDirectorTask(task), true);
});

test("waiting approval tasks can be cancelled from the editor and task center", () => {
  const task = buildTask({
    status: "waiting_approval",
    pendingManualRecovery: false,
  });

  assert.equal(canCancelDirectorTask(task), true);
});

test("completed tasks are not cancelable", () => {
  const task = buildTask({
    status: "succeeded",
    pendingManualRecovery: false,
  });

  assert.equal(canCancelDirectorTask(task), false);
});
