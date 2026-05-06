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
  getDirectorConfirmNovelCreateStepModule,
  getDirectorExecutionStepModule,
  getDirectorExecutionStepModuleSequence,
  getDirectorPlanningStepModule,
  getDirectorTakeoverStepModule,
  validateDirectorWorkflowStepWriteContracts,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowStepModules.js");

test("director workflow step registry exposes unified step modules", () => {
  const ids = directorWorkflowStepModuleRegistry.list().map((module) => module.id);

  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes("book.candidate.generate"));
  assert.ok(ids.includes("book.project.create"));
  assert.ok(ids.includes("story.macro.plan"));
  assert.ok(ids.includes("book.contract.create"));
  assert.ok(ids.includes("chapter.execution_contract.sync"));
  assert.ok(ids.includes("chapter.draft.write"));
  assert.ok(ids.includes("chapter.quality.review"));
  assert.ok(ids.includes("chapter.draft.repair"));
  assert.ok(ids.includes("chapter.quality.repair"));
  assert.ok(ids.includes("workflow.takeover.execute"));

  const candidateModule = getDirectorCandidateStepModule("candidate_generation");
  assert.equal(candidateModule.nodeKey, "candidate_generation");
  assert.equal(candidateModule.targetType, "global");

  const novelCreateModule = getDirectorConfirmNovelCreateStepModule();
  assert.equal(novelCreateModule.nodeKey, "novel_create");
  assert.deepEqual(novelCreateModule.reads, ["candidate_batch", "book_seed"]);
  assert.deepEqual(novelCreateModule.writes, ["novel_project", "director_runtime"]);

  const outlineModule = getDirectorPlanningStepModule("structured_outline");
  assert.equal(outlineModule.id, "volume.beat_sheet.generate");
  assert.equal(outlineModule.nodeKey, "volume_beat_sheet_generate");
  assert.deepEqual(outlineModule.writes, ["chapter_task_sheet"]);

  const takeoverModule = getDirectorTakeoverStepModule();
  assert.equal(takeoverModule.id, "workflow.takeover.execute");
  assert.equal(takeoverModule.nodeKey, "takeover_execution");
});

test("director workflow write contract covers every write-capable runtime step", () => {
  assert.doesNotThrow(() => validateDirectorWorkflowStepWriteContracts());

  assert.throws(
    () => validateDirectorWorkflowStepWriteContracts([
      {
        ...getDirectorPlanningStepModule("story_macro"),
        writes: [],
      },
    ]),
    /missing write story_macro|missing step module/,
  );
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
  const qualityRepairModule = getDirectorExecutionStepModule("quality_repair");

  assert.equal(plan.steps[0].stepId, "chapter.draft.repair");
  assert.equal(plan.steps[0].nodeKey, "chapter_repair_node");
  assert.equal(repairModule.policyAction, "repair");
  assert.equal(qualityRepairModule.id, "chapter.quality.repair");
  assert.equal(qualityRepairModule.nodeKey, "chapter_repair_node");
  assert.equal(qualityRepairModule.policyAction, "repair");
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
    "volume.beat_sheet.generate",
    "volume.chapter_list.generate",
    "volume.chapter_detail_bundle.generate",
    "chapter.execution_contract.sync",
  ]);
  assert.deepEqual(plan.steps[1].dependsOn, ["volume.strategy.plan"]);
  assert.deepEqual(plan.steps[2].dependsOn, ["volume.beat_sheet.generate"]);
  assert.deepEqual(plan.steps[3].dependsOn, ["volume.chapter_list.generate"]);
  assert.deepEqual(plan.steps[4].dependsOn, ["volume.chapter_detail_bundle.generate"]);
});

test("planning workflow keeps story macro and book contract as separate write nodes", () => {
  const plan = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" });

  assert.deepEqual(plan.steps.map((step) => step.stepId), [
    "story.macro.plan",
    "book.contract.create",
    "character.cast.prepare",
    "volume.strategy.plan",
    "volume.beat_sheet.generate",
    "volume.chapter_list.generate",
    "volume.chapter_detail_bundle.generate",
    "chapter.execution_contract.sync",
  ]);
  assert.deepEqual(plan.steps[1].writes, ["book_contract"]);
  assert.deepEqual(plan.steps[1].dependsOn, ["story.macro.plan"]);
});

test("workflow step module exposes fact inspection, input, progress, recovery and commit hooks", async () => {
  const descriptor = getDirectorPlanningStepModule("book_contract");
  const module = createWorkflowStepModule(descriptor, async (input) => ({
    contract: input.seed,
  }), {
    inspectReadiness: async (context) => ({
      ready: Boolean(context.novelId),
      blockers: [],
      evidence: { novelId: context.novelId },
      resumeFrom: null,
    }),
    inspectCompletion: async (context) => ({
      stepId: descriptor.id,
      completed: Boolean(context.novelId),
      completenessRatio: context.novelId ? 1 : 0,
      evidence: { novelId: context.novelId },
      producedArtifacts: [],
    }),
    buildInput: async (context) => ({
      seed: context.novelId,
    }),
    validateOutput: async (output) => ({
      valid: Boolean(output.contract),
    }),
    commit: async (output) => ({
      producedArtifacts: [],
      summary: output.contract,
    }),
    inspectProgress: async () => ({
      status: "completed",
      current: 1,
      total: 1,
      ratio: 1,
      label: "complete",
      evidence: { artifactType: "book_contract" },
      nextAction: null,
    }),
    recover: async () => ({
      recoverable: true,
      reason: null,
      resumeFrom: "resume_from_artifact",
    }),
    completeCriteria: async () => true,
  });
  const context = { taskId: "task-1", novelId: "novel-1" };

  assert.deepEqual(await module.buildInput(context), { seed: "novel-1" });
  assert.deepEqual(await module.execute({ seed: "novel-1" }, context), { contract: "novel-1" });
  assert.equal((await module.inspectReadiness(context)).ready, true);
  assert.equal((await module.inspectCompletion(context)).completed, true);
  assert.equal((await module.validateOutput({ contract: "novel-1" }, context)).valid, true);
  assert.deepEqual(await module.commit({ contract: "book-contract-1" }, context), {
    producedArtifacts: [],
    summary: "book-contract-1",
  });
  assert.equal((await module.inspectProgress(context)).status, "completed");
  assert.equal((await module.recover(context)).resumeFrom, "resume_from_artifact");
  assert.equal(await module.completeCriteria({ contract: "book-contract-1" }, context), true);
});

test("workflow step module can be converted back to DirectorNodeRunner contract", async () => {
  const descriptor = getDirectorExecutionStepModule("chapter_quality_review");
  const module = createWorkflowStepModule(descriptor, async (input) => ({
    reviewed: input.chapterId,
  }), {
    inspectReadiness: async () => ({ ready: true, blockers: [], resumeFrom: null }),
    inspectCompletion: async () => ({
      stepId: descriptor.id,
      completed: false,
      completenessRatio: 0,
      producedArtifacts: [],
    }),
    buildInput: async (context) => ({ chapterId: context.targetId }),
    inspectProgress: async () => ({
      status: "running",
      current: 0,
      total: 1,
      ratio: 0,
      label: "review",
      nextAction: "run_quality_review",
    }),
    recover: async () => ({
      recoverable: true,
      resumeFrom: "chapter.quality.review",
    }),
  });
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
