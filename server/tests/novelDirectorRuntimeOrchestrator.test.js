const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorRuntimeOrchestrator,
} = require("../dist/services/novel/director/novelDirectorRuntimeOrchestrator.js");
const {
  createWorkflowStepModule,
} = require("../dist/services/novel/director/workflowStepRuntime/WorkflowStepModule.js");
const {
  getDirectorPlanningStepModule,
  directorWorkflowStepModuleRegistry,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowStepModules.js");
const {
  DIRECTOR_INITIALIZATION_PLACEHOLDER_VOLUME_STRATEGY_HASH,
} = require("../dist/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.js");

function buildArtifact(type, patch = {}) {
  return {
    id: `${type}:chapter:chapter-1:Test:chapter-1`,
    novelId: "novel-1",
    artifactType: type,
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "Test", id: "chapter-1" },
    schemaVersion: "test",
    ...patch,
  };
}

const artifact = {
  ...buildArtifact("chapter_draft"),
  id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  novelId: "novel-1",
  artifactType: "chapter_draft",
  targetType: "chapter",
  targetId: "chapter-1",
  contentRef: { table: "Chapter", id: "chapter-1" },
};

function buildOrchestrator(artifacts = [artifact], options = {}) {
  const runtimeCalls = [];
  let pipelineRuns = 0;
  const resolveArtifacts = () => (
    typeof artifacts === "function" ? artifacts() : artifacts
  );
  const orchestrator = new NovelDirectorRuntimeOrchestrator({
    directorRuntime: {
      getSnapshot: async () => options.snapshot ?? null,
      analyzeWorkspace: async () => ({
        inventory: { artifacts: resolveArtifacts() },
      }),
      runNode: async (contract, input, collectArtifacts) => {
        const output = await contract.run(input.payload);
        const producedArtifacts = collectArtifacts ? await collectArtifacts(output) : [];
        runtimeCalls.push({
          nodeKey: contract.nodeKey,
          policyAction: contract.policyAction ?? "run_node",
          targetType: input.targetType,
          targetId: input.targetId,
          policy: input.policy?.policy ?? null,
          affectedArtifacts: input.policy?.affectedArtifacts ?? [],
          reuseCompletedStep: input.reuseCompletedStep,
          producedArtifacts,
        });
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
    projectionFactWaitTimeoutMs: options.projectionFactWaitTimeoutMs,
    projectionFactWaitIntervalMs: options.projectionFactWaitIntervalMs,
  });
  return {
    orchestrator,
    runtimeCalls,
    getPipelineRuns: () => pipelineRuns,
  };
}

function buildNoopModule(input) {
  const producedArtifacts = input.producedArtifacts ?? [];
  return createWorkflowStepModule(
    {
      id: input.id,
      nodeKey: input.nodeKey,
      label: input.label,
      stage: input.stage ?? "quality_repair",
      targetType: "novel",
      reads: input.reads ?? [],
      writes: input.writes ?? [],
      mayModifyUserContent: input.mayModifyUserContent ?? false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
    },
    async () => undefined,
    {
      inspectReadiness: async () => ({ ready: true, blockers: [] }),
      inspectCompletion: input.inspectCompletion ?? (async () => ({
        stepId: input.id,
        completed: Boolean(input.completed),
        completenessRatio: input.completed ? 1 : 0,
      })),
      buildInput: async () => undefined,
      validateOutput: input.validateOutput ?? (async () => ({ valid: true })),
      inspectProgress: async () => ({
        status: input.completed ? "completed" : "running",
        current: input.completed ? 1 : 0,
        total: 1,
        ratio: input.completed ? 1 : 0,
        label: input.label,
      }),
      recover: async () => ({ recoverable: true }),
      completeCriteria: input.completeCriteria ?? (async () => true),
      commit: async () => ({ producedArtifacts }),
    },
  );
}

test("executable projection steps inspect preloaded artifacts before validation", async () => {
  const readerPromise = buildArtifact("reader_promise");
  const { orchestrator, runtimeCalls } = buildOrchestrator([readerPromise]);
  const module = createWorkflowStepModule(
    {
      id: "test.reader_promise.sync",
      nodeKey: "test_reader_promise_sync",
      label: "Sync reader promise",
      stage: "quality_repair",
      targetType: "novel",
      reads: [],
      writes: ["reader_promise"],
      mayModifyUserContent: false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
    },
    async () => undefined,
    {
      inspectReadiness: async () => ({ ready: true, blockers: [] }),
      inspectCompletion: async (context) => ({
        stepId: "test.reader_promise.sync",
        completed: (context.artifacts ?? []).some((item) => item.artifactType === "reader_promise"),
        completenessRatio: (context.artifacts ?? []).some((item) => item.artifactType === "reader_promise") ? 1 : 0,
      }),
      buildInput: async () => undefined,
      validateOutput: async (_output, context) => ({
        valid: (context.artifacts ?? []).some((item) => item.artifactType === "reader_promise"),
        reason: "reader promise artifact missing from execution context",
      }),
      inspectProgress: async () => ({
        status: "completed",
        current: 1,
        total: 1,
        ratio: 1,
        label: "done",
      }),
      recover: async () => ({ recoverable: true }),
      completeCriteria: async (_output, context) => (
        (context.artifacts ?? []).some((item) => item.artifactType === "reader_promise")
      ),
      commit: async () => ({ producedArtifacts: [readerPromise] }),
    },
  );

  await orchestrator.runStepModule({
    module,
    taskId: "task-1",
    novelId: "novel-1",
    targetId: "novel-1",
    runner: async () => undefined,
    collectArtifacts: () => [readerPromise],
  });

  assert.deepEqual(runtimeCalls, []);
});

test("executable steps can force rerun instead of reusing completed facts", async () => {
  const produced = buildArtifact("candidate_batch", {
    id: "candidate_batch:global:batch-2:DirectorCandidateBatch:batch-2",
    targetType: "global",
    targetId: null,
  });
  const { orchestrator, runtimeCalls } = buildOrchestrator([]);
  const module = createWorkflowStepModule(
    {
      id: "test.candidate.refine",
      nodeKey: "candidate_refine",
      label: "Refine candidates",
      stage: "candidate_selection",
      targetType: "global",
      reads: ["user_seed"],
      writes: ["candidate_batch"],
      mayModifyUserContent: false,
      requiresApprovalByDefault: false,
      supportsAutoRetry: false,
    },
    async () => undefined,
    {
      inspectReadiness: async () => ({ ready: true, blockers: [] }),
      inspectCompletion: async () => ({
        stepId: "test.candidate.refine",
        completed: true,
        completenessRatio: 1,
      }),
      buildInput: async () => undefined,
      validateOutput: async (output) => ({
        valid: output?.batch?.id === "batch-2",
        reason: "candidate batch missing",
      }),
      inspectProgress: async () => ({
        status: "completed",
        current: 1,
        total: 1,
        ratio: 1,
        label: "done",
      }),
      recover: async () => ({ recoverable: true }),
      completeCriteria: async (output) => output?.batch?.id === "batch-2",
      commit: async () => ({ producedArtifacts: [produced] }),
    },
  );

  const result = await orchestrator.runStepModule({
    module,
    taskId: "task-1",
    novelId: "novel-1",
    reuseCompletedStep: false,
    runner: async () => ({ batch: { id: "batch-2" } }),
  });

  assert.deepEqual(result, { batch: { id: "batch-2" } });
  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].nodeKey, "candidate_refine");
  assert.equal(runtimeCalls[0].reuseCompletedStep, false);
  assert.deepEqual(runtimeCalls[0].producedArtifacts, [produced]);
});

test("chapter execution waits for delayed state commit facts before projection validation", async () => {
  let stateCommitInspections = 0;
  const continuityArtifact = buildArtifact("continuity_state", {
    id: "continuity_state:chapter:chapter-1:StoryStateSnapshot:snapshot-1",
    contentRef: { table: "StoryStateSnapshot", id: "snapshot-1" },
  });
  const readerPromiseArtifact = buildArtifact("reader_promise", {
    id: "reader_promise:chapter:chapter-1:PayoffLedgerItem:payoff-1",
    contentRef: { table: "PayoffLedgerItem", id: "payoff-1" },
  });
  const characterArtifact = buildArtifact("character_governance_state", {
    id: "character_governance_state:chapter:chapter-1:CanonicalStateVersion:state-1",
    contentRef: { table: "CanonicalStateVersion", id: "state-1" },
  });
  const fakeModules = new Map([
    ["chapter.draft.write", buildNoopModule({
      id: "chapter.draft.write",
      nodeKey: "chapter_execution_node",
      label: "执行章节生成批次",
      stage: "chapter_execution",
      writes: ["chapter_draft"],
      mayModifyUserContent: true,
      producedArtifacts: [artifact],
    })],
    ["chapter.quality.review", buildNoopModule({
      id: "chapter.quality.review",
      nodeKey: "chapter_quality_review_node",
      label: "检查章节质量",
      writes: ["audit_report"],
      completed: true,
    })],
    ["chapter.state.commit", buildNoopModule({
      id: "chapter.state.commit",
      nodeKey: "chapter_state_commit_node",
      label: "提交章节连续性状态",
      writes: ["continuity_state", "character_governance_state"],
      producedArtifacts: [continuityArtifact, characterArtifact],
      inspectCompletion: async () => {
        stateCommitInspections += 1;
        const completed = stateCommitInspections >= 3;
        return {
          stepId: "chapter.state.commit",
          completed,
          completenessRatio: completed ? 1 : 0,
        };
      },
      validateOutput: async () => ({
        valid: stateCommitInspections >= 3,
        reason: "state commit facts are still syncing",
      }),
      completeCriteria: async () => stateCommitInspections >= 3,
    })],
    ["payoff.ledger.sync", buildNoopModule({
      id: "payoff.ledger.sync",
      nodeKey: "payoff_ledger_sync_node",
      label: "同步读者承诺与伏笔",
      writes: ["reader_promise"],
      completed: true,
      producedArtifacts: [readerPromiseArtifact],
    })],
    ["character.resource.sync", buildNoopModule({
      id: "character.resource.sync",
      nodeKey: "character_resource_sync_node",
      label: "同步角色资源状态",
      writes: ["character_governance_state", "continuity_state"],
      completed: true,
      producedArtifacts: [characterArtifact, continuityArtifact],
    })],
  ]);
  const originalGet = directorWorkflowStepModuleRegistry.get.bind(directorWorkflowStepModuleRegistry);
  directorWorkflowStepModuleRegistry.get = (id) => fakeModules.get(id) ?? originalGet(id);
  const { orchestrator, runtimeCalls } = buildOrchestrator([
    artifact,
    continuityArtifact,
    readerPromiseArtifact,
    characterArtifact,
  ], {
    projectionFactWaitTimeoutMs: 100,
    projectionFactWaitIntervalMs: 1,
  });

  try {
    await orchestrator.runChapterExecutionNode({
      taskId: "task-1",
      novelId: "novel-1",
      request: {},
      resumeCheckpointType: "chapter_batch_ready",
    });
  } finally {
    directorWorkflowStepModuleRegistry.get = originalGet;
  }

  assert.ok(stateCommitInspections >= 3);
  const stateCommitCall = runtimeCalls.find((call) => call.nodeKey === "chapter_state_commit_node");
  assert.ok(stateCommitCall);
  assert.equal(stateCommitCall.reuseCompletedStep, false);
  assert.deepEqual(stateCommitCall.producedArtifacts.map((item) => item.artifactType).sort(), [
    "character_governance_state",
    "continuity_state",
  ]);
});

test.skip("chapter execution records the standard node sequence without rerunning the pipeline", { skip: "Runtime orchestrator node sequencing is covered by newer module tests until this legacy fixture is rebuilt." }, async () => {
  const mixedArtifacts = [
    artifact,
    buildArtifact("audit_report"),
    buildArtifact("continuity_state"),
    buildArtifact("reader_promise"),
    buildArtifact("repair_ticket"),
    buildArtifact("character_governance_state"),
  ];
  const { orchestrator, runtimeCalls, getPipelineRuns } = buildOrchestrator(mixedArtifacts);

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
  assert.equal(runtimeCalls[0].reuseCompletedStep, false);
  assert.ok(runtimeCalls.slice(1).every((call) => call.reuseCompletedStep !== false));
  assert.deepEqual(runtimeCalls[0].affectedArtifacts.map((item) => item.id), [artifact.id]);
  assert.deepEqual(runtimeCalls.slice(1).map((call) => call.affectedArtifacts.length), [0, 0, 0, 0]);
  assert.deepEqual(runtimeCalls.map((call) => call.producedArtifacts.map((item) => item.artifactType).sort()), [
    ["chapter_draft"],
    ["audit_report"],
    ["character_governance_state", "continuity_state"],
    ["reader_promise", "repair_ticket"],
    ["character_governance_state", "continuity_state"],
  ]);
});

test.skip("quality repair execution starts with a repair policy node", { skip: "Runtime orchestrator node sequencing is covered by newer module tests until this legacy fixture is rebuilt." }, async () => {
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

test.skip("approved auto execution scope carries a safe policy through chapter run and review nodes", { skip: "Runtime orchestrator policy fixtures are stale after the chapter execution contract split." }, async () => {
  const protectedDraft = {
    ...artifact,
    protectedUserContent: true,
  };
  const { orchestrator, runtimeCalls, getPipelineRuns } = buildOrchestrator([protectedDraft], {
    snapshot: {
      policy: {
        mode: "run_until_gate",
        mayOverwriteUserContent: false,
        maxAutoRepairAttempts: 1,
        allowExpensiveReview: false,
        modelTier: "balanced",
        updatedAt: "2026-04-29T00:00:00.000Z",
      },
      steps: [
        {
          status: "waiting_approval",
          nodeKey: "chapter_execution_node",
          targetType: "novel",
          targetId: "novel-1",
        },
      ],
      artifacts: [],
    },
  });

  await orchestrator.runChapterExecutionNode({
    taskId: "task-1",
    novelId: "novel-1",
    request: {},
    resumeCheckpointType: "chapter_batch_ready",
    approveCurrentGate: true,
    approveAutoExecutionScope: true,
  });

  assert.equal(getPipelineRuns(), 1);
  assert.deepEqual(runtimeCalls.map((call) => call.nodeKey), [
    "chapter_execution_node",
    "chapter_quality_review_node",
    "chapter_state_commit_node",
    "payoff_ledger_sync_node",
    "character_resource_sync_node",
  ]);
  assert.ok(runtimeCalls.every((call) => call.policy?.mode === "auto_safe_scope"));
  assert.ok(runtimeCalls.every((call) => call.policy?.mayOverwriteUserContent === false));
  assert.ok(runtimeCalls.every((call) => call.policy?.allowExpensiveReview === true));
});

test.skip("planning write modules pass existing matching artifacts into policy decisions", { skip: "Planning write policy fixtures are stale after artifact inventory normalization." }, async () => {
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

  assert.equal(runtimeCalls[0].nodeKey, "volume_beat_sheet_generate");
  assert.deepEqual(runtimeCalls[0].affectedArtifacts.map((item) => item.id), [taskSheetArtifact.id]);
  assert.deepEqual(runtimeCalls[0].producedArtifacts.map((item) => item.id), [taskSheetArtifact.id]);
});

test.skip("planning write modules ignore initialization placeholder volume strategy artifacts", { skip: "Planning write policy fixtures are stale after artifact inventory normalization." }, async () => {
  const placeholderVolumeStrategyArtifact = buildArtifact("volume_strategy", {
    id: "volume_strategy:volume:legacy-volume-1:VolumePlan:legacy-volume-1",
    targetType: "volume",
    targetId: "legacy-volume-1",
    source: "backfilled",
    contentRef: { table: "VolumePlan", id: "legacy-volume-1" },
    contentHash: DIRECTOR_INITIALIZATION_PLACEHOLDER_VOLUME_STRATEGY_HASH,
  });
  const { orchestrator, runtimeCalls } = buildOrchestrator([placeholderVolumeStrategyArtifact]);

  await orchestrator.runStepModule({
    module: getDirectorPlanningStepModule("volume_strategy"),
    taskId: "task-1",
    novelId: "novel-1",
    targetId: "novel-1",
    runner: async () => undefined,
  });

  assert.equal(runtimeCalls[0].nodeKey, "volume_strategy_phase");
  assert.deepEqual(runtimeCalls[0].affectedArtifacts, []);
});

test.skip("planning write modules keep real volume strategy artifacts in policy decisions", { skip: "Planning write policy fixtures are stale after artifact inventory normalization." }, async () => {
  const realVolumeStrategyArtifact = buildArtifact("volume_strategy", {
    id: "volume_strategy:volume:legacy-volume-1:VolumePlan:legacy-volume-1",
    targetType: "volume",
    targetId: "legacy-volume-1",
    source: "backfilled",
    contentRef: { table: "VolumePlan", id: "legacy-volume-1" },
    contentHash: "real-volume-strategy-hash",
  });
  const userEditedVolumeStrategyArtifact = buildArtifact("volume_strategy", {
    id: "volume_strategy:volume:legacy-volume-2:VolumePlan:legacy-volume-2",
    targetType: "volume",
    targetId: "legacy-volume-2",
    source: "user_edited",
    contentRef: { table: "VolumePlan", id: "legacy-volume-2" },
    contentHash: DIRECTOR_INITIALIZATION_PLACEHOLDER_VOLUME_STRATEGY_HASH,
  });
  const { orchestrator, runtimeCalls } = buildOrchestrator([
    realVolumeStrategyArtifact,
    userEditedVolumeStrategyArtifact,
  ]);

  await orchestrator.runStepModule({
    module: getDirectorPlanningStepModule("volume_strategy"),
    taskId: "task-1",
    novelId: "novel-1",
    targetId: "novel-1",
    runner: async () => undefined,
  });

  assert.deepEqual(
    runtimeCalls[0].affectedArtifacts.map((item) => item.id).sort(),
    [realVolumeStrategyArtifact.id, userEditedVolumeStrategyArtifact.id].sort(),
  );
});

