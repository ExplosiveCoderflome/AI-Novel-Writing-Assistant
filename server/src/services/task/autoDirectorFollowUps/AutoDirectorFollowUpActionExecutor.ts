import type {
  AutoDirectorActionExecutionResult,
  AutoDirectorActionRequest,
  AutoDirectorBatchActionExecutionResult,
  AutoDirectorBatchActionRequest,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveModel, type TaskType } from "../../../llm/modelRouter";
import { NovelDirectorService } from "../../novel/director/NovelDirectorService";
import { AutoDirectorValidationService } from "../../novel/director/autoDirectorValidationService";
import type { DirectorWorkflowSeedPayload } from "../../novel/director/novelDirectorHelpers";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import { parseSeedPayload } from "../../novel/workflow/novelWorkflow.shared";
import { NovelWorkflowTaskAdapter } from "../adapters/NovelWorkflowTaskAdapter";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";
import { resolveAutoDirectorFollowUpSection } from "../../novel/director/autoDirectorValidationService";
import { extractBlockedAutoDirectorValidationResult } from "./autoDirectorFollowUpValidationResult";

type WorkflowTaskRow = NonNullable<Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>>;

const EXECUTED_ACTION_CACHE = new Map<string, AutoDirectorActionExecutionResult>();

const BATCH_ALLOWED_ACTIONS = new Set<AutoDirectorMutationActionCode>([
  "continue_auto_execution",
  "retry_with_task_model",
]);

const BATCH_SECTION_ACTIONS: Partial<Record<AutoDirectorFollowUpSection, AutoDirectorMutationActionCode>> = {
  pending: "continue_auto_execution",
  exception: "retry_with_task_model",
};

function getAllowedBatchActionForRow(row: WorkflowTaskRow): AutoDirectorMutationActionCode | null {
  const section = resolveAutoDirectorFollowUpSection({
    status: row.status,
    checkpointType: toCheckpointType(row.checkpointType),
    pendingManualRecovery: row.pendingManualRecovery,
    validationResult: extractBlockedAutoDirectorValidationResult(row.seedPayloadJson),
  });
  return BATCH_SECTION_ACTIONS[section] ?? null;
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

function getExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  const scopeLabel = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson)?.autoExecution?.scopeLabel;
  return typeof scopeLabel === "string" && scopeLabel.trim() ? scopeLabel.trim() : null;
}

function toCheckpointType(value: string | null | undefined): NovelWorkflowCheckpoint | null {
  return typeof value === "string" && value.trim() ? value as NovelWorkflowCheckpoint : null;
}

function buildExecutedCacheKey(input: {
  taskId: string;
  actionCode: AutoDirectorMutationActionCode;
  idempotencyKey: string;
}): string {
  return `${input.taskId}:${input.actionCode}:${input.idempotencyKey}`;
}

function buildAlreadyProcessedResult(
  input: AutoDirectorActionRequest,
  task: AutoDirectorActionExecutionResult["task"],
): AutoDirectorActionExecutionResult {
  return {
    taskId: input.taskId,
    actionCode: input.actionCode,
    code: "already_processed",
    message: "已处理",
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
    message: message.trim() || "执行失败",
    task,
  };
}

function summarizeBatchResult(input: {
  successCount: number;
  failureCount: number;
  skippedCount: number;
}): { code: AutoDirectorBatchActionExecutionResult["code"]; message: string } {
  const parts: string[] = [];
  if (input.successCount > 0) {
    parts.push(`${input.successCount} 条成功`);
  }
  if (input.failureCount > 0) {
    parts.push(`${input.failureCount} 条失败`);
  }
  if (input.skippedCount > 0) {
    parts.push(`${input.skippedCount} 条跳过`);
  }
  if (input.successCount > 0 && input.failureCount === 0 && input.skippedCount === 0) {
    return {
      code: "success",
      message: parts[0] ?? "执行成功",
    };
  }
  if (input.successCount === 0 && input.failureCount === 0 && input.skippedCount > 0) {
    return {
      code: "skipped",
      message: parts[0] ?? "已跳过",
    };
  }
  if (input.successCount === 0 && input.failureCount > 0 && input.skippedCount === 0) {
    return {
      code: "failed",
      message: parts[0] ?? "执行失败",
    };
  }
  return {
    code: "partial_success",
    message: parts.join("，") || "部分执行完成",
  };
}

export class AutoDirectorFollowUpActionExecutor {
  readonly workflowService = new NovelWorkflowService();

  readonly novelDirectorService = new NovelDirectorService();

  readonly workflowTaskAdapter = new NovelWorkflowTaskAdapter();

  readonly validationService = new AutoDirectorValidationService();

  async execute(input: AutoDirectorActionRequest): Promise<AutoDirectorActionExecutionResult> {
    const executedCacheKey = buildExecutedCacheKey(input);
    const cached = EXECUTED_ACTION_CACHE.get(executedCacheKey);
    if (cached) {
      return buildAlreadyProcessedResult(input, await this.safeGetTaskDetail(input.taskId) ?? cached.task ?? null);
    }

    const logged = await this.findLoggedExecution(input.idempotencyKey);
    if (logged && logged.resultCode === "executed") {
      const task = await this.safeGetTaskDetail(input.taskId);
      const result = buildAlreadyProcessedResult(input, task);
      EXECUTED_ACTION_CACHE.set(executedCacheKey, {
        ...result,
        code: "executed",
        message: "执行成功",
      });
      return result;
    }

    await this.workflowService.healAutoDirectorTaskState(input.taskId);
    const row = await this.workflowService.getTaskByIdWithoutHealing(input.taskId);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks are supported.", 400);
    }

    if (input.metadata?.batchAction === true) {
      const allowedBatchAction = getAllowedBatchActionForRow(row);
      if (allowedBatchAction !== input.actionCode) {
        const result: AutoDirectorActionExecutionResult = {
          taskId: input.taskId,
          actionCode: input.actionCode,
          code: "forbidden",
          message: "所选分区不支持该批量动作",
          task: await this.safeGetTaskDetail(input.taskId),
        };
        await this.recordActionLog(input, result);
        return result;
      }
    }

    const allowedActions = this.getAllowedMutationActions(row);
    if (!allowedActions) {
      const result: AutoDirectorActionExecutionResult = {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "state_changed",
        message: "状态已变化",
        task: await this.safeGetTaskDetail(input.taskId),
      };
      await this.recordActionLog(input, result);
      return result;
    }

    if (!allowedActions.has(input.actionCode)) {
      const result: AutoDirectorActionExecutionResult = {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "forbidden",
        message: "当前任务不支持该操作",
        task: await this.safeGetTaskDetail(input.taskId),
      };
      await this.recordActionLog(input, result);
      return result;
    }

    const validation = await this.validationService.validateAction({
      source: input.source,
      actionCode: input.actionCode,
      task: {
        id: row.id,
        lane: row.lane,
        status: row.status,
        checkpointType: toCheckpointType(row.checkpointType),
        pendingManualRecovery: row.pendingManualRecovery,
        novelId: row.novelId,
        seedPayload: parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson),
      },
    });
    if (!validation.allowed) {
      const blockingReasons = Array.isArray(validation.blockingReasons)
        ? validation.blockingReasons
        : [];
      const result: AutoDirectorActionExecutionResult = {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "forbidden",
        message: blockingReasons.join("；") || "当前任务需要先重新校验。",
        task: await this.safeGetTaskDetail(input.taskId),
      };
      await this.recordActionLog(input, result);
      return result;
    }

    try {
      const task = await this.executeMutationAction(row, input);
      const result: AutoDirectorActionExecutionResult = {
        taskId: input.taskId,
        actionCode: input.actionCode,
        code: "executed",
        message: "执行成功",
        task,
      };
      EXECUTED_ACTION_CACHE.set(executedCacheKey, result);
      await this.recordActionLog(input, result);
      return result;
    } catch (error) {
      const result = buildFailedResult(
        input,
        error instanceof Error ? error.message : "执行失败",
        await this.safeGetTaskDetail(input.taskId),
      );
      await this.recordActionLog(input, result);
      return result;
    }
  }

  async executeBatch(input: AutoDirectorBatchActionRequest): Promise<AutoDirectorBatchActionExecutionResult> {
    if (!BATCH_ALLOWED_ACTIONS.has(input.actionCode)) {
      throw new AppError("Unsupported batch action.", 400);
    }

    const uniqueTaskIds = Array.from(new Set(input.taskIds.map((item) => item.trim()).filter(Boolean)));
    const itemResults: AutoDirectorActionExecutionResult[] = [];
    let highMemoryStartedCount = 0;

    for (const taskId of uniqueTaskIds) {
      const result = await this.execute({
        taskId,
        actionCode: input.actionCode,
        source: input.source,
        operatorId: input.operatorId,
        idempotencyKey: `${input.batchRequestKey}:${taskId}:${input.actionCode}`,
        metadata: {
          ...input.metadata,
          batchAction: true,
          highMemoryStartedCount,
        },
      });
      itemResults.push(result);
      if (result.code === "executed") {
        highMemoryStartedCount += 1;
      }
    }

    const successCount = itemResults.filter((item) => item.code === "executed").length;
    const failureCount = itemResults.filter((item) => item.code === "failed").length;
    const skippedCount = itemResults.filter((item) => (
      item.code === "already_processed"
      || item.code === "state_changed"
      || item.code === "forbidden"
    )).length;
    const summary = summarizeBatchResult({
      successCount,
      failureCount,
      skippedCount,
    });

    return {
      code: summary.code,
      successCount,
      failureCount,
      skippedCount,
      itemResults,
    };
  }

  async resolveRouteModelOverride(
    _taskId: string,
    row: WorkflowTaskRow,
  ): Promise<{ provider: string; model: string; temperature: number }> {
    const resolved = await resolveModel(this.resolveRouteTaskType(row));
    return {
      provider: resolved.provider,
      model: resolved.model,
      temperature: resolved.temperature,
    };
  }

  private resolveRouteTaskType(row: WorkflowTaskRow): TaskType {
    if (row.checkpointType === "replan_required" || row.currentStage?.includes("质量")) {
      return "repair";
    }
    return "planner";
  }

  private getAllowedMutationActions(row: WorkflowTaskRow): Set<AutoDirectorMutationActionCode> | null {
    const resolved = resolveAutoDirectorFollowUpReason({
      status: row.status,
      checkpointType: toCheckpointType(row.checkpointType),
      pendingManualRecovery: row.pendingManualRecovery,
      executionScopeLabel: getExecutionScopeLabel(row.seedPayloadJson),
      replacementTaskId: null,
      validationResult: extractBlockedAutoDirectorValidationResult(row.seedPayloadJson),
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
    const batchAlreadyStartedCount = typeof input.metadata?.highMemoryStartedCount === "number" && input.metadata.highMemoryStartedCount > 0
      ? input.metadata.highMemoryStartedCount
      : undefined;
    if (input.actionCode === "continue_auto_execution") {
      const continueInput: {
        continuationMode: "auto_execute_front10" | "auto_execute_range";
        batchAlreadyStartedCount?: number;
      } = {
        continuationMode: row.checkpointType === "front10_ready"
          ? "auto_execute_front10"
          : "auto_execute_range",
      };
      if (batchAlreadyStartedCount !== undefined) {
        continueInput.batchAlreadyStartedCount = batchAlreadyStartedCount;
      }
      await this.novelDirectorService.continueTask(input.taskId, continueInput);
      return this.safeGetTaskDetail(input.taskId);
    }

    if (input.actionCode === "continue_generic") {
      const continueInput: { batchAlreadyStartedCount?: number } = {};
      if (batchAlreadyStartedCount !== undefined) {
        continueInput.batchAlreadyStartedCount = batchAlreadyStartedCount;
      }
      await this.novelDirectorService.continueTask(input.taskId, continueInput);
      return this.safeGetTaskDetail(input.taskId);
    }

    if (input.actionCode === "retry_with_task_model") {
      const retryInput: {
        id: string;
        resume: true;
        batchAlreadyStartedCount?: number;
      } = {
        id: input.taskId,
        resume: true,
      };
      if (batchAlreadyStartedCount !== undefined) {
        retryInput.batchAlreadyStartedCount = batchAlreadyStartedCount;
      }
      return this.workflowTaskAdapter.retry(retryInput);
    }

    const routeModel = await this.resolveRouteModelOverride(input.taskId, row);
    const retryInput: {
      id: string;
      llmOverride: { provider: string; model: string; temperature: number };
      resume: true;
      batchAlreadyStartedCount?: number;
    } = {
      id: input.taskId,
      llmOverride: routeModel,
      resume: true,
    };
    if (batchAlreadyStartedCount !== undefined) {
      retryInput.batchAlreadyStartedCount = batchAlreadyStartedCount;
    }
    return this.workflowTaskAdapter.retry(retryInput);
  }

  private async safeGetTaskDetail(taskId: string) {
    try {
      return await this.workflowTaskAdapter.detail(taskId);
    } catch {
      return null;
    }
  }

  private async findLoggedExecution(idempotencyKey: string) {
    try {
      return await prisma.autoDirectorFollowUpActionLog.findUnique({
        where: {
          idempotencyKey,
        },
      });
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async recordActionLog(
    input: AutoDirectorActionRequest,
    result: AutoDirectorActionExecutionResult,
  ): Promise<void> {
    try {
      const existing = await prisma.autoDirectorFollowUpActionLog.findUnique({
        where: {
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        return;
      }
      await prisma.autoDirectorFollowUpActionLog.create({
        data: {
          taskId: input.taskId,
          actionCode: input.actionCode,
          sourceChannel: input.source,
          sourceUser: input.operatorId?.trim() || null,
          idempotencyKey: input.idempotencyKey,
          resultCode: result.code,
          failureReason: result.code === "failed" ? result.message : null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
          executedAt: new Date(),
        },
      });
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return;
      }
      throw error;
    }
  }
}
