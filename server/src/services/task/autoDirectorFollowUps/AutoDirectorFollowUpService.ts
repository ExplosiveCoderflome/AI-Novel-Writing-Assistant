import type {
  AutoDirectorAction,
  AutoDirectorChannelDeliveryStatus,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpListInput,
  AutoDirectorFollowUpListResponse,
  AutoDirectorFollowUpMilestone,
  AutoDirectorFollowUpOverview,
  AutoDirectorResolvedFollowUpReason,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  AUTO_DIRECTOR_CHANNEL_TYPES,
  AUTO_DIRECTOR_FOLLOW_UP_REASONS,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import {
  parseMilestones,
  parseSeedPayload,
} from "../../novel/workflow/novelWorkflow.shared";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../novel/director/novelDirectorHelpers";
import { buildWorkflowExplainability } from "../novelWorkflowExplainability";
import { NovelWorkflowTaskAdapter } from "../adapters/NovelWorkflowTaskAdapter";
import {
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
import { getAutoDirectorChannelSettings } from "../../settings/AutoDirectorChannelSettingsService";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";

interface RawFollowUpWorkflowRow {
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

interface FollowUpWorkflowRow {
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

const PRIORITY_RANK: Record<AutoDirectorFollowUpItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
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

function normalizeWorkflowRow(row: RawFollowUpWorkflowRow): FollowUpWorkflowRow | null {
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

function projectFollowUpItem(
  row: FollowUpWorkflowRow,
  channelSettings?: Awaited<ReturnType<typeof getAutoDirectorChannelSettings>>,
): AutoDirectorFollowUpItem | null {
  const executionScopeLabel = getExecutionScopeLabel(row.seedPayloadJson);
  const resolved = resolveAutoDirectorFollowUpReason({
    status: row.status,
    checkpointType: row.checkpointType,
    pendingManualRecovery: row.pendingManualRecovery,
    executionScopeLabel,
  });
  if (!resolved) {
    return null;
  }

  return {
    taskId: row.id,
    novelId: row.novelId,
    novelTitle: getNovelTitle(row),
    taskTitle: row.title,
    lane: "auto_director",
    status: row.status,
    currentStage: row.currentStage,
    checkpointType: row.checkpointType,
    reason: resolved.reason,
    reasonLabel: resolved.reasonLabel,
    priority: resolved.priority,
    followUpSummary: buildFollowUpSummary(row, resolved),
    blockingReason: buildBlockingReason(row),
    executionScope: executionScopeLabel,
    currentModel: getCurrentModel(row.seedPayloadJson),
    availableActions: resolved.availableActions,
    batchActionCodes: resolved.batchActionCodes,
    supportsBatch: resolved.supportsBatch,
    channelCapabilities: {
      dingtalk: resolved.channelCapabilities.dingtalk && getRuntimeChannelCapabilities(channelSettings).dingtalk,
      wecom: resolved.channelCapabilities.wecom && getRuntimeChannelCapabilities(channelSettings).wecom,
    },
    pendingManualRecovery: row.pendingManualRecovery,
    lastMilestoneAt: getLatestMilestoneAt(row.milestonesJson),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matchesItemFilters(item: AutoDirectorFollowUpItem, input: AutoDirectorFollowUpListInput): boolean {
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

function matchesRowScopeFilters(row: FollowUpWorkflowRow, input: AutoDirectorFollowUpListInput): boolean {
  if (input.status && row.status !== input.status) {
    return false;
  }
  if (input.novelId && row.novelId !== input.novelId) {
    return false;
  }
  return true;
}

function compareFollowUpItems(left: AutoDirectorFollowUpItem, right: AutoDirectorFollowUpItem): number {
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

function buildAvailableReasons(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["availableFilters"]["reasons"] {
  const reasons = new Set(items.map((item) => item.reason));
  return AUTO_DIRECTOR_FOLLOW_UP_REASONS.filter((reason) => reasons.has(reason));
}

function buildAvailableStatuses(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["availableFilters"]["statuses"] {
  return Array.from(new Set(items.map((item) => item.status)));
}

function buildCounters(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpListResponse["countersByReason"] {
  const counters = buildEmptyCounters();
  for (const item of items) {
    counters[item.reason] += 1;
  }
  return counters;
}

function buildMilestoneLabel(milestone: ReturnType<typeof parseMilestones>[number]): string {
  return buildWorkflowExplainability({
    status: "waiting_approval",
    checkpointType: milestone.checkpointType,
  }).displayStatus ?? milestone.summary;
}

function buildMilestones(row: Pick<FollowUpWorkflowRow, "milestonesJson" | "status">): AutoDirectorFollowUpMilestone[] {
  return parseMilestones(row.milestonesJson).map((milestone) => ({
    label: buildMilestoneLabel(milestone),
    at: milestone.createdAt,
    status: row.status,
    summary: milestone.summary,
  }));
}

function buildSummaryCounters(
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

function decorateDetailActions(input: {
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

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021";
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

export class AutoDirectorFollowUpService {
  readonly workflowService = new NovelWorkflowService();

  private readonly workflowTaskAdapter = new NovelWorkflowTaskAdapter();

  async getOverview(): Promise<AutoDirectorFollowUpOverview> {
    const rows = await this.loadRows();
    const channelSettings = await getAutoDirectorChannelSettings();
    const items = rows
      .map((row) => projectFollowUpItem(row, channelSettings))
      .filter((item): item is AutoDirectorFollowUpItem => Boolean(item));

    return {
      totalCount: items.length,
      countersByReason: buildCounters(items),
    };
  }

  async list(input: AutoDirectorFollowUpListInput = {}): Promise<AutoDirectorFollowUpListResponse> {
    const rows = await this.loadRows();
    const channelSettings = await getAutoDirectorChannelSettings();
    const scopedRows = rows.filter((row) => matchesRowScopeFilters(row, input));
    const scopedItems = scopedRows
      .map((row) => projectFollowUpItem(row, channelSettings))
      .filter((item): item is AutoDirectorFollowUpItem => Boolean(item));
    const filteredItems = scopedItems
      .filter((item) => matchesItemFilters(item, input))
      .sort(compareFollowUpItems);

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.max(1, input.pageSize ?? 20);
    const start = (page - 1) * pageSize;

    return {
      items: filteredItems.slice(start, start + pageSize),
      countersByReason: buildCounters(filteredItems),
      summaryCounters: buildSummaryCounters(scopedRows, filteredItems),
      availableFilters: {
        reasons: buildAvailableReasons(filteredItems),
        statuses: buildAvailableStatuses(filteredItems),
        channelTypes: [...AUTO_DIRECTOR_CHANNEL_TYPES],
      },
      pagination: {
        page,
        pageSize,
        total: filteredItems.length,
      },
    };
  }

  async getDetail(taskId: string): Promise<AutoDirectorFollowUpDetail | null> {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }

    await this.workflowService.healAutoDirectorTaskState(taskId);

    const rawRow = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
    }) as RawFollowUpWorkflowRow | null;
    const row = rawRow ? normalizeWorkflowRow(rawRow) : null;
    if (!row) {
      return null;
    }

    const item = projectFollowUpItem(row, await getAutoDirectorChannelSettings());
    if (!item) {
      return null;
    }

    const task = await this.workflowTaskAdapter.detail(taskId);
    if (!task) {
      return null;
    }

    const originDetailUrl = `/tasks?kind=novel_workflow&id=${taskId}`;
    const candidateSelectionUrl = item.availableActions.some((action) => action.code === "go_candidate_selection")
      ? task.sourceRoute
      : null;
    const replanUrl = item.availableActions.some((action) => action.code === "go_replan")
      ? task.sourceRoute
      : null;

    return {
      taskId,
      checkpointSummary: row.checkpointSummary,
      blockingReason: item.blockingReason,
      currentModel: item.currentModel,
      riskNote: null,
      originDetailUrl,
      replanUrl,
      candidateSelectionUrl,
      availableActions: decorateDetailActions({
        actions: item.availableActions,
        originDetailUrl,
        candidateSelectionUrl,
        replanUrl,
      }),
      milestones: buildMilestones(row),
      channelDeliveries: await this.getRecentChannelDeliveries(taskId),
      task,
    };
  }

  private async getRecentChannelDeliveries(taskId: string): Promise<AutoDirectorChannelDeliveryStatus[]> {
    try {
      const rows = await prisma.autoDirectorFollowUpNotificationLog.findMany({
        where: {
          taskId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
      });
      const latestByChannel = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        if (!latestByChannel.has(row.channelType)) {
          latestByChannel.set(row.channelType, row);
        }
      }
      return Array.from(latestByChannel.values()).map((row) => ({
        channelType: row.channelType === "wecom" ? "wecom" : "dingtalk",
        status: row.status === "delivered" ? "delivered" : (row.status === "pending" ? "pending" : "failed"),
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        responseStatus: row.responseStatus ?? null,
        eventType: row.eventType as AutoDirectorChannelDeliveryStatus["eventType"],
        target: row.target ?? null,
      }));
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async loadRows(): Promise<FollowUpWorkflowRow[]> {
    const archivedIds = await getArchivedTaskIds("novel_workflow");
    const rows = await this.fetchRows(archivedIds);
    const healed = await Promise.all(
      rows.map((row) => this.workflowService.healAutoDirectorTaskState(row.id, row)),
    );
    if (!healed.some(Boolean)) {
      return rows;
    }
    return this.fetchRows(archivedIds);
  }

  private async fetchRows(archivedIds: string[]): Promise<FollowUpWorkflowRow[]> {
    const rawRows = await prisma.novelWorkflowTask.findMany({
      where: {
        lane: "auto_director",
        ...(archivedIds.length > 0
          ? {
            id: {
              notIn: archivedIds,
            },
          }
          : {}),
      },
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }) as RawFollowUpWorkflowRow[];

    return rawRows
      .map((row) => normalizeWorkflowRow(row))
      .filter((row): row is FollowUpWorkflowRow => Boolean(row));
  }
}
