const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorRuntimeOrchestrator,
} = require("../dist/services/novel/director/novelDirectorRuntimeOrchestrator.js");
const {
  getDirectorPlanningStepModule,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowStepModules.js");

const artifact = {
  id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  novelId: "novel-1",
  artifactType: "chapter_draft",
  targetType: "chapter",
  targetId: "chapter-1",
  version: 1,
  status: "active",
  source: "ai_generated",
  contentRef: { table: "Chapter", id: "chapter-1" },
  schemaVersion: "test",
};

function buildOrchestrator(artifacts = [artifact]) {
  const runtimeCalls = [];
  let pipelineRuns = 0;
  const orchestrator = new NovelDirectorRuntimeOrchestrator({
    directorRuntime: {
      analyzeWorkspace: async () => ({
        inventory: { artifacts },
      }),
      runNode: async (contract, input, collectArtifacts) => {
        runtimeCalls.push({
          nodeKey: contract.nodeKey,
          policyAction: contract.policyAction ?? "run_node",
          targetType: input.targetType,
          targetId: input.targetId,
          affectedArtifacts: input.policy?.affectedArtifacts ?? [],
        });
        const output = await contract.run(input.payload);
        const producedArtifacts = collectArtifacts ? collectArtifacts(output) : [];
        return {
          status: "completed",
          output,
          producedArtifacts,
        };
      },
    },
    workflowService: {
      markTaskRunning: async () => undefined,
      markTaskWaitingApproval: async () => undefined,
    },
    autoExecutionRuntime: {
      runFromReady: async () => {
        pipelineRuns += 1;
      },
    },
  });
  return {
    orchestrator,
    runtimeCalls,
    getPipelineRuns: () => pipelineRuns,
  };
}

test("chapter execution records the standard node sequence without rerunning the pipeline", async () => {
  const { orchestrator, runtimeCalls, getPipelineRuns } = buildOrchestrator();

  await orchestrator.runChapterExecutionNode({
    taskId: "task-1",
    novelId: "novel-1",
    request: {},
    resumeCheckpointType: "chapter_batch_ready",
  });

  assert.equal(getPipelineRuns(), 1);
  assert.deepEqual(runtimeCalls.map((call) => call.nodeKey), [
    "chapter_execution_node",
    "chapter_quality_review_node",
    "chapter_state_commit_node",
    "payoff_ledger_sync_node",
    "character_resource_sync_node",
  ]);
  assert.ok(runtimeCalls.every((call) => call.targetType === "novel"));
  assert.ok(runtimeCalls.every((call) => call.targetId === "novel-1"));
  assert.deepEqual(runtimeCalls[0].affectedArtifacts.map((item) => item.id), [artifact.id]);
  assert.deepEqual(runtimeCalls.slice(1).map((call) => call.affectedArtifacts.length), [0, 0, 0, 0]);
});

test("quality repair execution starts with a repair policy node", async () => {
  const { orchestrator, runtimeCalls, getPipelineRuns } = buildOrchestrator();

  await orchestrator.runChapterExecutionNode({
    taskId: "task-1",
    novelId: "novel-1",
    request: {},
    resumeCheckpointType: "replan_required",
  });

  assert.equal(getPipelineRuns(), 1);
  assert.deepEqual(runtimeCalls.map((call) => call.nodeKey), [
    "chapter_repair_node",
    "chapter_quality_review_node",
    "chapter_state_commit_node",
    "payoff_ledger_sync_node",
    "character_resource_sync_node",
  ]);
  assert.equal(runtimeCalls[0].policyAction, "repair");
  assert.deepEqual(runtimeCalls[0].affectedArtifacts.map((item) => item.id), [artifact.id]);
});

test("planning write modules pass existing matching artifacts into policy decisions", async () => {
  const taskSheetArtifact = {
    id: "chapter_task_sheet:chapter:chapter-1:Chapter:chapter-1",
    novelId: "novel-1",
    artifactType: "chapter_task_sheet",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "Chapter", id: "chapter-1" },
    schemaVersion: "test",
  };
  const { orchestrator, runtimeCalls } = buildOrchestrator([taskSheetArtifact]);

  await orchestrator.runStepModule({
    module: getDirectorPlanningStepModule("structured_outline"),
    taskId: "task-1",
    novelId: "novel-1",
    targetId: "novel-1",
    runner: async () => undefined,
  });

  assert.equal(runtimeCalls[0].nodeKey, "structured_outline_phase");
  assert.deepEqual(runtimeCalls[0].affectedArtifacts.map((item) => item.id), [taskSheetArtifact.id]);
});
