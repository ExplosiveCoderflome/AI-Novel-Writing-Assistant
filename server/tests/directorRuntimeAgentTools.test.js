const test = require("node:test");
const assert = require("node:assert/strict");

const { canAgentUseTool, evaluateApprovalRequirement } = require("../dist/agents/approvalPolicy.js");
const { compileIntentToPlan } = require("../dist/agents/planner/compiler.js");

function buildIntent(patch) {
  return {
    goal: "检查自动导演状态",
    intent: "query_director_status",
    confidence: 0.9,
    requiresNovelContext: true,
    interactionMode: "query",
    assistantResponse: "execute",
    shouldAskFollowup: false,
    missingInfo: [],
    chapterSelectors: {},
    ...patch,
  };
}

function buildPlannerInput() {
  return {
    goal: "检查自动导演状态",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  };
}

test("planner can route creative hub director status requests through runtime tools", () => {
  const plan = compileIntentToPlan(buildIntent({ intent: "query_director_status" }), buildPlannerInput());

  assert.deepEqual(plan.actions.map((action) => action.tool), ["get_director_run_status"]);
  assert.equal(plan.actions[0].input.novelId, "novel-1");
  assert.equal(plan.riskLevel, "medium");
  assert.equal(plan.requiresApproval, false);
});

test("planner maps director continuation to approval-bound runtime tools", () => {
  const plan = compileIntentToPlan(buildIntent({
    goal: "继续自动导演到检查点",
    intent: "run_director_until_gate",
    interactionMode: "execute",
  }), buildPlannerInput());

  assert.deepEqual(plan.actions.map((action) => action.tool), ["run_director_until_gate"]);
  assert.equal(plan.riskLevel, "high");
  assert.equal(plan.requiresApproval, true);
});

test("planner passes director policy mode into switch tool", () => {
  const plan = compileIntentToPlan(buildIntent({
    goal: "切换到安全范围自动推进",
    intent: "switch_director_policy",
    directorPolicyMode: "auto_safe_scope",
    mayOverwriteUserContent: true,
    interactionMode: "execute",
  }), buildPlannerInput());

  assert.deepEqual(plan.actions.map((action) => action.tool), ["switch_director_policy"]);
  assert.equal(plan.actions[0].input.mode, "auto_safe_scope");
  assert.equal(plan.actions[0].input.mayOverwriteUserContent, true);
});

test("director runtime tools are available to planner and protected by approval policy", () => {
  assert.equal(canAgentUseTool("Planner", "get_director_run_status"), true);
  assert.equal(canAgentUseTool("Planner", "run_director_next_step"), true);
  assert.equal(canAgentUseTool("Writer", "run_director_next_step"), false);

  const nextStepApproval = evaluateApprovalRequirement("run_director_next_step", {
    taskId: "task-1",
  });
  assert.equal(nextStepApproval.required, true);
  assert.equal(nextStepApproval.targetType, "director_runtime");
  assert.equal(nextStepApproval.targetId, "task-1");

  const safePolicyApproval = evaluateApprovalRequirement("switch_director_policy", {
    taskId: "task-1",
    mode: "auto_safe_scope",
  });
  assert.equal(safePolicyApproval.required, true);
  assert.equal(safePolicyApproval.targetType, "director_policy");

  const suggestOnlyApproval = evaluateApprovalRequirement("switch_director_policy", {
    taskId: "task-1",
    mode: "suggest_only",
  });
  assert.equal(suggestOnlyApproval.required, false);
});
