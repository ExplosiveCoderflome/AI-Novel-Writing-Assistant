import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowMilestoneType,
  NovelWorkflowStage,
} from "./novelWorkflow";
import {
  WORKFLOW_CHECKPOINT_CATALOG,
  WORKFLOW_DISPLAY_STAGES,
  WORKFLOW_STEP_CATALOG,
  type WorkflowCheckpointCatalogEntry,
  type WorkflowStepCatalogApprovalPoint,
  type WorkflowStepCatalogDisplayStage,
  type WorkflowStepCatalogEntry,
} from "./directorWorkflowStepCatalogData.js";

export * from "./directorWorkflowStepCatalogData.js";
const STEP_BY_ID = new Map(WORKFLOW_STEP_CATALOG.map((entry) => [entry.id, entry]));
const STEP_BY_NODE_OR_ALIAS = buildStepAliasMap("nodeKeys");
const STEP_BY_ITEM_OR_ALIAS = buildStepAliasMap("currentItemKeys");
const CHECKPOINT_BY_TYPE = new Map(WORKFLOW_CHECKPOINT_CATALOG.map((entry) => [entry.checkpoint, entry]));
const DISPLAY_STAGE_KEYS = new Set(WORKFLOW_DISPLAY_STAGES.map((stage) => stage.key));
const WORKFLOW_STAGE_TO_DISPLAY_STAGE: Partial<Record<NovelWorkflowStage | string, WorkflowStepCatalogDisplayStage>> = {
  project_setup: "project_setup",
  auto_director: "project_setup",
  story_macro: "story_planning",
  character_setup: "character_setup",
  volume_strategy: "volume_strategy",
  structured_outline: "structured_outline",
  chapter_execution: "chapter_execution",
  quality_repair: "quality_repair",
};

function buildStepAliasMap(aliasKey: "nodeKeys" | "currentItemKeys"): Map<string, WorkflowStepCatalogEntry> {
  const result = new Map<string, WorkflowStepCatalogEntry>();
  for (const entry of WORKFLOW_STEP_CATALOG) {
    result.set(entry.nodeKey, entry);
    result.set(entry.id, entry);
    for (const alias of entry.aliases?.[aliasKey] ?? []) {
      result.set(alias, entry);
    }
  }
  return result;
}

export function findWorkflowStepCatalogEntryById(
  stepId: string | null | undefined,
): WorkflowStepCatalogEntry | null {
  const key = stepId?.trim();
  return key ? STEP_BY_ID.get(key) ?? null : null;
}

export function getWorkflowStepCatalogEntry(stepId: string): WorkflowStepCatalogEntry {
  const entry = findWorkflowStepCatalogEntryById(stepId);
  if (!entry) {
    throw new Error(`Unknown workflow step catalog entry: ${stepId}`);
  }
  return entry;
}

export function getOrderedWorkflowStepCatalogEntriesByStage(
  stage: string,
): WorkflowStepCatalogEntry[] {
  return WORKFLOW_STEP_CATALOG
    .filter((entry) => entry.stage === stage)
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.orchestrationOrder ?? Number.MAX_SAFE_INTEGER)
        - (b.orchestrationOrder ?? Number.MAX_SAFE_INTEGER);
      return orderDiff !== 0 ? orderDiff : a.id.localeCompare(b.id);
    });
}

export function getWorkflowStepPrerequisiteIds(stepId: string): string[] {
  return [...(getWorkflowStepCatalogEntry(stepId).prerequisiteStepIds ?? [])];
}

export function findWorkflowStepCatalogEntryByNodeKey(
  nodeKey: string | null | undefined,
): WorkflowStepCatalogEntry | null {
  const key = nodeKey?.trim();
  return key ? STEP_BY_NODE_OR_ALIAS.get(key) ?? null : null;
}

export function findWorkflowStepCatalogEntryByCurrentItemKey(
  currentItemKey: string | null | undefined,
): WorkflowStepCatalogEntry | null {
  const key = currentItemKey?.trim();
  return key ? STEP_BY_ITEM_OR_ALIAS.get(key) ?? null : null;
}

export function findWorkflowCheckpointCatalogEntry(
  checkpointType: string | null | undefined,
): WorkflowCheckpointCatalogEntry | null {
  const key = checkpointType?.trim() as NovelWorkflowMilestoneType | undefined;
  return key ? CHECKPOINT_BY_TYPE.get(key) ?? null : null;
}

export function isWorkflowDisplayStageKey(value: unknown): value is WorkflowStepCatalogDisplayStage {
  return typeof value === "string" && DISPLAY_STAGE_KEYS.has(value as WorkflowStepCatalogDisplayStage);
}

export function resolveWorkflowDisplayStage(input: {
  factStepId?: string | null;
  currentNodeKey?: string | null;
  activeNodeKey?: string | null;
  taskCurrentItemKey?: string | null;
  checkpointType?: string | null;
  taskStatus?: string | null;
  currentStage?: string | null;
}): WorkflowStepCatalogDisplayStage {
  const factEntry = findWorkflowStepCatalogEntryById(input.factStepId);
  if (factEntry) return factEntry.displayStage;
  const currentNodeEntry = findWorkflowStepCatalogEntryByNodeKey(input.currentNodeKey);
  if (currentNodeEntry) return currentNodeEntry.displayStage;
  const activeNodeEntry = findWorkflowStepCatalogEntryByNodeKey(input.activeNodeKey);
  if (activeNodeEntry) return activeNodeEntry.displayStage;
  const itemEntry = findWorkflowStepCatalogEntryByCurrentItemKey(input.taskCurrentItemKey);
  if (itemEntry) return itemEntry.displayStage;

  if (input.checkpointType === "chapter_batch_ready" && input.taskStatus && input.taskStatus !== "waiting_approval") {
    return "chapter_execution";
  }
  const checkpointEntry = findWorkflowCheckpointCatalogEntry(input.checkpointType);
  if (checkpointEntry) return checkpointEntry.displayStage;

  const currentStage = input.currentStage?.trim();
  if (currentStage && isWorkflowDisplayStageKey(currentStage)) return currentStage;
  return currentStage ? WORKFLOW_STAGE_TO_DISPLAY_STAGE[currentStage] ?? "project_setup" : "project_setup";
}

export function resolveWorkflowStageFromCheckpoint(input: {
  checkpointType: NovelWorkflowCheckpoint | string | null | undefined;
  status?: string | null;
}): NovelWorkflowStage | null {
  if (input.checkpointType === "chapter_batch_ready") {
    return input.status === "waiting_approval" ? "chapter_execution" : "quality_repair";
  }
  return findWorkflowCheckpointCatalogEntry(input.checkpointType)?.workflowStage ?? null;
}

export function resolveWorkflowStageFromItemOrCheckpoint(input: {
  currentItemKey?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | string | null;
  currentStage?: string | null;
  status?: string | null;
}): NovelWorkflowStage | null {
  const itemEntry = findWorkflowStepCatalogEntryByCurrentItemKey(input.currentItemKey);
  if (itemEntry) return itemEntry.workflowStage;
  const checkpointStage = resolveWorkflowStageFromCheckpoint({
    checkpointType: input.checkpointType,
    status: input.status,
  });
  if (checkpointStage) return checkpointStage;
  const stage = input.currentStage?.trim() as NovelWorkflowStage | undefined;
  return stage && WORKFLOW_STAGE_TO_DISPLAY_STAGE[stage] ? stage : null;
}

export function getWorkflowCheckpointLabel(input: {
  checkpointType: string | null | undefined;
  status?: string | null;
  preferPausedLabel?: boolean;
  fallback?: string | null;
}): string {
  const checkpoint = findWorkflowCheckpointCatalogEntry(input.checkpointType);
  if (!checkpoint) {
    return input.fallback?.trim() || "暂无";
  }
  if (input.status === "waiting_approval" && checkpoint.waitingApprovalLabel) {
    return checkpoint.waitingApprovalLabel;
  }
  if (input.preferPausedLabel && checkpoint.pausedLabel) {
    return checkpoint.pausedLabel;
  }
  if (input.status && input.status !== "waiting_approval" && checkpoint.runningLabel) {
    return checkpoint.runningLabel;
  }
  return checkpoint.label;
}

export function resolveWorkflowApprovalPointForCheckpoint(
  checkpointType: string | null | undefined,
): WorkflowStepCatalogApprovalPoint | null {
  return findWorkflowCheckpointCatalogEntry(checkpointType)?.approvalPoint ?? null;
}

export function getWorkflowStepWriteContractRequirements(): Array<{
  id: string;
  writes: string[];
  mayModifyUserContent: boolean;
  requiresPolicyAction: boolean;
}> {
  return WORKFLOW_STEP_CATALOG
    .filter((entry) => entry.writes.length > 0)
    .map((entry) => ({
      id: entry.id,
      writes: [...entry.writes],
      mayModifyUserContent: entry.mayModifyUserContent,
      requiresPolicyAction: Boolean(entry.policyAction),
    }));
}
