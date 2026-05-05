import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import {
  ACTIVE_EXECUTION_STATUSES,
  TERMINAL_RUNTIME_STATUSES,
  buildRuntimeEventId,
  commandPriority,
  hashPayload,
  isDirectorRuntimeTableUnavailable,
  isUniqueConstraintError,
  resourceClassForCommand,
  runtimeStatusForTaskStatus,
  stableJson,
  stepTypeForCommand,
  type LegacyDirectorCommandRef,
  type RuntimeExecutionLease,
  type RuntimeLeaseInput,
} from "./DirectorRuntimeExecutionHelpers";
import { createRuntimeEvent, finishRuntimeExecutionWithError } from "./DirectorRuntimeEventPersistence";

const LEASE_CANDIDATE_BATCH_SIZE = 25;
const LEASE_CANDIDATE_SCAN_LIMIT = 250;
const STALE_RUNTIME_COMMAND_STATUSES = ["leased", "running"] as const;
const STALE_EXECUTION_RECOVERY_MESSAGE = "后台执行中断，系统会从最近进度继续。";

export { isDirectorRuntimeTableUnavailable } from "./DirectorRuntimeExecutionHelpers";
export type {
  LegacyDirectorCommandRef,
  RuntimeExecutionLease,
  RuntimeLeaseInput,
} from "./DirectorRuntimeExecutionHelpers";

export class DirectorRuntimeExecutionService {
  async ensureRuntimeCommandForLegacyCommand(command: LegacyDirectorCommandRef, options: {
    runMode?: string | null;
  } = {}) {
    try {
      return await this.ensureRuntimeCommandForLegacyCommandUnsafe(command, options);
    } catch (error) {
      if (isDirectorRuntimeTableUnavailable(error)) {
        return null;
      }
      throw error;
    }
  }

  private async ensureRuntimeCommandForLegacyCommandUnsafe(command: LegacyDirectorCommandRef, options: {
    runMode?: string | null;
  } = {}) {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: command.taskId },
      select: {
        id: true,
        novelId: true,
        status: true,
        cancelRequestedAt: true,
        seedPayloadJson: true,
      },
    });
    if (!task) {
      return null;
    }
    const run = await prisma.directorRun.findUnique({
      where: { taskId: command.taskId },
      select: { id: true },
    }).catch(() => null);
    const runtime = await this.ensureRuntimeInstance({
      taskId: task.id,
      novelId: command.novelId ?? task.novelId,
      runId: run?.id ?? null,
      runMode: options.runMode ?? null,
    });
    const payloadHash = hashPayload(command.payloadJson ?? "");
    const existingRuntimeCommand = await prisma.directorRuntimeCommand.findFirst({
      where: {
        OR: [
          { legacyCommandId: command.id },
          {
            runtimeId: runtime.id,
            commandType: command.commandType,
            idempotencyKey: command.idempotencyKey,
          },
        ],
      },
    });
    const runtimeCommand = existingRuntimeCommand
      ? await withSqliteRetry(() => prisma.directorRuntimeCommand.update({
        where: { id: existingRuntimeCommand.id },
        data: {
          legacyCommandId: command.id,
          payloadJson: command.payloadJson,
          priority: commandPriority(command.commandType),
          runAfter: existingRuntimeCommand.status === "queued" ? command.runAfter ?? new Date() : existingRuntimeCommand.runAfter,
        },
      }), { label: "director.runtime.command.update" })
      : await withSqliteRetry(() => prisma.directorRuntimeCommand.create({
        data: {
          runtimeId: runtime.id,
          workflowTaskId: command.taskId,
          novelId: command.novelId ?? task.novelId,
          legacyCommandId: command.id,
          commandType: command.commandType,
          idempotencyKey: command.idempotencyKey,
          status: "queued",
          priority: commandPriority(command.commandType),
          runAfter: command.runAfter ?? new Date(),
          payloadJson: command.payloadJson,
        },
      }), { label: "director.runtime.command.create" });
    if (runtimeCommand.status === "queued" && !TERMINAL_RUNTIME_STATUSES.includes(runtime.status as typeof TERMINAL_RUNTIME_STATUSES[number])) {
      await prisma.directorRuntimeCommand.update({
        where: { id: runtimeCommand.id },
        data: {
          errorMessage: null,
        },
      }).catch(() => null);
    }
    await createRuntimeEvent({
      runtimeId: runtime.id,
      commandId: runtimeCommand.id,
      workflowTaskId: command.taskId,
      novelId: command.novelId ?? task.novelId,
      type: "command_accepted",
      summary: "自动导演任务已进入后台执行队列。",
      severity: "low",
      metadata: {
        commandType: command.commandType,
        payloadHash,
        legacyCommandId: command.id,
      },
    });
    return {
      runtime,
      runtimeCommand,
    };
  }

  async requestRuntimeCancel(taskId: string): Promise<void> {
    const runtime = await prisma.directorRuntimeInstance.findFirst({
      where: { workflowTaskId: taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }).catch((error) => {
      if (isDirectorRuntimeTableUnavailable(error)) {
        return null;
      }
      throw error;
    });
    if (!runtime) {
      return;
    }
    const now = new Date();
    await prisma.directorRuntimeInstance.update({
      where: { id: runtime.id },
      data: {
        status: "cancelled",
        cancelRequestedAt: now,
        workerMessage: "自动导演已停止。",
        lastHeartbeatAt: now,
      },
    });
    await prisma.directorRuntimeExecution.updateMany({
      where: {
        runtimeId: runtime.id,
        status: { in: [...ACTIVE_EXECUTION_STATUSES] },
      },
      data: {
        status: "cancelled",
        activeLockKey: null,
        finishedAt: now,
        errorClass: "cancelled",
        errorMessage: "自动导演已停止。",
      },
    });
    await prisma.directorRuntimeCommand.updateMany({
      where: {
        runtimeId: runtime.id,
        status: { in: ["queued", "leased", "running"] },
      },
      data: {
        status: "cancelled",
        finishedAt: now,
        errorMessage: "自动导演已停止。",
      },
    });
    await createRuntimeEvent({
      runtimeId: runtime.id,
      workflowTaskId: taskId,
      novelId: runtime.novelId,
      type: "runtime_cancelled",
      summary: "自动导演已停止，后台执行状态已收束。",
      severity: "low",
    });
  }

  async leaseNextExecution(input: RuntimeLeaseInput): Promise<RuntimeExecutionLease | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    for (let skip = 0; skip < LEASE_CANDIDATE_SCAN_LIMIT; skip += LEASE_CANDIDATE_BATCH_SIZE) {
      const candidates = await prisma.directorRuntimeCommand.findMany({
        where: {
          status: "queued",
          runAfter: { lte: now },
        },
        orderBy: [
          { priority: "desc" },
          { runAfter: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        skip,
        take: LEASE_CANDIDATE_BATCH_SIZE,
        include: { runtime: true },
      }).catch((error) => {
        if (isDirectorRuntimeTableUnavailable(error)) {
          return [];
        }
        throw error;
      });
      if (candidates.length === 0) {
        break;
      }
      for (const candidate of candidates) {
        const leased = await this.tryLeaseCandidate(candidate.id, {
          workerId: input.workerId,
          slotId: input.slotId,
          leaseMs: input.leaseMs,
          leaseExpiresAt,
          now,
        });
        if (leased) {
          return leased;
        }
      }
      if (candidates.length < LEASE_CANDIDATE_BATCH_SIZE) {
        break;
      }
    }
    return null;
  }

  async markExecutionRunning(executionId: string, input: {
    workerId: string;
    slotId: string;
    leaseMs: number;
  }): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const execution = await prisma.directorRuntimeExecution.findUnique({
      where: { id: executionId },
      select: { runtimeId: true, commandId: true },
    });
    if (!execution) {
      return false;
    }
    const updated = await prisma.directorRuntimeExecution.updateMany({
      where: {
        id: executionId,
        workerId: input.workerId,
        slotId: input.slotId,
        status: { in: ["leased", "running"] },
      },
      data: {
        status: "running",
        startedAt: now,
        heartbeatAt: now,
        leaseExpiresAt,
      },
    });
    if (updated.count !== 1) {
      return false;
    }
    await prisma.directorRuntimeCommand.updateMany({
      where: {
        id: execution.commandId ?? "",
        status: { in: ["leased", "running"] },
      },
      data: {
        status: "running",
        startedAt: now,
        leaseExpiresAt,
      },
    });
    await prisma.directorRuntimeInstance.update({
      where: { id: execution.runtimeId },
      data: {
        status: "running",
        lastHeartbeatAt: now,
        workerMessage: "自动导演正在处理这本书。",
      },
    }).catch(() => null);
    return true;
  }

  async renewExecutionLease(executionId: string, input: {
    workerId: string;
    slotId: string;
    leaseMs: number;
  }): Promise<boolean> {
    const leaseExpiresAt = new Date(Date.now() + input.leaseMs);
    const updated = await prisma.directorRuntimeExecution.updateMany({
      where: {
        id: executionId,
        workerId: input.workerId,
        slotId: input.slotId,
        status: { in: ["leased", "running"] },
      },
      data: {
        leaseExpiresAt,
        heartbeatAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      return false;
    }
    const execution = await prisma.directorRuntimeExecution.findUnique({
      where: { id: executionId },
      select: { commandId: true, runtimeId: true },
    });
    if (execution?.commandId) {
      await prisma.directorRuntimeCommand.updateMany({
        where: { id: execution.commandId, status: { in: ["leased", "running"] } },
        data: { leaseExpiresAt },
      }).catch(() => null);
    }
    if (execution?.runtimeId) {
      await prisma.directorRuntimeInstance.update({
        where: { id: execution.runtimeId },
        data: { lastHeartbeatAt: new Date() },
      }).catch(() => null);
    }
    return true;
  }

  async markExecutionSucceeded(executionId: string): Promise<void> {
    const now = new Date();
    const execution = await prisma.directorRuntimeExecution.findUnique({
      where: { id: executionId },
      include: { command: true, runtime: true },
    });
    if (!execution) {
      return;
    }
    const task = execution.workflowTaskId
      ? await prisma.novelWorkflowTask.findUnique({
        where: { id: execution.workflowTaskId },
        select: {
          status: true,
          pendingManualRecovery: true,
          cancelRequestedAt: true,
          currentItemLabel: true,
          currentItemKey: true,
        },
      }).catch(() => null)
      : null;
    const nextVersion = execution.runtime.checkpointVersion + 1;
    await prisma.$transaction(async (tx) => {
      await tx.directorRuntimeExecution.update({
        where: { id: executionId },
        data: {
          status: "succeeded",
          activeLockKey: null,
          finishedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: null,
          errorClass: null,
          errorMessage: null,
        },
      });
      if (execution.commandId) {
        await tx.directorRuntimeCommand.update({
          where: { id: execution.commandId },
          data: {
            status: "succeeded",
            finishedAt: now,
            leaseExpiresAt: null,
            errorMessage: null,
          },
        });
      }
      await tx.directorRuntimeInstance.update({
        where: { id: execution.runtimeId },
        data: {
          status: runtimeStatusForTaskStatus({
            taskStatus: task?.status,
            pendingManualRecovery: task?.pendingManualRecovery,
            cancelRequestedAt: task?.cancelRequestedAt,
          }),
          checkpointVersion: nextVersion,
          currentStep: task?.currentItemKey ?? execution.stepType,
          lastHeartbeatAt: now,
          workerMessage: task?.currentItemLabel ?? "自动导演已保存当前进度。",
          lastErrorClass: null,
          lastErrorMessage: null,
        },
      });
      await tx.directorRuntimeCheckpoint.create({
        data: {
          runtimeId: execution.runtimeId,
          commandId: execution.commandId,
          executionId,
          version: nextVersion,
          stepType: execution.stepType,
          inputHash: execution.inputHash,
          summary: task?.currentItemLabel ?? "自动导演已保存当前进度。",
          stateJson: stableJson({
            taskStatus: task?.status ?? null,
            currentItemKey: task?.currentItemKey ?? null,
            currentItemLabel: task?.currentItemLabel ?? null,
          }),
        },
      });
      await tx.directorRuntimeEvent.create({
        data: {
          id: buildRuntimeEventId(execution.runtimeId, "execution_succeeded"),
          runtimeId: execution.runtimeId,
          commandId: execution.commandId,
          executionId,
          workflowTaskId: execution.workflowTaskId,
          novelId: execution.novelId,
          type: "execution_succeeded",
          summary: task?.currentItemLabel ?? "自动导演已保存当前进度。",
          severity: "low",
          metadataJson: stableJson({
            stepType: execution.stepType,
            legacyCommandId: execution.legacyCommandId,
          }),
          occurredAt: now,
        },
      });
    });
  }

  async markExecutionCancelled(executionId: string): Promise<void> {
    await finishRuntimeExecutionWithError(executionId, {
      status: "cancelled",
      runtimeStatus: "cancelled",
      errorClass: "cancelled",
      message: "自动导演已停止。",
      eventType: "execution_cancelled",
    });
  }

  async markExecutionFailed(executionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await finishRuntimeExecutionWithError(executionId, {
      status: "failed",
      runtimeStatus: "failed_recoverable",
      errorClass: "execution_failed",
      message,
      eventType: "execution_failed",
    });
  }

  async recoverStaleExecutions(now = new Date(), leaseMs = 120_000): Promise<number> {
    const staleExecutions = await prisma.directorRuntimeExecution.findMany({
      where: {
        status: { in: [...ACTIVE_EXECUTION_STATUSES] },
        leaseExpiresAt: { lt: now },
      },
      take: 100,
    }).catch((error) => {
      if (isDirectorRuntimeTableUnavailable(error)) {
        return [];
      }
      throw error;
    });
    for (const execution of staleExecutions) {
      await prisma.$transaction(async (tx) => {
        await tx.directorRuntimeExecution.update({
          where: { id: execution.id },
          data: {
            status: "failed",
            activeLockKey: null,
            finishedAt: now,
            errorClass: "lease_expired",
            errorMessage: "后台执行中断，系统会从最近进度继续。",
          },
        });
        if (execution.commandId) {
          await tx.directorRuntimeCommand.update({
            where: { id: execution.commandId },
            data: {
              status: "queued",
              leaseOwner: null,
              leaseExpiresAt: null,
              runAfter: new Date(now.getTime() + Math.min(leaseMs, 30_000)),
              errorMessage: "后台执行中断，系统会从最近进度继续。",
            },
          });
        }
        await tx.directorRuntimeInstance.update({
          where: { id: execution.runtimeId },
          data: {
            status: "waiting_worker",
            workerMessage: "自动导演已保存进度，等待后台执行资源接续。",
            lastHeartbeatAt: now,
          },
        });
        await tx.directorRuntimeEvent.create({
          data: {
            id: buildRuntimeEventId(execution.runtimeId, "execution_requeued"),
            runtimeId: execution.runtimeId,
            commandId: execution.commandId,
            executionId: execution.id,
            workflowTaskId: execution.workflowTaskId,
            novelId: execution.novelId,
            type: "execution_requeued",
            summary: "后台执行中断，系统会从最近进度继续。",
            severity: "medium",
            occurredAt: now,
          },
        });
      });
    }
    const orphanedCommandCount = await this.recoverOrphanedLeasedRuntimeCommands(now, leaseMs);
    return staleExecutions.length + orphanedCommandCount;
  }

  private async recoverOrphanedLeasedRuntimeCommands(now: Date, leaseMs: number): Promise<number> {
    const staleCommands = await prisma.directorRuntimeCommand.findMany({
      where: {
        status: { in: [...STALE_RUNTIME_COMMAND_STATUSES] },
        leaseExpiresAt: { lt: now },
      },
      take: 100,
      include: {
        executions: {
          where: { status: { in: [...ACTIVE_EXECUTION_STATUSES] } },
          take: 1,
        },
      },
    }).catch((error) => {
      if (isDirectorRuntimeTableUnavailable(error)) {
        return [];
      }
      throw error;
    });
    let recovered = 0;
    for (const command of staleCommands) {
      if (command.executions.length > 0) {
        continue;
      }
      const changed = await this.recoverOrphanedRuntimeCommand(command.id, now, leaseMs);
      if (changed) {
        recovered += 1;
      }
    }
    return recovered;
  }

  private async recoverOrphanedRuntimeCommand(commandId: string, now: Date, leaseMs: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const command = await tx.directorRuntimeCommand.findUnique({
        where: { id: commandId },
        include: {
          executions: {
            where: { status: { in: [...ACTIVE_EXECUTION_STATUSES] } },
            take: 1,
          },
        },
      });
      if (
        !command
        || !STALE_RUNTIME_COMMAND_STATUSES.includes(command.status as typeof STALE_RUNTIME_COMMAND_STATUSES[number])
        || !command.leaseExpiresAt
        || command.leaseExpiresAt >= now
        || command.executions.length > 0
      ) {
        return false;
      }
      const runAfter = new Date(now.getTime() + Math.min(leaseMs, 30_000));
      await tx.directorRuntimeCommand.update({
        where: { id: command.id },
        data: {
          status: "queued",
          leaseOwner: null,
          leaseExpiresAt: null,
          runAfter,
          errorMessage: STALE_EXECUTION_RECOVERY_MESSAGE,
        },
      });
      if (command.legacyCommandId) {
        await tx.directorRunCommand.updateMany({
          where: {
            id: command.legacyCommandId,
            status: { in: [...STALE_RUNTIME_COMMAND_STATUSES] },
          },
          data: {
            status: "queued",
            leaseOwner: null,
            leaseExpiresAt: null,
            runAfter,
            errorMessage: STALE_EXECUTION_RECOVERY_MESSAGE,
          },
        });
      }
      await tx.directorRuntimeInstance.update({
        where: { id: command.runtimeId },
        data: {
          status: "waiting_worker",
          workerMessage: "自动导演已保存进度，等待后台执行资源接续。",
          lastHeartbeatAt: now,
        },
      });
      await tx.directorRuntimeEvent.create({
        data: {
          id: buildRuntimeEventId(command.runtimeId, "command_requeued"),
          runtimeId: command.runtimeId,
          commandId: command.id,
          workflowTaskId: command.workflowTaskId,
          novelId: command.novelId,
          type: "command_requeued",
          summary: STALE_EXECUTION_RECOVERY_MESSAGE,
          severity: "medium",
          occurredAt: now,
        },
      });
      return true;
    });
  }

  private async ensureRuntimeInstance(input: {
    taskId: string;
    novelId?: string | null;
    runId?: string | null;
    runMode?: string | null;
  }) {
    if (input.runId) {
      const existingByRun = await prisma.directorRuntimeInstance.findFirst({
        where: { runId: input.runId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      if (existingByRun) {
        return prisma.directorRuntimeInstance.update({
          where: { id: existingByRun.id },
          data: {
            workflowTaskId: input.taskId,
            novelId: input.novelId ?? existingByRun.novelId,
            runMode: input.runMode ?? existingByRun.runMode,
            status: existingByRun.status === "cancelled" ? "waiting_worker" : existingByRun.status,
            cancelRequestedAt: null,
          },
        });
      }
    }
    const existingByTask = await prisma.directorRuntimeInstance.findFirst({
      where: { workflowTaskId: input.taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    if (existingByTask) {
      return prisma.directorRuntimeInstance.update({
        where: { id: existingByTask.id },
        data: {
          novelId: input.novelId ?? existingByTask.novelId,
          runId: input.runId ?? existingByTask.runId,
          runMode: input.runMode ?? existingByTask.runMode,
          status: existingByTask.status === "cancelled" ? "waiting_worker" : existingByTask.status,
          cancelRequestedAt: null,
        },
      });
    }
    return prisma.directorRuntimeInstance.create({
      data: {
        novelId: input.novelId,
        workflowTaskId: input.taskId,
        runId: input.runId,
        runMode: input.runMode,
        status: "waiting_worker",
        workerMessage: "自动导演等待后台执行资源。",
      },
    });
  }

  private async tryLeaseCandidate(commandId: string, input: {
    workerId: string;
    slotId: string;
    leaseMs: number;
    leaseExpiresAt: Date;
    now: Date;
  }): Promise<RuntimeExecutionLease | null> {
    try {
      return await prisma.$transaction(async (tx) => {
        const command = await tx.directorRuntimeCommand.findUnique({
          where: { id: commandId },
          include: { runtime: true },
        });
        if (!command || command.status !== "queued" || command.runAfter > input.now) {
          return null;
        }
        const activeForRuntime = await tx.directorRuntimeExecution.findFirst({
          where: {
            runtimeId: command.runtimeId,
            status: { in: [...ACTIVE_EXECUTION_STATUSES] },
          },
          select: { id: true },
        });
        if (activeForRuntime) {
          return null;
        }
        if (command.novelId) {
          const activeForNovel = await tx.directorRuntimeExecution.findFirst({
            where: {
              novelId: command.novelId,
              status: { in: [...ACTIVE_EXECUTION_STATUSES] },
            },
            select: { id: true },
          });
          if (activeForNovel) {
            return null;
          }
        }
        const claimed = await tx.directorRuntimeCommand.updateMany({
          where: { id: command.id, status: "queued" },
          data: {
            status: "leased",
            leaseOwner: `${input.workerId}:${input.slotId}`,
            leaseExpiresAt: input.leaseExpiresAt,
            attempt: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          return null;
        }
        const stepType = stepTypeForCommand(command.commandType);
        const resourceClass = resourceClassForCommand(command.commandType);
        const execution = await tx.directorRuntimeExecution.create({
          data: {
            runtimeId: command.runtimeId,
            commandId: command.id,
            workflowTaskId: command.workflowTaskId,
            novelId: command.novelId,
            legacyCommandId: command.legacyCommandId,
            activeLockKey: `runtime:${command.runtimeId}`,
            workerId: input.workerId,
            slotId: input.slotId,
            status: "leased",
            stepType,
            resourceClass,
            leaseExpiresAt: input.leaseExpiresAt,
            heartbeatAt: input.now,
            checkpointVersion: command.runtime.checkpointVersion,
            inputHash: hashPayload(command.payloadJson ?? ""),
          },
        });
        await tx.directorRuntimeInstance.update({
          where: { id: command.runtimeId },
          data: {
            status: "running",
            currentStep: stepType,
            lastHeartbeatAt: input.now,
            workerMessage: "自动导演正在处理这本书。",
          },
        });
        if (command.legacyCommandId) {
          await tx.directorRunCommand.updateMany({
            where: {
              id: command.legacyCommandId,
              status: "queued",
            },
            data: {
              status: "leased",
              leaseOwner: `${input.workerId}:${input.slotId}`,
              leaseExpiresAt: input.leaseExpiresAt,
              attempt: { increment: 1 },
            },
          });
        }
        await tx.directorRuntimeEvent.create({
          data: {
            id: buildRuntimeEventId(command.runtimeId, "execution_leased"),
            runtimeId: command.runtimeId,
            commandId: command.id,
            executionId: execution.id,
            workflowTaskId: command.workflowTaskId,
            novelId: command.novelId,
            type: "execution_leased",
            summary: "自动导演正在处理这本书。",
            severity: "low",
            metadataJson: stableJson({
              commandType: command.commandType,
              stepType,
              resourceClass,
              legacyCommandId: command.legacyCommandId,
              workerId: input.workerId,
              slotId: input.slotId,
            }),
            occurredAt: input.now,
          },
        });
        return {
          runtimeId: command.runtimeId,
          runtimeCommandId: command.id,
          executionId: execution.id,
          legacyCommandId: command.legacyCommandId,
          taskId: command.workflowTaskId,
          novelId: command.novelId,
          commandType: command.commandType,
          stepType,
          resourceClass,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return null;
      }
      throw error;
    }
  }

}
