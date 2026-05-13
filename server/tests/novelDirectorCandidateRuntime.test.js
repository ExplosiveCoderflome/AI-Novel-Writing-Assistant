const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorCandidateRuntime,
} = require("../dist/services/novel/director/novelDirectorCandidateRuntime.js");

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
