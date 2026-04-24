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
    prepareRestartStep: async ({ plan }) => {
      calls.push(`reset:${plan.effectiveStep}`);
    },
  });

  assert.equal(response.strategy, "restart_current_step");
  assert.equal(response.effectiveStage, "chapter_execution");
  assert.deepEqual(calls.slice(0, 4), ["reset:chapter", "bootstrap", "mark_running", "schedule"]);
  await Promise.all(scheduled.map((runner) => runner()));
  assert.ok(calls.includes("auto_execution"));
  assert.equal(runFromReadyInput.existingState, null);
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

test("restart_current_step at volume strategy pauses after the volume strategy phase in review mode", async () => {
  const scheduled = [];
  const pipelineCalls = [];

  const response = await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "outline",
      strategy: "restart_current_step",
    },
    takeoverState: buildTakeoverState(),
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_ready",
    },
    workflowService: {
      bootstrapTask: async () => ({ id: "workflow_takeover_demo" }),
      markTaskRunning: async () => {},
    },
    autoExecutionRuntime: {
      runFromReady: async () => {
        throw new Error("volume strategy restart should not enter auto execution");
      },
    },
    buildDirectorSeedPayload: () => ({}),
    scheduleBackgroundRun: (_taskId, runner) => {
      scheduled.push(runner);
    },
    runDirectorPipeline: async (input) => {
      pipelineCalls.push(input);
    },
    prepareRestartStep: async () => {},
  });

  assert.equal(response.effectiveStage, "volume_strategy");
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.equal(pipelineCalls.length, 1);
  assert.equal(pipelineCalls[0].startPhase, "volume_strategy");
  assert.equal(pipelineCalls[0].input.runMode, "stage_review");
});

test("startDirectorTakeoverExecution passes the requested range state instead of stale front10 state", async () => {
  const runtimeCalls = [];

  await startDirectorTakeoverExecution({
    request: {
      novelId: "novel_takeover_demo",
      entryStep: "chapter",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 11,
        endOrder: 190,
      },
    },
    takeoverState: {
      ...buildTakeoverState(),
      executableRange: {
        startOrder: 1,
        endOrder: 10,
        totalChapterCount: 10,
        nextChapterId: "chapter_4",
        nextChapterOrder: 4,
      },
      latestAutoExecutionState: {
        enabled: true,
        mode: "front10",
        startOrder: 1,
        endOrder: 10,
        totalChapterCount: 10,
        nextChapterId: "chapter_4",
        nextChapterOrder: 4,
      },
      requestedExecutionRange: {
        startOrder: 11,
        endOrder: 190,
        totalChapterCount: 180,
        nextChapterId: "chapter_11",
        nextChapterOrder: 11,
      },
      requestedAutoExecutionState: {
        enabled: true,
        mode: "chapter_range",
        startOrder: 11,
        endOrder: 190,
        totalChapterCount: 180,
        nextChapterId: "chapter_11",
        nextChapterOrder: 11,
      },
    },
    directorInput: {
      candidate: { workingTitle: "Neon Archive" },
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "chapter_range", startOrder: 11, endOrder: 190 },
    },
    workflowService: {
      bootstrapTask: async () => ({ id: "workflow_takeover_demo" }),
      markTaskRunning: async () => {},
    },
    autoExecutionRuntime: {
      runFromReady: async (input) => {
        runtimeCalls.push(input);
      },
    },
    buildDirectorSeedPayload: () => ({}),
    scheduleBackgroundRun: (_taskId, runner) => {
      void runner();
    },
    runDirectorPipeline: async () => {},
  });

  assert.equal(runtimeCalls[0].existingState.startOrder, 11);
  assert.equal(runtimeCalls[0].existingState.endOrder, 190);
});
