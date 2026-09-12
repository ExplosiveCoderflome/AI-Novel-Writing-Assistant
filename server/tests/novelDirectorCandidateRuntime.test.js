const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorCandidateRuntime,
} = require("../dist/services/novel/director/runtime/novelDirectorCandidateRuntime.js");

test("candidate runtime forces explicit candidate commands past completed-step reuse", async () => {
  let capturedStepInput = null;
  const usageCalls = [];
  const runtime = new NovelDirectorCandidateRuntime({
    workflowService: {
      markTaskFailed: async () => undefined,
    },
    candidateStageService: {},
    directorRuntime: {
      initializeRun: async () => undefined,
    },
    runtimeOrchestrator: {
      runStepModule: async (input) => {
        capturedStepInput = input;
        return input.runner();
      },
    },
    scheduleBackgroundRun: () => undefined,
    withWorkflowTaskUsage: async (workflowTaskId, runner) => {
      usageCalls.push(workflowTaskId);
      return runner();
    },
  });

  const result = await runtime.runWithFailureHandling(
    "task-1",
    async () => ({ batch: { id: "batch-2" } }),
    "candidate_refine",
  );

  assert.deepEqual(result, { batch: { id: "batch-2" } });
  assert.equal(capturedStepInput.module.nodeKey, "candidate_refine");
  assert.equal(capturedStepInput.reuseCompletedStep, false);
  assert.deepEqual(usageCalls, ["task-1"]);
});

test("candidate runtime resumes a candidate-generation retry after the command marks an approval gate", async () => {
  const resumed = [];
  const runtime = new NovelDirectorCandidateRuntime({
    workflowService: {
      markTaskFailed: async () => undefined,
    },
    candidateStageService: {
      generateCandidates: async (input) => {
        resumed.push(input);
        return { batch: { id: "batch-retried" } };
      },
    },
    directorRuntime: {
      initializeRun: async () => undefined,
    },
    runtimeOrchestrator: {},
    scheduleBackgroundRun: (_taskId, runner) => {
      void runner();
    },
    withWorkflowTaskUsage: async (_workflowTaskId, runner) => runner(),
  });

  const handled = await runtime.continueTask("task-candidate-retry", {
    novelId: null,
    status: "running",
    checkpointType: null,
    currentItemKey: "approve_gate",
    seedPayload: {
      idea: "A young heir uses battlefield simulations to survive a family conspiracy.",
      marketBriefId: "market-brief-1",
      provider: "custom_kkrich",
      model: "gpt-5.6-terra",
      temperature: 0.7,
      candidateStage: { mode: "generate" },
      directorSession: { phase: "candidate_selection" },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(handled, true);
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].workflowTaskId, "task-candidate-retry");
  assert.equal(resumed[0].marketBriefId, "market-brief-1");
  assert.equal(resumed[0].provider, "custom_kkrich");
  assert.equal(resumed[0].model, "gpt-5.6-terra");
});
