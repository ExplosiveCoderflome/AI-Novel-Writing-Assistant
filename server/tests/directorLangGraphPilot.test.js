const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorLangGraphPilot,
} = require("../dist/services/novel/director/langgraphPilot/DirectorLangGraphPilot.js");
const {
  buildDirectorPlanningWorkflowPlan,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowPlans.js");

function buildAnalysis() {
  return {
    novelId: "novel-1",
    taskId: "task-1",
    taskKind: "auto_director",
    healthScore: 82,
    gaps: [],
    nextActions: [],
    artifactInventory: [],
  };
}

function buildPilot() {
  const analysisCalls = [];
  const executedSteps = [];
  const pilot = new DirectorLangGraphPilot({
    directorRuntime: {
      analyzeWorkspace: async (input) => {
        analysisCalls.push(input);
        return buildAnalysis();
      },
    },
    runStep: async ({ step }) => {
      executedSteps.push(step.stepId);
    },
  });
  return { pilot, analysisCalls, executedSteps };
}

test("director LangGraph pilot interrupts and resumes without repeating completed nodes", async () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });
  const firstStep = plan.steps[0];
  const { pilot, analysisCalls, executedSteps } = buildPilot();

  const interrupted = await pilot.run({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
    interruptBeforeStepIds: [firstStep.stepId],
  });

  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.interrupt.stepId, firstStep.stepId);
  assert.deepEqual(executedSteps, []);
  assert.equal(analysisCalls.length, 1);
  assert.ok(interrupted.checkpoint.completedGraphNodes.includes("workspace_analyze"));
  assert.ok(interrupted.checkpoint.completedGraphNodes.includes("recommend_next_action"));

  const resumed = await pilot.run({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
    checkpoint: interrupted.checkpoint,
    interruptBeforeStepIds: [firstStep.stepId],
    resume: {
      interruptId: interrupted.interrupt.id,
      approved: true,
    },
  });

  assert.equal(resumed.status, "completed");
  assert.deepEqual(executedSteps, [firstStep.stepId]);
  assert.deepEqual(resumed.executedStepIds, [firstStep.stepId]);
  assert.equal(analysisCalls.length, 1);
  assert.ok(resumed.trace.some((event) => (
    event.node === "workspace_analyze" && event.status === "skipped"
  )));
  assert.ok(resumed.trace.some((event) => (
    event.node === "recommend_next_action" && event.status === "skipped"
  )));
});

test("director LangGraph pilot skips completed plan steps on the next run", async () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });
  const { pilot, executedSteps } = buildPilot();

  const result = await pilot.run({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
    checkpoint: {
      completedGraphNodes: [],
      completedStepIds: [plan.steps[0].stepId],
      pendingStep: null,
      interrupt: null,
      trace: [],
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(executedSteps, [plan.steps[1].stepId]);
  assert.deepEqual(result.executedStepIds, [plan.steps[1].stepId]);
  assert.ok(result.checkpoint.completedStepIds.includes(plan.steps[0].stepId));
  assert.ok(result.checkpoint.completedStepIds.includes(plan.steps[1].stepId));
});

test("director LangGraph pilot failure does not execute the selected workflow step", async () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });
  const executedSteps = [];
  const pilot = new DirectorLangGraphPilot({
    directorRuntime: {
      analyzeWorkspace: async () => {
        throw new Error("analysis failed");
      },
    },
    runStep: async ({ step }) => {
      executedSteps.push(step.stepId);
    },
  });

  await assert.rejects(() => pilot.run({
    taskId: "task-1",
    novelId: "novel-1",
    plan,
  }), /analysis failed/);
  assert.deepEqual(executedSteps, []);
});
