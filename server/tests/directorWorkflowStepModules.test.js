const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWorkflowStepModule,
  workflowStepModuleToDirectorNodeContract,
} = require("../dist/services/novel/director/workflowStepRuntime/WorkflowStepModule.js");
const {
  buildChapterPipelineWorkflowTemplate,
  buildDirectorPlanningWorkflowPlan,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowPlans.js");
const {
  directorWorkflowStepModuleRegistry,
  getDirectorCandidateStepModule,
  getDirectorExecutionStepModule,
  getDirectorExecutionStepModuleSequence,
  getDirectorPlanningStepModule,
  getDirectorTakeoverStepModule,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowStepModules.js");

test("director workflow step registry exposes unified step modules", () => {
  const ids = directorWorkflowStepModuleRegistry.list().map((module) => module.id);

  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes("book.candidate.generate"));
  assert.ok(ids.includes("story.macro.plan"));
  assert.ok(ids.includes("chapter.draft.write"));
  assert.ok(ids.includes("chapter.quality.review"));
  assert.ok(ids.includes("workflow.takeover.execute"));

  const candidateModule = getDirectorCandidateStepModule("candidate_generation");
  assert.equal(candidateModule.nodeKey, "candidate_generation");
  assert.equal(candidateModule.targetType, "global");

  const outlineModule = getDirectorPlanningStepModule("structured_outline");
  assert.equal(outlineModule.id, "chapter.task_sheet.plan");
  assert.equal(outlineModule.nodeKey, "structured_outline_phase");
  assert.deepEqual(outlineModule.writes, ["chapter_task_sheet"]);

  const takeoverModule = getDirectorTakeoverStepModule();
  assert.equal(takeoverModule.id, "workflow.takeover.execute");
  assert.equal(takeoverModule.nodeKey, "takeover_execution");
});

test("chapter pipeline template converts execution flow into ordered step plan", () => {
  const plan = buildChapterPipelineWorkflowTemplate("chapter_execution");

  assert.equal(plan.id, "pipeline.chapter_execution");
  assert.equal(plan.source, "chapter_pipeline");
  assert.deepEqual(plan.steps.map((step) => step.stepId), [
    "chapter.draft.write",
    "chapter.quality.review",
    "chapter.state.commit",
    "payoff.ledger.sync",
    "character.resource.sync",
  ]);
  assert.deepEqual(plan.steps[0].dependsOn, []);
  assert.deepEqual(plan.steps[1].dependsOn, ["chapter.draft.write"]);
  assert.deepEqual(plan.dependencies[4], {
    stepId: "character.resource.sync",
    dependsOn: ["payoff.ledger.sync"],
  });
});

test("quality repair template starts from repair step and preserves policy action", () => {
  const plan = buildChapterPipelineWorkflowTemplate("quality_repair");
  const repairModule = getDirectorExecutionStepModule("chapter_repair");

  assert.equal(plan.steps[0].stepId, "chapter.draft.repair");
  assert.equal(plan.steps[0].nodeKey, "chapter_repair_node");
  assert.equal(repairModule.policyAction, "repair");
  assert.deepEqual(
    getDirectorExecutionStepModuleSequence("quality_repair").map((module) => module.id),
    [
      "chapter.draft.repair",
      "chapter.quality.review",
      "chapter.state.commit",
      "payoff.ledger.sync",
      "character.resource.sync",
    ],
  );
});

test("planning workflow plan can start from any director planning phase", () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "volume_strategy" });

  assert.equal(plan.source, "auto_director");
  assert.deepEqual(plan.steps.map((step) => step.stepId), [
    "volume.strategy.plan",
    "chapter.task_sheet.plan",
  ]);
  assert.deepEqual(plan.steps[1].dependsOn, ["volume.strategy.plan"]);
});

test("workflow step module can be converted back to DirectorNodeRunner contract", async () => {
  const descriptor = getDirectorExecutionStepModule("chapter_quality_review");
  const module = createWorkflowStepModule(descriptor, async (input) => ({
    reviewed: input.chapterId,
  }));
  const contract = workflowStepModuleToDirectorNodeContract(module, {
    taskId: "task-1",
    novelId: "novel-1",
  });

  assert.equal(contract.nodeKey, "chapter_quality_review_node");
  assert.equal(contract.label, descriptor.label);
  assert.deepEqual(contract.reads, descriptor.reads);
  assert.equal(contract.supportsAutoRetry, true);
  assert.deepEqual(await contract.run({ chapterId: "chapter-1" }), {
    reviewed: "chapter-1",
  });
});
