const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWorkflowStepModule,
  isExecutableWorkflowStepModule,
  workflowStepModuleToDirectorNodeContract,
} = require("../dist/services/novel/director/workflowStepRuntime/WorkflowStepModule.js");
const { prisma } = require("../dist/db/prisma.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");
const {
  stepModuleRunner,
} = require("../dist/services/novel/director/workflowStepRuntime/StepModuleRunner.js");
const {
  DIRECTOR_EXECUTION_STEP_IDS,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowStepIds.js");
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
  for (const module of [
    candidateModule,
    novelCreateModule,
    takeoverModule,
    outlineModule,
  ]) {
    assert.equal(typeof module.inspectReadiness, "function");
    assert.equal(typeof module.inspectCompletion, "function");
    assert.equal(typeof module.inspectProgress, "function");
    assert.equal(typeof module.recover, "function");
    assert.equal(typeof module.completeCriteria, "function");
  }
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

test("confirmed existing novel project does not require candidate batches", async () => {
  const module = getDirectorConfirmNovelCreateStepModule();
  const context = {
    taskId: "task-existing-project",
    novelId: "novel-existing",
    artifacts: [],
    projectionHints: {
      directorFactBaseSummary: {
        hasNovelProject: true,
        candidate: {
          batchCount: 0,
          candidateCount: 0,
          mode: null,
          checkpointReady: false,
        },
        book: {
          hasStoryMacro: false,
          hasBookContract: false,
          characterCount: 0,
        },
        outline: {
          hasVolumeStrategy: false,
          volumeCount: 0,
          plannedChapterCount: 0,
          beatSheetReady: false,
          chapterListReady: false,
          chapterDetailReady: false,
          selectedChapterCount: 0,
          completedDetailSteps: 0,
          totalDetailSteps: 0,
          syncedChapterCount: 0,
          cursorStep: null,
        },
        chapterExecution: null,
        repair: {
          draftedChapterCount: 0,
          reviewedChapterCount: 0,
          committedChapterCount: 0,
          needsRepairChapterCount: 0,
          hasReviewableDrafts: false,
        },
        artifactSync: {
          payoffArtifactCount: 0,
          characterResourceArtifactCount: 0,
        },
      },
    },
  };

  const readiness = await module.inspectReadiness(context);

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
  assert.deepEqual(readiness.evidence, {
    batchCount: 0,
    hasNovelProject: true,
  });
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

function buildProgressChapter(order, patch = {}) {
  const drafted = patch.drafted ?? false;
  const completedStages = drafted
    ? [
      "execution_contract_ready",
      "context_package_ready",
      "draft_started",
      "draft_saved",
      "audit_completed",
      "repair_completed_or_not_needed",
      "runtime_package_saved",
      "chapter_artifacts_synced",
      "chapter_state_committed",
      "reviewable_or_approved",
    ]
    : [
      "execution_contract_ready",
      "context_package_ready",
    ];
  return {
    chapterId: `chapter-${order}`,
    chapterOrder: order,
    status: drafted ? "completed" : "not_started",
    currentStage: drafted ? "reviewable_or_approved" : "draft_started",
    completedStages,
    missingStages: [],
    evidence: {
      chapterStatus: drafted ? "completed" : "unplanned",
    },
    recoverable: true,
    nextAction: drafted ? "continue_next_chapter" : "write_draft",
    ...patch,
  };
}

function buildChapterProgressSummary(chapters) {
  const draftedChapterCount = chapters.filter((chapter) => chapter.completedStages.includes("draft_saved")).length;
  return {
    totalChapters: chapters.length,
    draftedChapterCount,
    approvedChapterCount: chapters.filter((chapter) => chapter.status === "approved").length,
    completedChapters: chapters.filter((chapter) => (
      chapter.status === "approved" || chapter.status === "completed"
    )).length,
    needsRepairChapters: chapters.filter((chapter) => chapter.status === "needs_repair").length,
    activeChapterId: null,
    activeChapterOrder: null,
    currentChapterId: chapters.find((chapter) => chapter.status === "not_started")?.chapterId ?? null,
    currentChapterOrder: chapters.find((chapter) => chapter.status === "not_started")?.chapterOrder ?? null,
    currentStage: chapters.find((chapter) => chapter.status === "not_started")?.currentStage ?? null,
    recoverableRange: {
      startOrder: chapters[0]?.chapterOrder ?? null,
      endOrder: chapters[chapters.length - 1]?.chapterOrder ?? null,
    },
    ratio: draftedChapterCount / Math.max(1, chapters.length),
    chapters,
  };
}

function buildDirectorStateHint(seedPayload, chapterProgress) {
  return {
    task: {
      id: "task-scoped-chapter-execution",
      novelId: "novel-scoped",
      lane: "auto_director",
      status: "running",
      currentStage: "chapter_execution",
      currentItemKey: "chapter_execution",
      currentItemLabel: "Executing chapters",
      progress: 0.98,
      checkpointType: null,
      checkpointSummary: null,
      lastError: null,
      pendingManualRecovery: false,
      cancelRequestedAt: null,
    },
    run: null,
    runtime: null,
    latestCommand: null,
    activeStep: null,
    seedPayload,
    chapterProgress,
  };
}

function buildChapterRowFromProgressChapter(chapter) {
  const hasDraft = chapter.completedStages.includes("draft_saved");
  const hasAudit = chapter.completedStages.includes("audit_completed");
  const hasStateCommit = chapter.completedStages.includes("chapter_state_committed");
  return {
    id: chapter.chapterId,
    order: chapter.chapterOrder,
    title: `Chapter ${chapter.chapterOrder}`,
    content: hasDraft ? "Draft body" : "",
    taskSheet: "Task sheet",
    sceneCards: null,
    expectation: null,
    generationState: chapter.status === "approved" ? "approved" : "reviewed",
    chapterStatus: chapter.status === "running" ? "generating" : chapter.status === "reviewable" ? "pending_review" : null,
    riskFlags: null,
    repairHistory: null,
    qualityReports: [],
    auditReports: hasAudit ? [{ issues: [] }] : [],
    storyStateSnapshots: hasStateCommit ? [{ id: `state-${chapter.chapterOrder}` }] : [],
    canonicalStateVersions: [],
  };
}

test("chapter draft completion is scoped to the active auto execution range", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  const module = getDirectorExecutionStepModule("chapter_execution");
  const chapters = Array.from({ length: 67 }, (_, index) => {
    const order = index + 1;
    return buildProgressChapter(order, {
      drafted: order >= 11 && order <= 13,
    });
  });
  prisma.chapter.findMany = async () => chapters.map(buildChapterRowFromProgressChapter);
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });
  const context = {
    taskId: "task-scoped-chapter-execution",
    novelId: "novel-scoped",
    projectionHints: {
      directorCanonicalState: buildDirectorStateHint({
        autoExecutionPlan: {
          mode: "chapter_range",
          startOrder: 11,
          endOrder: 13,
          autoReview: true,
          autoRepair: true,
        },
        autoExecution: {
          enabled: true,
          mode: "chapter_range",
          startOrder: 11,
          endOrder: 13,
          totalChapterCount: 3,
          completedChapterCount: 3,
          remainingChapterCount: 0,
          autoReview: true,
          autoRepair: true,
        },
      }, buildChapterProgressSummary(chapters)),
    },
  };

  const completion = await module.inspectCompletion(context);
  const progress = await module.inspectProgress(context);
  const completeCriteria = await module.completeCriteria(undefined, context);

  assert.equal(completion.completed, true);
  assert.equal(completion.evidence.draftedChapterCount, 3);
  assert.equal(completion.evidence.totalChapters, 3);
  assert.equal(progress.status, "completed");
  assert.equal(progress.evidence.draftedChapterCount, 3);
  assert.equal(progress.evidence.totalChapters, 3);
  assert.equal(completeCriteria, true);
});

test("chapter draft validation trusts fresh draft facts over stale failed task status", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-1",
      order: 1,
      title: "Chapter 1",
      content: "Draft body",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "reviewed",
      chapterStatus: "completed",
      riskFlags: null,
      repairHistory: null,
      qualityReports: [],
      auditReports: [],
      storyStateSnapshots: [],
      canonicalStateVersions: [],
    },
  ];
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });

  const module = getDirectorExecutionStepModule("chapter_execution");
  const context = {
    novelId: "novel-fresh-draft",
    projectionHints: {
      directorCanonicalState: {
        ...buildDirectorStateHint({}, buildChapterProgressSummary([
          buildProgressChapter(1, { drafted: false }),
        ])),
        task: {
          ...buildDirectorStateHint({}, null).task,
          id: "task-stale-failed",
          novelId: "novel-fresh-draft",
          status: "failed",
          lastError: "stale failure",
        },
      },
    },
  };

  const validation = await module.validateOutput(undefined, context);

  assert.equal(validation.valid, true);
  assert.equal(validation.evidence.draftedChapterCount, 1);
  assert.equal(validation.evidence.totalChapters, 1);
});

test("chapter quality review closes when auto review is disabled by the execution plan", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  const module = getDirectorExecutionStepModule("chapter_quality_review");
  const chapters = [1, 2].map((order) => ({
    ...buildProgressChapter(order, { drafted: true }),
    status: "approved",
    completedStages: [
      "execution_contract_ready",
      "context_package_ready",
      "draft_started",
      "draft_saved",
      "chapter_artifacts_synced",
      "chapter_state_committed",
      "reviewable_or_approved",
    ],
  }));
  prisma.chapter.findMany = async () => chapters.map(buildChapterRowFromProgressChapter);
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });
  const context = {
    taskId: "task-no-auto-review",
    novelId: "novel-no-auto-review",
    projectionHints: {
      directorCanonicalState: buildDirectorStateHint({
        directorInput: {
          autoExecutionPlan: {
            mode: "chapter_range",
            startOrder: 1,
            endOrder: 2,
            autoReview: false,
            autoRepair: false,
          },
        },
        autoExecution: {
          enabled: true,
          mode: "chapter_range",
          startOrder: 1,
          endOrder: 2,
          totalChapterCount: 2,
          completedChapterCount: 2,
          remainingChapterCount: 0,
          autoReview: false,
          autoRepair: false,
        },
      }, buildChapterProgressSummary(chapters)),
    },
  };

  const completion = await module.inspectCompletion(context);
  const progress = await module.inspectProgress(context);
  const validation = await module.validateOutput(undefined, context);

  assert.equal(completion.completed, true);
  assert.equal(completion.evidence.draftedChapterCount, 2);
  assert.equal(completion.evidence.reviewedChapterCount, 0);
  assert.equal(completion.evidence.reviewSkipped, true);
  assert.equal(progress.status, "completed");
  assert.equal(progress.nextAction, "commit_chapter_state");
  assert.equal(validation.valid, true);
});

test("workflow step fact inspections support novel-only manual context", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [];
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });

  const context = {
    novelId: "novel-manual-context",
    mode: "manual",
  };
  const modules = directorWorkflowStepModuleRegistry
    .list()
    .filter((module) => isExecutableWorkflowStepModule(module));

  for (const module of modules) {
    await assert.doesNotReject(async () => {
      await module.inspectReadiness(context);
      await module.inspectCompletion(context);
      await module.inspectProgress(context);
    }, `${module.id} should inspect with manual novel context`);
  }
});

test("manual chapter draft runs through the workflow step runner", async (t) => {
  const originalMethod = NovelService.prototype.createChapterStream;
  const calls = [];
  NovelService.prototype.createChapterStream = async (novelId, chapterId, options) => {
    calls.push({ novelId, chapterId, model: options.model });
    return {
      stream: (async function* stream() {})(),
      onDone: async () => undefined,
    };
  };
  t.after(() => {
    NovelService.prototype.createChapterStream = originalMethod;
  });

  await stepModuleRunner.runStep(DIRECTOR_EXECUTION_STEP_IDS.chapter_execution, {
    novelId: "novel-manual-step",
    mode: "manual",
    targetType: "chapter",
    targetChapterId: "chapter-manual-step",
    stepInput: {
      model: "model-from-step",
    },
  });

  assert.deepEqual(calls, [{
    novelId: "novel-manual-step",
    chapterId: "chapter-manual-step",
    model: "model-from-step",
  }]);
});

test("manual chapter repair runs through the workflow step runner", async (t) => {
  const originalMethod = NovelService.prototype.createRepairStream;
  const calls = [];
  NovelService.prototype.createRepairStream = async (novelId, chapterId, options) => {
    calls.push({ novelId, chapterId, repairMode: options.repairMode });
    return {
      stream: (async function* stream() {})(),
      onDone: async () => undefined,
    };
  };
  t.after(() => {
    NovelService.prototype.createRepairStream = originalMethod;
  });

  await stepModuleRunner.runStep(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, {
    novelId: "novel-repair-step",
    mode: "manual",
    targetType: "chapter",
    targetChapterId: "chapter-repair-step",
    stepInput: {
      repairMode: "light_repair",
    },
  });

  assert.deepEqual(calls, [{
    novelId: "novel-repair-step",
    chapterId: "chapter-repair-step",
    repairMode: "light_repair",
  }]);
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
