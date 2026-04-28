const test = require("node:test");
const assert = require("node:assert/strict");
const {
  startDirectorTakeoverExecution,
} = require("../dist/services/novel/director/novelDirectorTakeoverExecution.js");

function buildTakeoverState() {
  return {
    novel: {
      id: "novel_takeover_demo",
      title: "Neon Archive",
    },
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 4,
      chapterCount: 10,
      volumeCount: 1,
      firstVolumeId: "volume_1",
      firstVolumeChapterCount: 10,
      firstVolumeBeatSheetReady: true,
      firstVolumePreparedChapterCount: 10,
      generatedChapterCount: 5,
      approvedChapterCount: 2,
      pendingRepairChapterCount: 3,
    },
    activePipelineJob: null,
    latestCheckpoint: {
      checkpointType: "front10_ready",
      stage: "chapter_execution",
      volumeId: "volume_1",
      chapterId: "chapter_1",
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 1,
      nextChapterId: "chapter_1",
      totalChapterCount: 10,
    },
    latestAutoExecutionState: {
      enabled: true,
      mode: "front10",
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      firstChapterId: "chapter_1",
      nextChapterId: "chapter_1",
      nextChapterOrder: 1,
    },
  };
}

test("restart_current_step prepares reset before bootstrapping execution", async () => {
  const calls = [];
  const scheduled = [];
  let runFromReadyInput = null;
  const response = await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "chapter",
      strategy: "restart_current_step",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async () => {
        calls.push("bootstrap");
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async () => {
        calls.push("mark_running");
      },
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async (input) => {
        calls.push(["prepare_auto_execution", input.existingState]);
      },
      runFromReady: async (input) => {
        runFromReadyInput = input;
        calls.push("auto_execution");
      },
    },
    buildDirectorSeedPayload: () => ({}),
    scheduleBackgroundRun: (_taskId, runner) => {
      calls.push("schedule");
      scheduled.push(runner);
    },
    runDirectorPipeline: async () => {
      calls.push("phase_pipeline");
    },
    createRewriteSnapshot: async () => ({
      snapshotId: "snapshot_before_rewrite",
      label: "自动导演重写前备份",
      createdAt: "2026-04-25T00:00:00.000Z",
      restoreEntry: "version_history",
    }),
    prepareRestartStep: async ({ plan }) => {
      calls.push(`reset:${plan.effectiveStep}`);
    },
    recordRewriteSnapshotMilestone: async () => {},
  });

  assert.equal(response.strategy, "restart_current_step");
  assert.equal(response.effectiveStage, "chapter_execution");
  assert.deepEqual(calls.slice(0, 2), ["reset:chapter", "bootstrap"]);
  assert.deepEqual(calls[2], ["prepare_auto_execution", null]);
  await Promise.all(scheduled.map((runner) => runner()));
  assert.ok(calls.includes("auto_execution"));
  assert.equal(runFromReadyInput.existingState, null);
});

test("restart_current_step stores rewrite snapshot reference in task seed and milestone", async () => {
  const calls = [];
  let bootstrapInput = null;
  let milestoneInput = null;

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "chapter",
      strategy: "restart_current_step",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async (input) => {
        bootstrapInput = input;
        calls.push("bootstrap");
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async () => {
        calls.push("mark_running");
      },
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {
        calls.push("prepare_auto_execution");
      },
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => ({ ...extra }),
    scheduleBackgroundRun: () => {},
    runDirectorPipeline: async () => {},
    createRewriteSnapshot: async ({ label }) => {
      calls.push(["snapshot", label]);
      return {
        snapshotId: "snapshot_before_rewrite",
        label,
        createdAt: "2026-04-25T00:00:00.000Z",
      };
    },
    prepareRestartStep: async () => {
      calls.push("reset");
    },
    recordRewriteSnapshotMilestone: async (input) => {
      milestoneInput = input;
      calls.push("milestone");
    },
  });

  assert.deepEqual(calls.slice(0, 3), [
    ["snapshot", "自动导演重写前备份"],
    "reset",
    "bootstrap",
  ]);
  assert.equal(bootstrapInput.seedPayload.rewriteSnapshot.snapshotId, "snapshot_before_rewrite");
  assert.equal(bootstrapInput.seedPayload.rewriteSnapshot.label, "自动导演重写前备份");
  assert.equal(bootstrapInput.seedPayload.rewriteSnapshot.restoreEntry, "version_history");
  assert.equal(milestoneInput.taskId, "workflow_takeover_demo");
  assert.match(milestoneInput.summary, /自动导演重写前备份/);
  assert.match(milestoneInput.summary, /snapshot_before_rewrite/);
});

test("restart_current_step stops before reset when rewrite snapshot creation fails", async () => {
  const calls = [];

  await assert.rejects(
    () => startDirectorTakeoverExecution({
      request: {
        novelId: "novel_takeover_demo",
        entryStep: "chapter",
        strategy: "restart_current_step",
      },
      takeoverState: buildTakeoverState(),
      directorInput: {
        candidate: { workingTitle: "Neon Archive" },
        runMode: "auto_to_execution",
        autoExecutionPlan: { mode: "front10" },
      },
      workflowService: {
        bootstrapTask: async () => {
          calls.push("bootstrap");
          return { id: "workflow_takeover_demo" };
        },
        markTaskRunning: async () => {
          calls.push("mark_running");
        },
      },
      autoExecutionRuntime: {
        prepareRequestedAutoExecution: async () => {
          calls.push("prepare_auto_execution");
        },
        runFromReady: async () => {},
      },
      buildDirectorSeedPayload: () => ({}),
      scheduleBackgroundRun: () => {},
      runDirectorPipeline: async () => {},
      createRewriteSnapshot: async () => {
        calls.push("snapshot");
        throw new Error("snapshot storage unavailable");
      },
      prepareRestartStep: async () => {
        calls.push("reset");
      },
    }),
    /无法创建自动导演重写前备份/,
  );

  assert.deepEqual(calls, ["snapshot"]);
});

test("continue_existing does not invoke restart preparation", async () => {
  let restartCalled = false;
  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "chapter",
      strategy: "continue_existing",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async () => ({ id: "workflow_takeover_demo" }),
      markTaskRunning: async () => {},
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {},
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: () => ({}),
    scheduleBackgroundRun: (_taskId, runner) => {
      void runner();
    },
    runDirectorPipeline: async () => {},
    prepareRestartStep: async () => {
      restartCalled = true;
    },
  });

  assert.equal(restartCalled, false);
});

test("continue_existing from structured records downstream reset metadata and restarts structured phase", async () => {
  const calls = [];
  let bootstrapInput = null;
  let cancelInput = null;
  const scheduled = [];
  let runningState = null;

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "structured",
      strategy: "continue_existing",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async (input) => {
        bootstrapInput = input;
        calls.push("bootstrap");
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async (_taskId, input) => {
        runningState = input;
        calls.push("mark_running");
      },
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {
        throw new Error("structured takeover should not enter auto execution before downstream reset");
      },
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => ({ ...extra }),
    scheduleBackgroundRun: (_taskId, runner) => {
      calls.push("schedule");
      scheduled.push(runner);
    },
    runDirectorPipeline: async (_input) => {
      calls.push("phase_pipeline");
    },
    cancelReplacedRuns: async (input) => {
      cancelInput = input;
      calls.push("cancel_replaced_runs");
    },
    prepareRestartStep: async () => {
      calls.push("reset_assets");
    },
  });

  assert.equal(bootstrapInput.seedPayload.takeover.downstreamReset.preserveAssets, true);
  assert.equal(bootstrapInput.seedPayload.takeover.downstreamReset.fromStep, "structured");
  assert.deepEqual(bootstrapInput.seedPayload.takeover.downstreamReset.resetSteps, ["chapter", "pipeline"]);
  assert.equal(bootstrapInput.initialState.stage, "structured_outline");
  assert.equal(bootstrapInput.initialState.itemKey, "beat_sheet");
  assert.equal(bootstrapInput.initialState.volumeId, "volume_1");
  assert.equal(cancelInput.replacementTaskId, "workflow_takeover_demo");
  assert.equal(cancelInput.plan.strategy, "continue_existing");
  assert.equal(cancelInput.plan.effectiveStep, "structured");
  assert.equal(cancelInput.plan.executionMode, "phase");
  assert.equal(runningState.stage, "structured_outline");
  assert.deepEqual(calls.slice(0, 4), [
    "bootstrap",
    "cancel_replaced_runs",
    "mark_running",
    "schedule",
  ]);
  assert.equal(calls.includes("reset_assets"), false);
  await Promise.all(scheduled.map((runner) => runner()));
  assert.ok(calls.includes("phase_pipeline"));
});

test("continue_existing from structured resets downstream runtime state before bootstrap", async () => {
  const calls = [];
  let bootstrapInput = null;

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "structured",
      strategy: "continue_existing",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "book" },
    },
    workflowService: {
      bootstrapTask: async (input) => {
        bootstrapInput = input;
        calls.push("bootstrap");
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async () => {
        calls.push("mark_running");
      },
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {
        throw new Error("structured takeover should not prepare auto execution");
      },
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: () => ({}),
    scheduleBackgroundRun: () => {
      calls.push("schedule");
    },
    runDirectorPipeline: async () => {},
    resetDownstreamState: async ({ plan }) => {
      calls.push(`reset_downstream:${plan.effectiveStep}`);
    },
    cancelReplacedRuns: async () => {
      calls.push("cancel_replaced_runs");
    },
  });

  assert.deepEqual(calls.slice(0, 2), [
    "reset_downstream:structured",
    "bootstrap",
  ]);
  assert.equal(bootstrapInput.seedPayload.autoExecution, undefined);
});

test("continue_existing from chapter keeps current batch auto execution state in seed", async () => {
  let bootstrapInput = null;

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "chapter",
      strategy: "continue_existing",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async (input) => {
        bootstrapInput = input;
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async () => {},
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {},
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => ({ ...extra }),
    scheduleBackgroundRun: () => {},
    runDirectorPipeline: async () => {},
    cancelReplacedRuns: async () => {},
  });

  assert.equal(bootstrapInput.seedPayload.autoExecution?.nextChapterId, "chapter_1");
});

test("restart_current_step records downstream reset metadata for workspace navigation", async () => {
  let bootstrapInput = null;
  const takeoverState = buildTakeoverState();
  takeoverState.snapshot.hasVolumeStrategyPlan = true;

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "structured",
      strategy: "restart_current_step",
    },
    takeoverState,
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
    },
    workflowService: {
      bootstrapTask: async (input) => {
        bootstrapInput = input;
        return { id: "workflow_takeover_demo" };
      },
      markTaskRunning: async () => {},
    },
    autoExecutionRuntime: {
      prepareRequestedAutoExecution: async () => {},
      runFromReady: async () => {},
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => ({ ...extra }),
    scheduleBackgroundRun: () => {},
    runDirectorPipeline: async () => {},
    createRewriteSnapshot: async () => ({
      snapshotId: "snapshot_before_rewrite",
      label: "自动导演重写前备份",
      restoreEntry: "version_history",
    }),
    prepareRestartStep: async () => {},
    recordRewriteSnapshotMilestone: async () => {},
  });

  assert.equal(bootstrapInput.seedPayload.takeover.downstreamReset.preserveAssets, false);
  assert.equal(bootstrapInput.seedPayload.takeover.downstreamReset.fromStep, "structured");
  assert.deepEqual(bootstrapInput.seedPayload.takeover.downstreamReset.resetSteps, ["chapter", "pipeline"]);
});

test("takeover startup failure after bootstrap marks the replacement task failed", async () => {
  const calls = [];

  await assert.rejects(
    () => startDirectorTakeoverExecution({
      request: {
        novelId: "novel_takeover_demo",
        entryStep: "structured",
        strategy: "continue_existing",
      },
      takeoverState: buildTakeoverState(),
      directorInput: {
        candidate: { workingTitle: "Neon Archive" },
        runMode: "auto_to_execution",
        autoExecutionPlan: { mode: "front10" },
      },
      workflowService: {
        bootstrapTask: async (input) => {
          calls.push(["bootstrap", input.initialState.stage, input.initialState.itemKey]);
          return { id: "workflow_takeover_demo" };
        },
        markTaskRunning: async () => {
          calls.push("mark_running");
        },
        markTaskFailed: async (taskId, message) => {
          calls.push(["mark_failed", taskId, message]);
        },
      },
      autoExecutionRuntime: {
        prepareRequestedAutoExecution: async () => {},
        runFromReady: async () => {},
      },
      buildDirectorSeedPayload: (_request, _novelId, extra) => ({ ...extra }),
      scheduleBackgroundRun: () => {
        calls.push("schedule");
      },
      runDirectorPipeline: async () => {},
      cancelReplacedRuns: async () => {
        calls.push("cancel_replaced_runs");
      },
      assertHighMemoryStartAllowed: async () => {
        throw new Error("已有自动导演任务正在处理同一范围");
      },
    }),
    /已有自动导演任务正在处理同一范围/,
  );

  assert.deepEqual(calls, [
    ["bootstrap", "structured_outline", "beat_sheet"],
    "cancel_replaced_runs",
    ["mark_failed", "workflow_takeover_demo", "已有自动导演任务正在处理同一范围"],
  ]);
});
