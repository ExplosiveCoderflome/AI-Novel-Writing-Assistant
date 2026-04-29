import type {
  AutoDirectorChannelDeliveryStatus,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpListInput,
  AutoDirectorFollowUpListResponse,
  AutoDirectorFollowUpOverview,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  AUTO_DIRECTOR_CHANNEL_TYPES,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { prisma } from "../../../db/prisma";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import { NovelWorkflowTaskAdapter } from "../adapters/NovelWorkflowTaskAdapter";
import {
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
import { getAutoDirectorChannelSettings } from "../../settings/AutoDirectorChannelSettingsService";
import {
  buildAvailableReasons,
  buildAvailableSections,
  buildAvailableStatuses,
  buildCounters,
  buildMilestones,
  buildSectionCounters,
  buildSummaryCounters,
  compareFollowUpItems,
  decorateDetailActions,
  getReplacementTaskId,
  matchesItemFilters,
  matchesRowScopeFilters,
  normalizeWorkflowRow,
  projectAutoApprovalRecordItem,
  projectFollowUpItem,
  type FollowUpWorkflowRow,
  type RawFollowUpWorkflowRow,
} from "./autoDirectorFollowUpProjection";
import { loadRecentAutoDirectorAutoApprovalRecords } from "./autoDirectorAutoApprovalAudit";

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
    const knownTaskIds = new Set(rows.map((row) => row.id));
    const taskById = new Map(rows.map((row) => [row.id, row]));
    const channelSettings = await getAutoDirectorChannelSettings();
    const taskItems = rows
      .map((row) => projectFollowUpItem(row, knownTaskIds, channelSettings))
      .filter((item): item is AutoDirectorFollowUpItem => Boolean(item));
    const autoApprovalItems = await this.loadAutoApprovalItems(rows, taskById);
    const items = taskItems.concat(autoApprovalItems);

    return {
      totalCount: items.length,
      countersByReason: buildCounters(items),
      countersBySection: buildSectionCounters(items),
    };
  }

  async list(input: AutoDirectorFollowUpListInput = {}): Promise<AutoDirectorFollowUpListResponse> {
    const rows = await this.loadRows();
    const knownTaskIds = new Set(rows.map((row) => row.id));
    const taskById = new Map(rows.map((row) => [row.id, row]));
    const channelSettings = await getAutoDirectorChannelSettings();
    const scopedRows = rows.filter((row) => matchesRowScopeFilters(row, input));
    const scopedTaskItems = scopedRows
      .map((row) => projectFollowUpItem(row, knownTaskIds, channelSettings))
      .filter((item): item is AutoDirectorFollowUpItem => Boolean(item));
    const scopedItems = scopedTaskItems.concat(await this.loadAutoApprovalItems(scopedRows, taskById));
    const filteredItems = scopedItems
      .filter((item) => matchesItemFilters(item, input))
      .sort(compareFollowUpItems);

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.max(1, input.pageSize ?? 20);
    const start = (page - 1) * pageSize;

    return {
      items: filteredItems.slice(start, start + pageSize),
      countersByReason: buildCounters(filteredItems),
      countersBySection: buildSectionCounters(filteredItems),
      summaryCounters: buildSummaryCounters(scopedRows, filteredItems),
      availableFilters: {
        sections: buildAvailableSections(scopedItems),
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

  async getDetail(taskId: string, options: { heal?: boolean } = {}): Promise<AutoDirectorFollowUpDetail | null> {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }

    const shouldHeal = options.heal === true;
    if (shouldHeal) {
      await this.workflowService.healAutoDirectorTaskState(taskId);
    }

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

    const knownTaskIds = new Set([row.id]);
    const replacementTaskId = getReplacementTaskId(row.seedPayloadJson);
    if (replacementTaskId) {
      const replacement = await prisma.novelWorkflowTask.findUnique({
        where: { id: replacementTaskId },
        select: { id: true },
      });
      if (replacement) {
        knownTaskIds.add(replacement.id);
      }
    }
    const item = projectFollowUpItem(row, knownTaskIds, await getAutoDirectorChannelSettings());
    if (!item) {
      return null;
    }

    const task = await this.workflowTaskAdapter.detail(taskId, {
      heal: shouldHeal,
    });
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
      reasonLabel: item.reasonLabel,
      priority: item.priority,
      followUpSummary: item.followUpSummary,
      checkpointSummary: row.checkpointSummary,
      blockingReason: item.blockingReason,
      nextStepSuggestion: task.nextActionLabel ?? task.resumeAction ?? item.availableActions[0]?.label ?? null,
      validationSummary: item.validationSummary ?? null,
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

  private async loadAutoApprovalItems(
    rows: FollowUpWorkflowRow[],
    taskById: ReadonlyMap<string, FollowUpWorkflowRow>,
  ): Promise<AutoDirectorFollowUpItem[]> {
    const novelIds = rows
      .map((row) => row.novelId)
      .filter((novelId): novelId is string => Boolean(novelId?.trim()));
    const records = await loadRecentAutoDirectorAutoApprovalRecords(novelIds);
    return records.map((record) => projectAutoApprovalRecordItem({
      ...record,
      novel: taskById.get(record.taskId)?.novel ?? null,
    }, taskById));
  }

  private async loadRows(): Promise<FollowUpWorkflowRow[]> {
    const archivedIds = await getArchivedTaskIds("novel_workflow");
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
