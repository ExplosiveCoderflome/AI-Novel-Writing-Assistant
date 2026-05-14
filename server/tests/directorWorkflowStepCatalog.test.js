const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKFLOW_CHECKPOINT_CATALOG,
  WORKFLOW_DISPLAY_STAGES,
  WORKFLOW_STEP_CATALOG,
  findWorkflowStepCatalogEntryByNodeKey,
  getWorkflowStepWriteContractRequirements,
  resolveWorkflowApprovalPointForCheckpoint,
  resolveWorkflowDisplayStage,
} = require("../../shared/dist/types/directorWorkflowStepCatalog.js");
const {
  ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  resolveDirectorAutoApprovalPointForCheckpoint,
} = require("../../shared/dist/types/autoDirectorApproval.js");

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
