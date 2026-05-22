import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDisplayAutoDirectorTask,
  canArchiveCompletedAutoDirectorTask,
  resolveTakeoverModeFromAutomation,
  shouldPreserveRequestedDirectorTaskId,
  shouldAutofocusProjectedDirectorTask,
  shouldShowPinnedBookAutomationProjection,
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

test("replan checkpoints stay action-required even when projection reports waiting approval", () => {
  assert.equal(
    resolveTakeoverModeFromAutomation({
      task: buildTask({
        id: "task-replan",
        status: "waiting_approval",
        checkpointType: "replan_required",
      }),
      projection: {
        latestTask: { id: "task-replan" },
        status: "waiting_approval",
      },
    }),
    "action_required",
  );
});

test("historical failed projections do not auto-focus old director tasks", () => {
  assert.equal(
    shouldAutofocusProjectedDirectorTask({
      latestTask: { id: "task-old" },
      status: "failed",
    }),
    false,
  );
  assert.equal(
    shouldAutofocusProjectedDirectorTask({
      latestTask: { id: "task-old" },
      status: "completed",
    }),
    false,
  );
});

test("live projections still auto-focus the active director task", () => {
  assert.equal(
    shouldAutofocusProjectedDirectorTask({
      latestTask: { id: "task-live" },
      status: "running",
    }),
    true,
  );
  assert.equal(
    shouldAutofocusProjectedDirectorTask({
      latestTask: { id: "task-gate" },
      status: "waiting_approval",
    }),
    true,
  );
});

test("failed tasks are not rewritten into waiting approval by stale projections", () => {
  const task = {
    id: "task-failed",
    status: "failed",
    pendingManualRecovery: false,
    currentItemLabel: "正在自动执行第 2-10 章",
    lastError: "指定区间内没有可生成的章节。",
    failureSummary: "指定区间内没有可生成的章节。",
  };
  const result = buildDisplayAutoDirectorTask(task, {
    latestTask: { id: "task-failed", status: "failed" },
    status: "waiting_approval",
    blockedReason: "该动作会自动推进较大范围的章节生成，需要确认后才能继续。",
    detail: "该动作会自动推进较大范围的章节生成，需要确认后才能继续。",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.lastError, "指定区间内没有可生成的章节。");
});

test("requested failed director task stays pinned after the active task disappears", () => {
  assert.equal(
    shouldPreserveRequestedDirectorTaskId({
      directorTaskId: "task-failed",
      requestedTask: {
        id: "task-failed",
        status: "failed",
      },
    }),
    true,
  );
  assert.equal(
    shouldPreserveRequestedDirectorTaskId({
      directorTaskId: "task-cancelled",
      requestedTask: {
        id: "task-cancelled",
        status: "cancelled",
      },
    }),
    false,
  );
});

test("rail keeps the pinned failed projection visible without an active task", () => {
  assert.equal(
    shouldShowPinnedBookAutomationProjection({
      directorTaskId: "task-failed",
      projection: {
        latestTask: { id: "task-failed" },
        status: "failed",
      },
    }),
    true,
  );
  assert.equal(
    shouldShowPinnedBookAutomationProjection({
      directorTaskId: "task-other",
      projection: {
        latestTask: { id: "task-failed" },
        status: "failed",
      },
    }),
    false,
  );
});
