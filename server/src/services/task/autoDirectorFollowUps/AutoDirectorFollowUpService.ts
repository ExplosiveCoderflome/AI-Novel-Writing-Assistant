import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorResolvedFollowUpReason,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../novel/director/novelDirectorHelpers";
import { parseSeedPayload } from "../../novel/workflow/novelWorkflow.shared";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import { NovelWorkflowTaskAdapter } from "../adapters/NovelWorkflowTaskAdapter";
import { buildWorkflowExplainability } from "../novelWorkflowExplainability";
import { isTaskArchived } from "../taskArchive";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";

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

function normalizeCheckpointType(value: string | null): NovelWorkflowCheckpoint | null {
  if (!value) {
    return null;
  }
  return WORKFLOW_CHECKPOINTS.includes(value as NovelWorkflowCheckpoint)
    ? value as NovelWorkflowCheckpoint
    : null;
}

function getExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  const scopeLabel = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson)?.autoExecution?.scopeLabel;
  return typeof scopeLabel === "string" && scopeLabel.trim() ? scopeLabel.trim() : null;
}

function getCurrentModel(seedPayloadJson: string | null | undefined): string | null {
  const llm = getDirectorLlmOptionsFromSeedPayload(parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson));
  const provider = typeof llm?.provider === "string" && llm.provider.trim() ? llm.provider.trim() : null;
  const model = typeof llm?.model === "string" && llm.model.trim() ? llm.model.trim() : null;
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model ?? provider ?? null;
}

function buildFollowUpSummary(input: {
  checkpointSummary?: string | null;
  currentItemLabel?: string | null;
  blockingReason?: string | null;
  resolved: AutoDirectorResolvedFollowUpReason;
}): string {
  const checkpointSummary = input.checkpointSummary?.trim();
  if (checkpointSummary) {
    return checkpointSummary;
  }
  const currentItemLabel = input.currentItemLabel?.trim();
  if (currentItemLabel) {
    return currentItemLabel;
  }
  return input.blockingReason?.trim() || input.resolved.reasonLabel;
}

function decorateActions(input: {
  actions: AutoDirectorAction[];
  taskId: string;
  sourceRoute: string;
}): AutoDirectorAction[] {
  const detailUrl = `/tasks?kind=novel_workflow&id=${input.taskId}`;
  return input.actions.map((action) => {
    if (action.kind !== "navigation") {
      return action;
    }
    if (action.code === "open_detail") {
      return {
        ...action,
        targetUrl: detailUrl,
      };
    }
    return {
      ...action,
      targetUrl: input.sourceRoute || detailUrl,
    };
  });
}

export class AutoDirectorFollowUpService {
  readonly workflowService = new NovelWorkflowService();

  readonly workflowTaskAdapter = new NovelWorkflowTaskAdapter();

  async getDetail(taskId: string): Promise<AutoDirectorFollowUpDetail | null> {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }

    await this.workflowService.healAutoDirectorTaskState(taskId);
    const [row, task] = await Promise.all([
      prisma.novelWorkflowTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          lane: true,
          status: true,
          pendingManualRecovery: true,
          checkpointType: true,
          checkpointSummary: true,
          currentItemLabel: true,
          seedPayloadJson: true,
          lastError: true,
          currentStage: true,
          currentItemKey: true,
        },
      }),
      this.workflowTaskAdapter.detail(taskId),
    ]);

    if (!row || !task || row.lane !== "auto_director") {
      return null;
    }

    const executionScopeLabel = task.executionScopeLabel ?? getExecutionScopeLabel(row.seedPayloadJson);
    const checkpointType = task.checkpointType ?? normalizeCheckpointType(row.checkpointType);
    const blockingReason = task.blockingReason ?? buildWorkflowExplainability({
      status: task.status,
      currentStage: row.currentStage,
      currentItemKey: row.currentItemKey,
      checkpointType,
      lastError: row.lastError,
      executionScopeLabel,
    }).blockingReason;
    const resolved = resolveAutoDirectorFollowUpReason({
      status: task.status,
      checkpointType,
      pendingManualRecovery: row.pendingManualRecovery,
      executionScopeLabel,
    });
    if (!resolved) {
      return null;
    }

    return {
      taskId,
      reason: resolved.reason,
      reasonLabel: resolved.reasonLabel,
      priority: resolved.priority,
      checkpointType,
      checkpointSummary: task.checkpointSummary ?? row.checkpointSummary ?? null,
      followUpSummary: buildFollowUpSummary({
        checkpointSummary: task.checkpointSummary ?? row.checkpointSummary,
        currentItemLabel: task.currentItemLabel ?? row.currentItemLabel,
        blockingReason,
        resolved,
      }),
      blockingReason,
      executionScope: executionScopeLabel,
      currentModel: getCurrentModel(row.seedPayloadJson),
      pendingManualRecovery: row.pendingManualRecovery,
      availableActions: decorateActions({
        actions: resolved.availableActions,
        taskId,
        sourceRoute: task.sourceRoute,
      }),
      batchActionCodes: resolved.batchActionCodes,
      supportsBatch: resolved.supportsBatch,
      task,
    };
  }
}
