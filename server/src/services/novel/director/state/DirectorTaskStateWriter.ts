import type { Prisma } from "@prisma/client";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import type {
  NovelWorkflowTaskUpdateArgs,
  NovelWorkflowTaskUpdateManyArgs,
} from "../../workflow/NovelWorkflowStoreService";
import {
  mergeDirectorTaskRunState,
  readDirectorTaskState,
  serializeDirectorTaskState,
  splitDirectorTaskState,
  type DirectorTaskDataView,
  type DirectorTaskState,
} from "./DirectorStateReader";

type WorkflowDelegateName =
  | "getTaskById"
  | "bootstrapTask"
  | "markTaskRunning"
  | "markTaskWaitingApproval"
  | "recordCandidateSelectionRequired"
  | "retryTask"
  | "recordCheckpoint"
  | "markTaskFailed"
  | "cancelTask"
  | "requeueTaskForRecovery"
  | "updateTaskWithRetry"
  | "updateTaskManyWithRetry";

export type DirectorTaskStateWorkflowPort = Partial<Pick<NovelWorkflowService, WorkflowDelegateName>>;

type WorkflowBootstrapInput = Parameters<NovelWorkflowService["bootstrapTask"]>[0];

export type DirectorTaskInitializationInput = Omit<WorkflowBootstrapInput, "seedPayload"> & {
  directorState?: DirectorTaskState | Record<string, unknown>;
};

export interface DirectorTaskInitializationOptions {
  replaceLaunchContract?: "takeover" | "candidate_confirmation";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function findLaunchContractConflict(
  current: DirectorTaskState,
  incoming: DirectorTaskState,
  allowMissingFields: boolean,
): string | null {
  const currentLaunch = current.launch as unknown as Record<string, unknown>;
  // Candidate-generation tasks can predate the final novel input. A missing
  // contract field may be finalized only before the task is bound to a novel.
  // Unknown legacy payload is compatibility context, not a typed contract.
  for (const [key, value] of Object.entries(incoming.launch)) {
    if (key === "legacyContext") continue;
    if (currentLaunch[key] === undefined && allowMissingFields) continue;
    if (value !== undefined && stableJson(currentLaunch[key]) !== stableJson(value)) {
      return key;
    }
  }
  return null;
}

function assertPreservesManualRecoveryLock(data: { pendingManualRecovery?: unknown } | undefined): void {
  const value = data?.pendingManualRecovery;
  if (value === false
    || (typeof value === "object" && value !== null && (value as { set?: unknown }).set === false)) {
    throw new Error("Use clearPendingManualRecovery with a user command id to clear the recovery lock.");
  }
}

function mergeLaunchState(
  current: DirectorTaskState["launch"],
  incoming: DirectorTaskState["launch"],
): DirectorTaskState["launch"] {
  return {
    ...current,
    ...incoming,
    legacyContext: { ...current.legacyContext, ...incoming.legacyContext },
  };
}

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

  async initializeTask(
    input: DirectorTaskInitializationInput,
    options: DirectorTaskInitializationOptions = {},
  ) {
    if (!this.workflowService.bootstrapTask) throw new Error("Task state workflow port does not support initialization.");
    const directorStateInput = input.directorState;
    let directorState = directorStateInput
      ? ("launch" in directorStateInput && "run" in directorStateInput
          ? directorStateInput as DirectorTaskState
          : splitDirectorTaskState(directorStateInput))
      : undefined;
    const workflowTaskId = input.workflowTaskId?.trim();
    let replacePersistedState = false;
    if (workflowTaskId && directorState && this.workflowService.getTaskById) {
      const currentTask = await this.workflowService.getTaskById(workflowTaskId);
      if (options.replaceLaunchContract === "candidate_confirmation"
        && (currentTask?.lane !== "auto_director" || currentTask.novelId !== null)) {
        throw new Error("Candidate confirmation can replace the launch contract only for an unbound auto director task.");
      }
      if (currentTask?.lane === "auto_director") {
        const currentState = readDirectorTaskState(currentTask);
        const mayReplaceLaunchContract = options.replaceLaunchContract === "takeover"
          || (options.replaceLaunchContract === "candidate_confirmation" && currentTask.novelId === null);
        const launchConflict = mayReplaceLaunchContract
          ? null
          : findLaunchContractConflict(currentState, directorState, currentTask.novelId === null);
        if (launchConflict) {
          throw new Error(`Director launch contract is immutable after task creation (${launchConflict}).`);
        }
        directorState = {
          launch: mayReplaceLaunchContract
            ? directorState.launch
            : mergeLaunchState(currentState.launch, directorState.launch),
          run: { ...currentState.run, ...directorState.run },
        };
        replacePersistedState = mayReplaceLaunchContract;
      }
    }
    const { directorState: _directorState, ...bootstrapInput } = input;
    const request = directorState
      ? {
        ...bootstrapInput,
        seedPayload: JSON.parse(serializeDirectorTaskState(directorState)) as Record<string, unknown>,
      }
      : bootstrapInput;
    return replacePersistedState
      ? this.workflowService.bootstrapTask(request, { replaceSeedPayload: true })
      : this.workflowService.bootstrapTask(request);
  }

  markRunning(...args: Parameters<NovelWorkflowService["markTaskRunning"]>) {
    if (!this.workflowService.markTaskRunning) throw new Error("Task state workflow port does not support running updates.");
    return this.workflowService.markTaskRunning(...args);
  }

  markWaitingCheckpoint(...args: Parameters<NovelWorkflowService["markTaskWaitingApproval"]>) {
    if (!this.workflowService.markTaskWaitingApproval) throw new Error("Task state workflow port does not support checkpoint updates.");
    return this.workflowService.markTaskWaitingApproval(...args);
  }

  markCandidateSelectionRequired(...args: Parameters<NovelWorkflowService["recordCandidateSelectionRequired"]>) {
    if (!this.workflowService.recordCandidateSelectionRequired) throw new Error("Task state workflow port does not support candidate checkpoints.");
    return this.workflowService.recordCandidateSelectionRequired(...args);
  }

  retryTask(...args: Parameters<NovelWorkflowService["retryTask"]>) {
    if (!this.workflowService.retryTask) throw new Error("Task state workflow port does not support retries.");
    return this.workflowService.retryTask(...args);
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
    assertPreservesManualRecoveryLock(args.data);
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

  async updateDirectorRunState(
    taskId: string,
    patch: Partial<DirectorTaskState["run"]>,
    taskData?: Partial<NovelWorkflowTaskUpdateArgs["data"]>,
    options?: DirectorTaskStateWriteOptions,
  ) {
    assertPreservesManualRecoveryLock(taskData);
    if (!this.workflowService.getTaskById) throw new Error("Task state workflow port does not support task reads.");
    if (!this.workflowService.updateTaskWithRetry) throw new Error("Task state workflow port does not support task updates.");
    const currentTask = await this.workflowService.getTaskById(taskId);
    if (!currentTask || currentTask.lane !== "auto_director") {
      throw new Error("Auto director task was not found.");
    }
    const currentState = readDirectorTaskState(currentTask);
    const nextState: DirectorTaskState = {
      launch: currentState.launch,
      run: mergeDirectorTaskRunState(currentState.run, patch),
    };
    return this.workflowService.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        ...taskData,
        seedPayloadJson: serializeDirectorTaskState(nextState),
      } as NovelWorkflowTaskUpdateArgs["data"],
    }, options?.transaction);
  }

  async updateDirectorRunStateMany(
    args: NovelWorkflowTaskUpdateManyArgs,
    patch: Partial<DirectorTaskState["run"]>,
    options?: DirectorTaskStateWriteOptions,
  ) {
    assertPreservesManualRecoveryLock(args.data);
    if (!this.workflowService.getTaskById) throw new Error("Task state workflow port does not support task reads.");
    if (!this.workflowService.updateTaskManyWithRetry) throw new Error("Task state workflow port does not support task updates.");
    const taskId = typeof args.where?.id === "string" ? args.where.id : null;
    if (!taskId) throw new Error("Updating director run state many requires one task id.");
    const currentTask = await this.workflowService.getTaskById(taskId);
    if (!currentTask || currentTask.lane !== "auto_director") {
      throw new Error("Auto director task was not found.");
    }
    const currentState = readDirectorTaskState(currentTask);
    const nextState: DirectorTaskState = {
      launch: currentState.launch,
      run: mergeDirectorTaskRunState(currentState.run, patch),
    };
    return this.workflowService.updateTaskManyWithRetry({
      ...args,
      data: {
        ...args.data,
        seedPayloadJson: serializeDirectorTaskState(nextState),
      },
    }, options?.transaction);
  }

  async updateDirectorRunStateFromTaskData(
    taskId: string,
    directorTaskData: DirectorTaskDataView,
    taskData?: Partial<NovelWorkflowTaskUpdateArgs["data"]>,
    options?: DirectorTaskStateWriteOptions,
  ) {
    assertPreservesManualRecoveryLock(taskData);
    if (!this.workflowService.getTaskById) throw new Error("Task state workflow port does not support task reads.");
    const currentTask = await this.workflowService.getTaskById(taskId);
    if (!currentTask || currentTask.lane !== "auto_director") {
      throw new Error("Auto director task was not found.");
    }
    const currentState = readDirectorTaskState(currentTask);
    const incomingState = splitDirectorTaskState(directorTaskData);
    const { resumeTarget, directorRuntime: _directorRuntime, ...runPatch } = incomingState.run;
    const persistenceData: Partial<NovelWorkflowTaskUpdateArgs["data"]> = { ...taskData };
    if (Object.prototype.hasOwnProperty.call(directorTaskData, "resumeTarget")
      && !Object.prototype.hasOwnProperty.call(persistenceData, "resumeTargetJson")) {
      persistenceData.resumeTargetJson = resumeTarget ? JSON.stringify(resumeTarget) : null;
    }
    return this.updateDirectorRunState(taskId, runPatch, persistenceData, options);
  }
}
