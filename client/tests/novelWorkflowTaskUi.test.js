import test from "node:test";
import assert from "node:assert/strict";
import {
  canContinueDirector,
  canContinueFront10AutoExecution,
} from "../src/lib/novelWorkflowTaskUi.ts";

function buildTask(overrides = {}) {
  return {
    id: "task-1",
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
    ...overrides,
  };
}

test("waiting chapter batch approval continues the director without auto-execution skip mode", () => {
  const task = buildTask();

  assert.equal(canContinueFront10AutoExecution(task), false);
  assert.equal(canContinueDirector(task), true);
});

test("front10 approval still starts automatic execution", () => {
  const task = buildTask({ checkpointType: "front10_ready" });

  assert.equal(canContinueFront10AutoExecution(task), true);
  assert.equal(canContinueDirector(task), false);
});

test("failed chapter batch can still use automatic execution continuation", () => {
  const task = buildTask({ status: "failed" });

  assert.equal(canContinueFront10AutoExecution(task), true);
  assert.equal(canContinueDirector(task), false);
});
