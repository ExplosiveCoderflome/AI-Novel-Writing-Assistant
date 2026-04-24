const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const modelRouter = require("../dist/llm/modelRouter.js");
const {
  AutoDirectorFollowUpActionExecutor,
} = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");

test("AutoDirectorFollowUpActionExecutor continues front10 auto execution with the expected mode", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const continueCalls = [];

  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "workflow-front10",
    lane: "auto_director",
    status: "waiting_approval",
    checkpointType: "front10_ready",
    pendingManualRecovery: false,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        scopeLabel: "前 10 章",
      },
    }),
  });
  executor.novelDirectorService.continueTask = async (taskId, input) => {
    continueCalls.push({ taskId, input });
  };
  executor.workflowTaskAdapter.detail = async (taskId) => ({
    id: taskId,
    kind: "novel_workflow",
    title: "自动导演任务",
    status: "running",
    progress: 0.9,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: "novel-1",
    ownerLabel: "小说 A",
    sourceRoute: "/novels/novel-1/edit",
    retryCountLabel: "1/3",
    meta: {},
    steps: [],
  });

  const result = await executor.execute({
    taskId: "workflow-front10",
    actionCode: "continue_auto_execution",
    source: "web",
    operatorId: "tester",
    idempotencyKey: "continue-front10-1",
  });

  assert.equal(result.code, "executed");
  assert.deepEqual(continueCalls, [{
    taskId: "workflow-front10",
    input: {
      continuationMode: "auto_execute_front10",
    },
  }]);
});

test("AutoDirectorFollowUpActionExecutor retries with the resolved route model for replan follow-ups", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const originalResolveModel = modelRouter.resolveModel;
  const retryCalls = [];

  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "workflow-replan",
    lane: "auto_director",
    status: "failed",
    checkpointType: "replan_required",
    pendingManualRecovery: false,
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    seedPayloadJson: "{}",
  });
  executor.workflowTaskAdapter.retry = async (input) => {
    retryCalls.push(input);
    return {
      id: input.id,
      kind: "novel_workflow",
      title: "自动导演任务",
      status: "running",
      progress: 0.12,
      attemptCount: 2,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: "novel-1",
      ownerLabel: "小说 A",
      sourceRoute: "/novels/novel-1/edit",
      retryCountLabel: "2/3",
      meta: {},
      steps: [],
    };
  };
  executor.workflowTaskAdapter.detail = async () => null;
  modelRouter.resolveModel = async () => ({
    provider: "openai",
    model: "gpt-test-route",
    temperature: 0.15,
  });

  try {
    const result = await executor.execute({
      taskId: "workflow-replan",
      actionCode: "retry_with_route_model",
      source: "web",
      operatorId: "tester",
      idempotencyKey: "retry-route-1",
    });

    assert.equal(result.code, "executed");
    assert.deepEqual(retryCalls, [{
      id: "workflow-replan",
      llmOverride: {
        provider: "openai",
        model: "gpt-test-route",
        temperature: 0.15,
      },
      resume: true,
    }]);
  } finally {
    modelRouter.resolveModel = originalResolveModel;
  }
});
