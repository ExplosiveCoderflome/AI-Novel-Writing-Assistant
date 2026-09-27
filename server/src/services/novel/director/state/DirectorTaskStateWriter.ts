import type { Prisma } from "@prisma/client";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import type {
  NovelWorkflowTaskUpdateArgs,
  NovelWorkflowTaskUpdateManyArgs,
} from "../../workflow/NovelWorkflowStoreService";

type WorkflowDelegateName =
  | "bootstrapTask"
  | "markTaskRunning"
  | "markTaskWaitingApproval"
  | "recordCheckpoint"
  | "markTaskFailed"
  | "cancelTask"
  | "requeueTaskForRecovery"
  | "updateTaskWithRetry"
  | "updateTaskManyWithRetry";

export type DirectorTaskStateWorkflowPort = Partial<Pick<NovelWorkflowService, WorkflowDelegateName>>;

export interface DirectorTaskStateWriteOptions {
  transaction?: Prisma.TransactionClient;
}

export interface ClearPendingManualRecoveryInput {
  userCommandId: string;
  where: NovelWorkflowTaskUpdateManyArgs["where"];
  data?: Omit<NovelWorkflowTaskUpdateManyArgs["data"], "pendingManualRecovery">;
}

export class DirectorTaskStateWriter {
  constructor(private readonly workflowService: DirectorTaskStateWorkflowPort = new NovelWorkflowService()) {}

  initializeTask(...args: Parameters<NovelWorkflowService["bootstrapTask"]>) {
    if (!this.workflowService.bootstrapTask) throw new Error("Task state workflow port does not support initialization.");
    return this.workflowService.bootstrapTask(...args);
  }

  markRunning(...args: Parameters<NovelWorkflowService["markTaskRunning"]>) {
    if (!this.workflowService.markTaskRunning) throw new Error("Task state workflow port does not support running updates.");
    return this.workflowService.markTaskRunning(...args);
  }

  markWaitingCheckpoint(...args: Parameters<NovelWorkflowService["markTaskWaitingApproval"]>) {
    if (!this.workflowService.markTaskWaitingApproval) throw new Error("Task state workflow port does not support checkpoint updates.");
    return this.workflowService.markTaskWaitingApproval(...args);
  }

  persistCheckpoint(...args: Parameters<NovelWorkflowService["recordCheckpoint"]>) {
    if (!this.workflowService.recordCheckpoint) throw new Error("Task state workflow port does not support checkpoint persistence.");
    if (args[1].checkpointType === "workflow_completed") {
      return this.markCompleted(args[0], args[1]);
    }
    return this.workflowService.recordCheckpoint(...args);
  }

  markFailed(...args: Parameters<NovelWorkflowService["markTaskFailed"]>) {
    if (!this.workflowService.markTaskFailed) throw new Error("Task state workflow port does not support failure updates.");
    return this.workflowService.markTaskFailed(...args);
  }

  markCompleted(
    taskId: string,
    input: Parameters<NovelWorkflowService["recordCheckpoint"]>[1],
  ) {
    if (!this.workflowService.recordCheckpoint) throw new Error("Task state workflow port does not support completion checkpoints.");
    return this.workflowService.recordCheckpoint(taskId, {
      ...input,
      checkpointType: "workflow_completed",
    });
  }

  markCancelled(taskId: string) {
    if (!this.workflowService.cancelTask) throw new Error("Task state workflow port does not support cancellation.");
    return this.workflowService.cancelTask(taskId);
  }

  markPendingManualRecovery(
    taskId: string,
    message: string,
    patch?: Parameters<NovelWorkflowService["requeueTaskForRecovery"]>[2],
  ) {
    if (!this.workflowService.requeueTaskForRecovery) throw new Error("Task state workflow port does not support manual recovery pauses.");
    return this.workflowService.requeueTaskForRecovery(taskId, message, patch);
  }

  clearPendingManualRecovery(
    input: ClearPendingManualRecoveryInput,
    options?: DirectorTaskStateWriteOptions,
  ) {
    if (typeof input?.userCommandId !== "string" || input.userCommandId.trim().length === 0) {
      throw new Error("Clearing pending manual recovery requires a user command id.");
    }
    if (!this.workflowService.updateTaskManyWithRetry) throw new Error("Task state workflow port does not support task updates.");
    return this.workflowService.updateTaskManyWithRetry({
      where: input.where,
      data: {
        ...input.data,
        pendingManualRecovery: false,
      },
    }, options?.transaction);
  }

  updateRunState(
    args: NovelWorkflowTaskUpdateArgs,
    options?: DirectorTaskStateWriteOptions & { many?: false },
  ): ReturnType<NovelWorkflowService["updateTaskWithRetry"]>;
  updateRunState(
    args: NovelWorkflowTaskUpdateManyArgs,
    options: DirectorTaskStateWriteOptions & { many: true },
  ): ReturnType<NovelWorkflowService["updateTaskManyWithRetry"]>;
  updateRunState(
    args: NovelWorkflowTaskUpdateArgs | NovelWorkflowTaskUpdateManyArgs,
    options?: DirectorTaskStateWriteOptions & { many?: boolean },
  ) {
    const pendingManualRecovery = (args.data as { pendingManualRecovery?: unknown }).pendingManualRecovery;
    const requestsManualRecoveryClear = pendingManualRecovery === false
      || (
        typeof pendingManualRecovery === "object"
        && pendingManualRecovery !== null
        && (pendingManualRecovery as { set?: unknown }).set === false
      );
    if (requestsManualRecoveryClear) {
      throw new Error("Use clearPendingManualRecovery with a user command id to clear the recovery lock.");
    }
    if (options?.many) {
      if (!this.workflowService.updateTaskManyWithRetry) throw new Error("Task state workflow port does not support task updates.");
      return this.workflowService.updateTaskManyWithRetry(
        args as NovelWorkflowTaskUpdateManyArgs,
        options.transaction,
      );
    }
    if (!this.workflowService.updateTaskWithRetry) throw new Error("Task state workflow port does not support task updates.");
    return this.workflowService.updateTaskWithRetry(
      args as NovelWorkflowTaskUpdateArgs,
      options?.transaction,
    );
  }
}
