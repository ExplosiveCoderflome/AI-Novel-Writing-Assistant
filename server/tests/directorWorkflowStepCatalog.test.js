const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKFLOW_CHECKPOINT_CATALOG,
  WORKFLOW_DISPLAY_STAGES,
  WORKFLOW_STEP_CATALOG,
  DIRECTOR_WORKFLOW_STEP_IDS,
  findWorkflowStepCatalogEntryByNodeKey,
  getOrderedWorkflowStepCatalogEntriesByStage,
  getWorkflowStepCatalogEntry,
  getWorkflowStepPrerequisiteIds,
  getWorkflowStepWriteContractRequirements,
  resolveWorkflowApprovalPointForCheckpoint,
  resolveWorkflowDisplayStage,
} = require("../../shared/dist/types/directorWorkflowStepCatalog.js");
const {
  ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  resolveDirectorAutoApprovalPointForCheckpoint,
} = require("../../shared/dist/types/autoDirectorApproval.js");
const {
  buildChapterPipelineWorkflowTemplate,
  buildDirectorPlanningWorkflowPlan,
} = require("../dist/services/novel/director/workflowStepRuntime/directorWorkflowPlans.js");

test("workflow step catalog declares complete unique step metadata", () => {
  const ids = WORKFLOW_STEP_CATALOG.map((entry) => entry.id);
  const nodeKeys = WORKFLOW_STEP_CATALOG.map((entry) => entry.nodeKey);
  const displayStageKeys = new Set(WORKFLOW_DISPLAY_STAGES.map((stage) => stage.key));

  assert.equal(ids.length, new Set(ids).size);
  for (const entry of WORKFLOW_STEP_CATALOG) {
    assert.ok(entry.id);
    assert.ok(entry.stage);
    assert.ok(displayStageKeys.has(entry.displayStage), `${entry.id}: unknown display stage`);
    assert.ok(entry.tab, `${entry.id}: missing tab`);
    assert.ok(entry.nodeKey, `${entry.id}: missing nodeKey`);
    assert.ok(entry.label, `${entry.id}: missing label`);
    assert.ok(Array.isArray(entry.reads), `${entry.id}: reads must be declared`);
    assert.ok(Array.isArray(entry.writes), `${entry.id}: writes must be declared`);
    assert.equal(typeof entry.mayModifyUserContent, "boolean");
    assert.equal(typeof entry.requiresApprovalByDefault, "boolean");
    assert.equal(typeof entry.supportsAutoRetry, "boolean");
    if (entry.orchestrationOrder !== undefined) {
      assert.equal(typeof entry.orchestrationOrder, "number", `${entry.id}: orchestrationOrder must be numeric`);
      assert.ok(entry.orchestrationOrder > 0, `${entry.id}: orchestrationOrder must be positive`);
    }
    if (entry.prerequisiteStepIds !== undefined) {
      assert.ok(Array.isArray(entry.prerequisiteStepIds), `${entry.id}: prerequisiteStepIds must be an array`);
      for (const prerequisiteId of entry.prerequisiteStepIds) {
        assert.ok(ids.includes(prerequisiteId), `${entry.id}: unknown prerequisite ${prerequisiteId}`);
      }
    }
  }

  const nodeKeyOwners = new Map();
  for (const entry of WORKFLOW_STEP_CATALOG) {
    nodeKeyOwners.set(entry.nodeKey, [...(nodeKeyOwners.get(entry.nodeKey) ?? []), entry]);
  }
  for (const [nodeKey, owners] of nodeKeyOwners) {
    if (owners.length <= 1) {
      continue;
    }
    assert.ok(
      owners.every((entry) => entry.aliases?.nodeKeys?.length),
      `${nodeKey}: duplicate nodeKey must declare aliases for compatibility`,
    );
  }
});

function orderedCatalogIdsFor(actualIds) {
  const actualIdSet = new Set(actualIds);
  return WORKFLOW_STEP_CATALOG
    .filter((entry) => actualIdSet.has(entry.id))
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.orchestrationOrder ?? Number.MAX_SAFE_INTEGER)
        - (b.orchestrationOrder ?? Number.MAX_SAFE_INTEGER);
      return orderDiff !== 0 ? orderDiff : actualIds.indexOf(a.id) - actualIds.indexOf(b.id);
    })
    .map((entry) => entry.id);
}

test("workflow catalog orchestration metadata matches director planning plan order", () => {
  const actualIds = buildDirectorPlanningWorkflowPlan({ startPhase: "story_macro" })
    .steps
    .map((step) => step.stepId);

  assert.deepEqual(orderedCatalogIdsFor(actualIds), actualIds);
  assert.deepEqual(
    actualIds,
    [
      DIRECTOR_WORKFLOW_STEP_IDS.planning.story_macro,
      DIRECTOR_WORKFLOW_STEP_IDS.planning.book_contract,
      DIRECTOR_WORKFLOW_STEP_IDS.planning.world_setup,
      DIRECTOR_WORKFLOW_STEP_IDS.planning.character_setup,
      DIRECTOR_WORKFLOW_STEP_IDS.planning.volume_strategy,
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.beat_sheet,
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_list,
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_detail_bundle,
      DIRECTOR_WORKFLOW_STEP_IDS.executionContractSync,
    ],
  );
  assert.deepEqual(
    getOrderedWorkflowStepCatalogEntriesByStage("structured_outline").map((entry) => entry.id),
    [
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.beat_sheet,
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_list,
      DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_detail_bundle,
      DIRECTOR_WORKFLOW_STEP_IDS.executionContractSync,
    ],
  );
});

test("workflow catalog orchestration metadata matches director execution flow orders", () => {
  for (const flow of ["chapter_execution", "quality_repair"]) {
    const actualIds = buildChapterPipelineWorkflowTemplate(flow)
      .steps
      .map((step) => step.stepId);
    assert.deepEqual(orderedCatalogIdsFor(actualIds), actualIds, flow);
  }
});

test("workflow catalog exposes step prerequisites", () => {
  assert.deepEqual(
    getWorkflowStepPrerequisiteIds(DIRECTOR_WORKFLOW_STEP_IDS.planning.book_contract),
    [DIRECTOR_WORKFLOW_STEP_IDS.planning.story_macro],
  );
  assert.deepEqual(
    getWorkflowStepPrerequisiteIds(DIRECTOR_WORKFLOW_STEP_IDS.planning.character_setup),
    [
      DIRECTOR_WORKFLOW_STEP_IDS.planning.book_contract,
      DIRECTOR_WORKFLOW_STEP_IDS.planning.world_setup,
    ],
  );
  const worldSetup = getWorkflowStepCatalogEntry(DIRECTOR_WORKFLOW_STEP_IDS.planning.world_setup);
  assert.deepEqual(
    {
      stage: worldSetup.stage,
      displayStage: worldSetup.displayStage,
      workflowStage: worldSetup.workflowStage,
      tab: worldSetup.tab,
    },
    {
      stage: "world_setup",
      displayStage: "world_setup",
      workflowStage: "world_setup",
      tab: "world",
    },
  );
  assert.deepEqual(
    getWorkflowStepPrerequisiteIds(DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_detail_bundle),
    [DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_list],
  );
  assert.equal(
    getWorkflowStepCatalogEntry(DIRECTOR_WORKFLOW_STEP_IDS.execution.chapter_quality_review).orchestrationOrder,
    1100,
  );
});

test("workflow step catalog resolves legacy node aliases and checkpoints", () => {
  assert.equal(
    findWorkflowStepCatalogEntryByNodeKey("chapter_repair_node")?.displayStage,
    "quality_repair",
  );
  assert.equal(
    findWorkflowStepCatalogEntryByNodeKey("chapter_quality_repair_node")?.id,
    "chapter.quality.repair",
  );
  assert.equal(
    resolveWorkflowDisplayStage({ factStepId: "volume.chapter_detail_bundle.generate" }),
    "structured_outline",
  );
  assert.equal(
    resolveWorkflowDisplayStage({ activeNodeKey: "chapter_sync" }),
    "structured_outline",
  );
  assert.equal(
    resolveWorkflowDisplayStage({ checkpointType: "book_contract_ready" }),
    "story_planning",
  );
  assert.equal(
    resolveWorkflowDisplayStage({ currentStage: "story_macro" }),
    "story_planning",
  );
  assert.equal(
    resolveWorkflowDisplayStage({ taskCurrentItemKey: "world_setup" }),
    "world_setup",
  );
});

test("workflow checkpoint catalog feeds approval point compatibility", () => {
  const approvalCodes = new Set(ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES);

  for (const checkpoint of WORKFLOW_CHECKPOINT_CATALOG) {
    const point = resolveWorkflowApprovalPointForCheckpoint(checkpoint.checkpoint);
    if (point) {
      assert.ok(approvalCodes.has(point), `${checkpoint.checkpoint}: unknown approval point ${point}`);
    }
  }

  assert.equal(resolveWorkflowApprovalPointForCheckpoint("chapter_batch_ready"), "structured_outline_ready");
  assert.equal(resolveDirectorAutoApprovalPointForCheckpoint("chapter_batch_ready"), "structured_outline_ready");
  assert.equal(resolveDirectorAutoApprovalPointForCheckpoint("replan_required"), "replan_continue");
});

test("write contract requirements are derived from write-capable catalog entries", () => {
  const requirements = getWorkflowStepWriteContractRequirements();
  const requirementIds = new Set(requirements.map((item) => item.id));
  const writeCapableIds = WORKFLOW_STEP_CATALOG
    .filter((entry) => entry.writes.length > 0)
    .map((entry) => entry.id);

  assert.deepEqual([...requirementIds].sort(), writeCapableIds.slice().sort());
  assert.ok(requirements.some((item) => (
    item.id === "chapter.draft.repair"
    && item.requiresPolicyAction
    && item.writes.includes("repair_ticket")
  )));
});
