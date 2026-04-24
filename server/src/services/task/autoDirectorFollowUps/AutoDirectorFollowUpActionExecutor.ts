import type {
  AutoDirectorActionExecutionResult,
  AutoDirectorActionRequest,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { AppError } from "../../../middleware/errorHandler";
import { resolveModel, type TaskType } from "../../../llm/modelRouter";
import { NovelDirectorService } from "../../novel/director/NovelDirectorService";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import { NovelWorkflowTaskAdapter } from "../adapters/NovelWorkflowTaskAdapter";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";

type WorkflowTaskRow = NonNullable<Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>>;

const EXECUTED_ACTION_CACHE = new Map<string, AutoDirectorActionExecutionResult>();

function buildExecutedCacheKey(input: {
  taskId: string;
  actionCode: AutoDirectorMutationActionCode;
  idempotencyKey: string;
}): string {
  return `${input.taskId}:${input.actionCode}:${input.idempotencyKey}`;
}

function getExecutionScopeLabel(row: {
  seedPayloadJson?: string | null;
  checkpointSummary?: string | null;
}): string | null {
  if (!row.seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.seedPayloadJson) as {
      autoExecution?: {
        scopeLabel?: unknown;
      };
    };
    const scopeLabel = parsed.autoExecution?.scopeLabel;
    return typeof scopeLabel === "string" && scopeLabel.trim() ? scopeLabel.trim() : null;
  } catch {
    return null;
  }
}

function toCheckpointType(value: string | null | undefined): NovelWorkflowCheckpoint | null {
  return typeof value === "string" && value.trim() ? value as NovelWorkflowCheckpoint : null;
}

function buildAlreadyProcessedResult(
  input: AutoDirectorActionRequest,
  task: AutoDirectorActionExecutionResult["task"],
): AutoDirectorActionExecutionResult {
  return {
    taskId: input.taskId,
    actionCode: input.actionCode,
    code: "already_processed",
    message: "该操作已处理。",
    task,
  };
}

function buildFailedResult(
  input: Pick<AutoDirectorActionRequest, "taskId" | "actionCode">,
  message: string,
  task: AutoDirectorActionExecutionResult["task"] = null,
): AutoDirectorActionExecutionResult {
  return {
    taskId: input.taskId,
    actionCode: input.actionCode,
    code: "failed",
    message: message.trim() || "执行失败。",
    task,
  };
}

export class AutoDirectorFollowUpActionExecutor {
  readonly workflowService = new NovelWorkflowService();

  readonly novelDirectorService = new NovelDirectorService();

  readonly workflowTaskAdapter = new NovelWorkflowTaskAdapter();

  async execute(input: AutoDirectorActionRequest): Promise<AutoDirectorActionExecutionResult> {
    const executedCacheKey = buildExecutedCacheKey(input);
    const cached = EXECUTED_ACTION_CACHE.get(executedCacheKey);
    if (cached) {
      return buildAlreadyProcessedResult(input, await this.safeGetTaskDetail(input.taskId) ?? cached.task ?? null);
    }

    await this.workflowService.healAutoDirectorTaskState(input.taskId);
    const row = await this.workflowService.getTaskByIdWithoutHealing(input.taskId);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks are supported.", 400);
    }

    const allowedActions = this.getAllowedMutationActions(row);
    if (!allowedActions) {
      return {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "state_changed",
        message: "任务状态已变化，请刷新后再试。",
        task: await this.safeGetTaskDetail(input.taskId),
      };
    }
    if (!allowedActions.has(input.actionCode)) {
      return {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "forbidden",
        message: "当前任务不支持这个操作。",
        task: await this.safeGetTaskDetail(input.taskId),
      };
    }

    try {
      const task = await this.executeMutationAction(row, input);
      const result: AutoDirectorActionExecutionResult = {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "executed",
        message: "操作已执行。",
        task,
      };
      EXECUTED_ACTION_CACHE.set(executedCacheKey, result);
      return result;
    } catch (error) {
      return buildFailedResult(
        input,
        error instanceof Error ? error.message : "执行失败。",
        await this.safeGetTaskDetail(input.taskId),
      );
    }
  }

  private resolveRouteTaskType(row: WorkflowTaskRow): TaskType {
    if (
      row.checkpointType === "replan_required"
      || row.currentItemKey === "quality_repair"
      || row.currentStage?.includes("质量")
    ) {
      return "repair";
    }
    return "planner";
  }

  private getAllowedMutationActions(row: WorkflowTaskRow): Set<AutoDirectorMutationActionCode> | null {
    const resolved = resolveAutoDirectorFollowUpReason({
      status: row.status,
      checkpointType: toCheckpointType(row.checkpointType),
      pendingManualRecovery: row.pendingManualRecovery,
      executionScopeLabel: getExecutionScopeLabel(row),
    });
    if (!resolved) {
      return null;
    }
    return new Set(
      resolved.availableActions
        .filter((action): action is typeof action & { kind: "mutation" } => action.kind === "mutation")
        .map((action) => action.code as AutoDirectorMutationActionCode),
    );
  }

  private async executeMutationAction(
    row: WorkflowTaskRow,
    input: AutoDirectorActionRequest,
  ): Promise<AutoDirectorActionExecutionResult["task"]> {
    if (input.actionCode === "continue_auto_execution") {
      await this.novelDirectorService.continueTask(input.taskId, {
        continuationMode: row.checkpointType === "front10_ready"
          ? "auto_execute_front10"
          : "auto_execute_range",
      });
      return this.safeGetTaskDetail(input.taskId);
    }

    if (input.actionCode === "continue_generic") {
      await this.novelDirectorService.continueTask(input.taskId);
      return this.safeGetTaskDetail(input.taskId);
    }

    if (input.actionCode === "retry_with_task_model") {
      return this.workflowTaskAdapter.retry({
        id: input.taskId,
        resume: true,
      });
    }

    const routeModel = await resolveModel(this.resolveRouteTaskType(row));
    return this.workflowTaskAdapter.retry({
      id: input.taskId,
      llmOverride: {
        provider: routeModel.provider,
        model: routeModel.model,
        temperature: routeModel.temperature,
      },
      resume: true,
    });
  }

  private async safeGetTaskDetail(taskId: string) {
    try {
      return await this.workflowTaskAdapter.detail(taskId);
    } catch {
      return null;
    }
  }
}
