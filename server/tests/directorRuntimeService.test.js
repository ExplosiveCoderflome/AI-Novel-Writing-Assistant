const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorRuntimeService,
} = require("../dist/services/novel/director/runtime/DirectorRuntimeService.js");
const {
  buildDirectorPlanningWorkflowPlan,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowPlans.js");

function buildService() {
  const analysisCalls = [];
  const service = new DirectorRuntimeService({
    analyzer: {
      analyze: async (input) => {
        analysisCalls.push(input);
        return {
          novelId: input.novelId,
          inventory: { artifacts: [] },
          interpretation: null,
          manualEditImpact: null,
          recommendation: null,
          confidence: 0,
          evidenceRefs: ["workspace_inventory"],
          generatedAt: "2026-04-28T01:00:00.000Z",
          prompt: null,
        };
      },
    },
  });
  return { service, analysisCalls };
}

test("director runtime service exposes getRuntimeSnapshot as stable snapshot alias", async () => {
  const service = new DirectorRuntimeService({
    store: {
      getSnapshot: async (taskId) => ({ taskId, status: "running" }),
    },
  });

  const snapshot = await service.getRuntimeSnapshot("task-1");

  assert.equal(snapshot.taskId, "task-1");
});

test("director runtime service runs the next workflow step through the low-risk graph", async () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });
  const executedSteps = [];
  const { service, analysisCalls } = buildService();

  const result = await service.runNextStep({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
    runStep: async ({ step }) => {
      executedSteps.push(step.stepId);
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(executedSteps, [plan.steps[0].stepId]);
  assert.equal(analysisCalls.length, 1);
});

test("director runtime service can continue until the next approval gate", async () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });
  const executedSteps = [];
  const { service } = buildService();

  const result = await service.runUntilGate({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
    interruptBeforeStepIds: [plan.steps[2].stepId],
    runStep: async ({ step }) => {
      executedSteps.push(step.stepId);
    },
  });

  assert.equal(result.status, "interrupted");
  assert.deepEqual(executedSteps, [
    plan.steps[0].stepId,
    plan.steps[1].stepId,
  ]);
  assert.equal(result.interrupt.stepId, plan.steps[2].stepId);
  assert.ok(result.checkpoint.completedStepIds.includes(plan.steps[0].stepId));
  assert.ok(result.checkpoint.completedStepIds.includes(plan.steps[1].stepId));
});
