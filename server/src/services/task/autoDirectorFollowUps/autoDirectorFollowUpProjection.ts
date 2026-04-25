import type {
  AutoDirectorAction,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpListInput,
  AutoDirectorFollowUpListResponse,
  AutoDirectorFollowUpMilestone,
  AutoDirectorFollowUpOverview,
  AutoDirectorFollowUpValidationSummary,
  AutoDirectorResolvedFollowUpReason,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  AUTO_DIRECTOR_FOLLOW_UP_REASONS,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  AUTO_DIRECTOR_FOLLOW_UP_SECTIONS,
  type AutoDirectorFollowUpSection,
} from "@ai-novel/shared/types/autoDirectorValidation";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../novel/director/novelDirectorHelpers";
import {
  compareAutoDirectorFollowUpSections,
  resolveAutoDirectorFollowUpSection,
} from "../../novel/director/autoDirectorValidationService";
import {
  parseMilestones,
  parseSeedPayload,
} from "../../novel/workflow/novelWorkflow.shared";
import type { getAutoDirectorChannelSettings } from "../../settings/AutoDirectorChannelSettingsService";
import { buildWorkflowExplainability } from "../novelWorkflowExplainability";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";
import {
  extractBlockedAutoDirectorValidationResult,
  summarizeAutoDirectorValidationResult,
} from "./autoDirectorFollowUpValidationResult";
import type { AutoDirectorAutoApprovalRecordRow } from "./autoDirectorAutoApprovalAudit";

export interface RawFollowUpWorkflowRow {
  id: string;
  novelId: string | null;
  lane: string;
  title: string;
  status: string;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  resumeTargetJson: string | null;
  seedPayloadJson: string | null;
  milestonesJson: string | null;
  pendingManualRecovery: boolean;
  attemptCount: number;
  lastError: string | null;
  finishedAt: Date | null;
  updatedAt: Date;
  novel?: {
    title: string;
  } | null;
}

export interface FollowUpWorkflowRow {
  id: string;
  novelId: string | null;
  lane: "auto_director";
  title: string;
  status: TaskStatus;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  checkpointSummary: string | null;
  resumeTargetJson: string | null;
  seedPayloadJson: string | null;
  milestonesJson: string | null;
  pendingManualRecovery: boolean;
  attemptCount: number;
  lastError: string | null;
  finishedAt: Date | null;
  updatedAt: Date;
  novel?: {
    title: string;
  } | null;
}

export interface AutoApprovalRecordProjectionInput extends AutoDirectorAutoApprovalRecordRow {
  novel?: {
    title?: string | null;
  } | null;
}

const PRIORITY_RANK: Record<AutoDirectorFollowUpItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

const SECTION_BATCH_ACTIONS: Partial<Record<AutoDirectorFollowUpSection, AutoDirectorFollowUpItem["batchActionCodes"]>> = {
  pending: ["continue_auto_execution"],
  exception: ["retry_with_task_model"],
};

const TASK_STATUSES: readonly TaskStatus[] = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;

const WORKFLOW_CHECKPOINTS: readonly NovelWorkflowCheckpoint[] = [
  "candidate_selection_required",
  "book_contract_ready",
  "character_setup_required",
  "volume_strategy_ready",
  "front10_ready",
  "chapter_batch_ready",
  "replan_required",
  "workflow_completed",
] as const;

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

function normalizeCheckpointType(value: string | null): NovelWorkflowCheckpoint | null {
  if (!value) {
    return null;
  }
  return WORKFLOW_CHECKPOINTS.includes(value as NovelWorkflowCheckpoint)
    ? value as NovelWorkflowCheckpoint
    : null;
}

export function normalizeWorkflowRow(row: RawFollowUpWorkflowRow): FollowUpWorkflowRow | null {
  if (row.lane !== "auto_director" || !isTaskStatus(row.status)) {
    return null;
  }
  return {
    ...row,
    lane: "auto_director",
    status: row.status,
    checkpointType: normalizeCheckpointType(row.checkpointType),
  };
}

function buildEmptyCounters(): AutoDirectorFollowUpOverview["countersByReason"] {
  return Object.fromEntries(
    AUTO_DIRECTOR_FOLLOW_UP_REASONS.map((reason) => [reason, 0]),
  ) as AutoDirectorFollowUpOverview["countersByReason"];
}

function buildEmptySectionCounters(): AutoDirectorFollowUpOverview["countersBySection"] {
  return Object.fromEntries(
    AUTO_DIRECTOR_FOLLOW_UP_SECTIONS.map((section) => [section, 0]),
  ) as AutoDirectorFollowUpOverview["countersBySection"];
}

function parseWorkflowSeedPayload(seedPayloadJson: string | null | undefined): DirectorWorkflowSeedPayload | null {
  return parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
}

function getExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  const scopeLabel = parseWorkflowSeedPayload(seedPayloadJson)?.autoExecution?.scopeLabel;
  return typeof scopeLabel === "string" && scopeLabel.trim() ? scopeLabel.trim() : null;
}

function getCurrentModel(seedPayloadJson: string | null | undefined): string | null {
  const llm = getDirectorLlmOptionsFromSeedPayload(parseWorkflowSeedPayload(seedPayloadJson));
  const provider = typeof llm?.provider === "string" && llm.provider.trim() ? llm.provider.trim() : null;
  const model = typeof llm?.model === "string" && llm.model.trim() ? llm.model.trim() : null;
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model ?? provider ?? null;
}

export function getReplacementTaskId(seedPayloadJson: string | null | undefined): string | null {
  const seedPayload = parseWorkflowSeedPayload(seedPayloadJson);
  const replacementTaskId = (seedPayload as { replacementTaskId?: unknown } | null)?.replacementTaskId;
  return typeof replacementTaskId === "string" && replacementTaskId.trim() ? replacementTaskId.trim() : null;
}

function getKnownReplacementTaskId(seedPayloadJson: string | null | undefined, knownTaskIds: ReadonlySet<string>): string | null {
  const replacementTaskId = getReplacementTaskId(seedPayloadJson);
  return replacementTaskId && knownTaskIds.has(replacementTaskId) ? replacementTaskId : null;
}

function buildSyntheticValidationSummary(row: FollowUpWorkflowRow): AutoDirectorFollowUpValidationSummary | null {
  if (row.pendingManualRecovery || row.status === "failed" || row.status === "cancelled") {
    return {
      blockingReasons: [buildBlockingReason(row) ?? "任务状态需要重新校验后再继续。"],
      warnings: [],
      requiredActions: [{
        code: "revalidate_assets",
        label: "重新读取任务状态",
        riskLevel: "low",
        safeToAutoFix: true,
      }],
      affectedScope: {
        type: "book",
        label: getExecutionScopeLabel(row.seedPayloadJson) ?? "当前任务范围",
      },
      nextAction: "revalidate",
    };
  }
  return null;
}

function filterBatchActionCodes(
  section: AutoDirectorFollowUpSection,
  resolved: AutoDirectorResolvedFollowUpReason,
): AutoDirectorFollowUpItem["batchActionCodes"] {
  const allowedBySection = SECTION_BATCH_ACTIONS[section] ?? [];
  return resolved.batchActionCodes.filter((code) => allowedBySection.includes(code));
}

function getLatestMilestoneAt(milestonesJson: string | null | undefined): string | null {
  const milestones = parseMilestones(milestonesJson);
  if (milestones.length === 0) {
    return null;
  }
  return milestones.reduce<string | null>((latest, milestone) => {
    if (!latest || milestone.createdAt > latest) {
      return milestone.createdAt;
    }
    return latest;
  }, null);
}

function getNovelTitle(row: Pick<FollowUpWorkflowRow, "novel" | "title">): string {
  return row.novel?.title?.trim() || row.title.trim() || "AI 自动导演";
}

function buildBlockingReason(row: FollowUpWorkflowRow): string | null {
  return buildWorkflowExplainability({
    status: row.status,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    checkpointType: row.checkpointType,
    lastError: row.lastError,
    executionScopeLabel: getExecutionScopeLabel(row.seedPayloadJson),
  }).blockingReason;
}

function buildFollowUpSummary(
  row: FollowUpWorkflowRow,
  resolved: AutoDirectorResolvedFollowUpReason,
): string {
  const checkpointSummary = row.checkpointSummary?.trim();
  if (checkpointSummary) {
    return checkpointSummary;
  }
  const currentItemLabel = row.currentItemLabel?.trim();
  if (currentItemLabel) {
    return currentItemLabel;
  }
  return buildBlockingReason(row) ?? resolved.reasonLabel;
}

function getRuntimeChannelCapabilities(channelSettings?: Awaited<ReturnType<typeof getAutoDirectorChannelSettings>>): AutoDirectorFollowUpItem["channelCapabilities"] {
  return {
    dingtalk: Boolean(channelSettings?.dingtalk.webhookUrl?.trim()),
    wecom: Boolean(channelSettings?.wecom.webhookUrl?.trim()),
  };
}

export function projectFollowUpItem(
  row: FollowUpWorkflowRow,
  knownTaskIds: ReadonlySet<string>,
  channelSettings?: Awaited<ReturnType<typeof getAutoDirectorChannelSettings>>,
): AutoDirectorFollowUpItem | null {
  const executionScopeLabel = getExecutionScopeLabel(row.seedPayloadJson);
  const replacementTaskId = getKnownReplacementTaskId(row.seedPayloadJson, knownTaskIds);
  const validationResult = extractBlockedAutoDirectorValidationResult(row.seedPayloadJson);
  const resolved = resolveAutoDirectorFollowUpReason({
    status: row.status,
    checkpointType: row.checkpointType,
    pendingManualRecovery: row.pendingManualRecovery,
    executionScopeLabel,
    replacementTaskId,
    validationResult,
  });
  if (!resolved) {
    return null;
  }
  const validationSummary = validationResult
    ? summarizeAutoDirectorValidationResult(validationResult)
    : buildSyntheticValidationSummary(row);
  const section = resolveAutoDirectorFollowUpSection({
    status: row.status,
    checkpointType: row.checkpointType,
    pendingManualRecovery: row.pendingManualRecovery,
    replacementTaskId,
    validationResult,
  });
  const batchActionCodes = filterBatchActionCodes(section, resolved);

  return {
    itemType: "task",
    taskId: row.id,
    novelId: row.novelId,
    novelTitle: getNovelTitle(row),
    taskTitle: row.title,
    lane: "auto_director",
    status: row.status,
    currentStage: row.currentStage,
    checkpointType: row.checkpointType,
    reason: resolved.reason,
    section,
    reasonLabel: resolved.reasonLabel,
    priority: resolved.priority,
    followUpSummary: buildFollowUpSummary(row, resolved),
    blockingReason: buildBlockingReason(row),
    validationSummary,
    executionScope: executionScopeLabel,
    currentModel: getCurrentModel(row.seedPayloadJson),
    availableActions: resolved.availableActions,
    batchActionCodes,
    supportsBatch: batchActionCodes.length > 0,
    channelCapabilities: {
      dingtalk: resolved.channelCapabilities.dingtalk && getRuntimeChannelCapabilities(channelSettings).dingtalk,
      wecom: resolved.channelCapabilities.wecom && getRuntimeChannelCapabilities(channelSettings).wecom,
    },
    pendingManualRecovery: row.pendingManualRecovery,
    lastMilestoneAt: getLatestMilestoneAt(row.milestonesJson),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function projectAutoApprovalRecordItem(
  row: AutoApprovalRecordProjectionInput,
  taskById: ReadonlyMap<string, FollowUpWorkflowRow>,
): AutoDirectorFollowUpItem {
  const task = taskById.get(row.taskId);
  return {
    itemType: "auto_approval_record",
    taskId: row.taskId,
    autoApprovalRecordId: row.id,
    novelId: row.novelId,
    novelTitle: row.novel?.title?.trim() || task?.novel?.title?.trim() || task?.title?.trim() || "AI 自动导演",
    taskTitle: task?.title ?? "AI 自动导演",
    lane: "auto_director",
    status: task?.status ?? "running",
    currentStage: row.stage ?? task?.currentStage ?? null,
    checkpointType: normalizeCheckpointType(row.checkpointType),
    reason: "auto_approval_completed",
    section: "auto_progress",
    reasonLabel: "最近自动通过",
    priority: "P2",
    followUpSummary: row.summary,
    blockingReason: null,
    validationSummary: null,
    executionScope: row.scopeLabel ?? getExecutionScopeLabel(task?.seedPayloadJson) ?? null,
    currentModel: getCurrentModel(task?.seedPayloadJson),
    availableActions: [{
      code: "open_detail",
      kind: "navigation",
      label: "查看任务详情",
      riskLevel: "low",
      requiresConfirm: false,
      targetUrl: `/tasks?kind=novel_workflow&id=${row.taskId}`,
    }],
    batchActionCodes: [],
    supportsBatch: false,
    channelCapabilities: {
      dingtalk: false,
      wecom: false,
    },
    pendingManualRecovery: false,
    lastMilestoneAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

export function matchesItemFilters(item: AutoDirectorFollowUpItem, input: AutoDirectorFollowUpListInput): boolean {
  if (input.section && item.section !== input.section) {
    return false;
  }
  if (input.reason && item.reason !== input.reason) {
    return false;
  }
  if (input.status && item.status !== input.status) {
    return false;
  }
  if (input.novelId && item.novelId !== input.novelId) {
    return false;
  }
  if (typeof input.supportsBatch === "boolean" && item.supportsBatch !== input.supportsBatch) {
    return false;
  }
  if (input.channelType && !item.channelCapabilities[input.channelType]) {
    return false;
  }
  return true;
}

export function matchesRowScopeFilters(row: FollowUpWorkflowRow, input: AutoDirectorFollowUpListInput): boolean {
  if (input.status && row.status !== input.status) {
    return false;
  }
  if (input.novelId && row.novelId !== input.novelId) {
    return false;
  }
  return true;
}

export function compareFollowUpItems(left: AutoDirectorFollowUpItem, right: AutoDirectorFollowUpItem): number {
  const sectionDiff = compareAutoDirectorFollowUpSections(left.section, right.section);
  if (sectionDiff !== 0) {
    return sectionDiff;
  }
  const priorityDiff = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  const updatedAtDiff = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }
  return right.taskId.localeCompare(left.taskId);
}

export function buildAvailableReasons(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["availableFilters"]["reasons"] {
  const reasons = new Set(items.map((item) => item.reason));
  return AUTO_DIRECTOR_FOLLOW_UP_REASONS.filter((reason) => reasons.has(reason));
}

export function buildAvailableSections(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["availableFilters"]["sections"] {
  const sections = new Set(items.map((item) => item.section));
  return AUTO_DIRECTOR_FOLLOW_UP_SECTIONS.filter((section) => sections.has(section));
}

export function buildAvailableStatuses(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["availableFilters"]["statuses"] {
  return Array.from(new Set(items.map((item) => item.status)));
}

export function buildCounters(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["countersByReason"] {
  const counters = buildEmptyCounters();
  for (const item of items) {
    counters[item.reason] += 1;
  }
  return counters;
}

export function buildSectionCounters(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["countersBySection"] {
  const counters = buildEmptySectionCounters();
  for (const item of items) {
    counters[item.section] += 1;
  }
  return counters;
}

function buildMilestoneLabel(milestone: ReturnType<typeof parseMilestones>[number]): string {
  if (milestone.checkpointType === "rewrite_snapshot_created") {
    return "重写前备份已创建";
  }
  return buildWorkflowExplainability({
    status: "waiting_approval",
    checkpointType: milestone.checkpointType as NovelWorkflowCheckpoint,
  }).displayStatus ?? milestone.summary;
}

export function buildMilestones(row: Pick<FollowUpWorkflowRow, "milestonesJson" | "status">): AutoDirectorFollowUpMilestone[] {
  return parseMilestones(row.milestonesJson).map((milestone) => ({
    label: buildMilestoneLabel(milestone),
    at: milestone.createdAt,
    status: row.status,
    summary: milestone.summary,
  }));
}

export function buildSummaryCounters(
  rows: FollowUpWorkflowRow[],
  actionableItems: AutoDirectorFollowUpItem[],
): AutoDirectorFollowUpListResponse["summaryCounters"] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartAt = todayStart.getTime();
  const actionableIds = new Set(actionableItems.map((item) => item.taskId));

  const completedToday = rows.filter((row) => (
    row.status === "succeeded"
    && row.finishedAt
    && row.finishedAt.getTime() >= todayStartAt
  )).length;

  const recoveredToday = rows.filter((row) => (
    !actionableIds.has(row.id)
    && !row.pendingManualRecovery
    && row.attemptCount > 1
    && row.updatedAt.getTime() >= todayStartAt
    && (row.status === "running" || row.status === "waiting_approval")
  )).length;

  return {
    recoveredToday,
    completedToday,
  };
}

export function decorateDetailActions(input: {
  actions: AutoDirectorAction[];
  originDetailUrl: string;
  candidateSelectionUrl: string | null;
  replanUrl: string | null;
}): AutoDirectorAction[] {
  return input.actions.map((action) => {
    if (action.kind !== "navigation") {
      return action;
    }
    if (action.code === "open_detail") {
      return {
        ...action,
        targetUrl: input.originDetailUrl,
      };
    }
    if (action.code === "go_candidate_selection" && input.candidateSelectionUrl) {
      return {
        ...action,
        targetUrl: input.candidateSelectionUrl,
      };
    }
    if (action.code === "go_replan" && input.replanUrl) {
      return {
        ...action,
        targetUrl: input.replanUrl,
      };
    }
    return action;
  });
}
