import crypto from "node:crypto";
import { prisma } from "../../../../../db/prisma";
import { taskDispatcher } from "../../../../../workers/TaskDispatcher";
import { NovelWorkflowService } from "../../../workflow/NovelWorkflowService";
import { directorIssueService, loadDirectorIssueTaskContext } from "../../issues";

const STALE_COMMAND_AUTO_RECOVERY_MESSAGE = "后台执行中断，系统已自动从最近进度继续。";
const STALE_COMMAND_MANUAL_RECOVERY_MESSAGE = "后台执行中断，任务已暂停。点击恢复后会从最近进度继续。";
const STALE_COMMAND_INTERNAL_MESSAGE = "Director Worker 租约过期，任务等待恢复。";
const CANCELLED_COMMAND_MESSAGE = "自动导演任务已取消。";

interface DirectorLeaseRecoveryState {
  taskPendingManualRecovery: boolean;
  linkedPipelineJob: {
    id: string;
    status: string;
    pendingManualRecovery: boolean;
    cancelRequestedAt: Date | null;
    error: string | null;
  } | null;
}

function parseLinkedPipelineJobId(seedPayloadJson: string | null): string | null {
  if (!seedPayloadJson?.trim()) return null;
  const seed = JSON.parse(seedPayloadJson) as { autoExecution?: { pipelineJobId?: unknown } };
  const value = seed.autoExecution?.pipelineJobId;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid linked pipeline job id.");
  }
  return value.trim();
}

function parsePipelineWorkflowTaskId(payload: string | null): string | null {
  if (!payload?.trim()) return null;
  const value = (JSON.parse(payload) as { workflowTaskId?: unknown }).workflowTaskId;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid pipeline workflow task id.");
  }
  return value.trim();
}

export class DirectorCommandLeaseService {
  constructor(private readonly workflowService: NovelWorkflowService) {}

  async recoverStaleLeases(now = new Date(), options: { taskId?: string } = {}): Promise<number> {
    const staleCommands = await prisma.directorRunCommand.findMany({
      where: {
        ...(options.taskId ? { taskId: options.taskId } : {}),
        status: { in: ["leased", "running"] },
        leaseExpiresAt: { lt: now },
      },
      select: {
        id: true,
        taskId: true,
        commandType: true,
        attempt: true,
      },
    });
    for (const command of staleCommands) {
      let recoveryState: DirectorLeaseRecoveryState | null;
      try {
        recoveryState = await this.loadRecoveryState(command.taskId);
      } catch {
        await this.markCommandWaitingForManualRecovery(
          command.id,
          command.taskId,
          now,
          "无法确认章节流水线的恢复状态，任务已暂停以避免重复调用。",
        );
        continue;
      }
      if (recoveryState?.taskPendingManualRecovery || recoveryState?.linkedPipelineJob?.pendingManualRecovery) {
        await this.markCommandWaitingForManualRecovery(
          command.id,
          command.taskId,
          now,
          recoveryState.taskPendingManualRecovery
            ? null
            : recoveryState.linkedPipelineJob?.error ?? STALE_COMMAND_MANUAL_RECOVERY_MESSAGE,
        );
        continue;
      }
      if (this.canReattachToPipeline(recoveryState?.linkedPipelineJob ?? null)) {
        await this.requeueCommandWithoutClearingPause(command.id, command.taskId, now);
        continue;
      }
      const governance = await loadDirectorIssueTaskContext(command.taskId).catch(() => null);
      let actionApplied = false;
      const applyAction = async (action: "auto_retry" | "continue_with_warning" | "pause_for_manual" | "fail_task") => {
        if (action === "auto_retry" || action === "continue_with_warning") {
          await this.requeueCommandWithoutClearingPause(command.id, command.taskId, now);
          actionApplied = true;
          return;
        }
        await prisma.directorRunCommand.updateMany({
          where: { id: command.id },
          data: {
            status: action === "fail_task" ? "failed" : "stale",
            finishedAt: now,
            errorMessage: STALE_COMMAND_INTERNAL_MESSAGE,
          },
        });
        await prisma.directorStepRun.updateMany({
          where: { taskId: command.taskId, status: "running" },
          data: { status: "failed", finishedAt: now, error: STALE_COMMAND_INTERNAL_MESSAGE },
        }).catch(() => null);
        if (action === "fail_task") {
          await this.workflowService.markTaskFailed(command.taskId, STALE_COMMAND_INTERNAL_MESSAGE);
        } else {
          await this.workflowService.requeueTaskForRecovery(command.taskId, STALE_COMMAND_MANUAL_RECOVERY_MESSAGE);
        }
        actionApplied = true;
      };

      if (!governance?.novelId) {
        await applyAction("pause_for_manual");
        continue;
      }
      await directorIssueService.reportIssue({
        issueGovernanceVersion: governance.issueGovernanceVersion,
        taskId: command.taskId,
        novelId: governance.novelId,
        issueCode: "runtime.worker_stale",
        stage: "director_worker",
        summary: STALE_COMMAND_MANUAL_RECOVERY_MESSAGE,
        evidence: `command=${command.commandType}; attempt=${command.attempt}`,
        attempt: Math.max(0, command.attempt - 1),
        hasUsableOutput: false,
        runMode: governance.runMode,
        fingerprint: ["worker_stale", command.id, command.attempt].join(":"),
        policy: governance.policy,
        policySource: governance.policySource,
        applyAction: (decision) => applyAction(decision.action),
      }).catch(async () => {
        if (!actionApplied) await applyAction("pause_for_manual");
      });
    }
    return staleCommands.length;
  }

  private async loadRecoveryState(taskId: string): Promise<DirectorLeaseRecoveryState | null> {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: {
        novelId: true,
        pendingManualRecovery: true,
        seedPayloadJson: true,
      },
    });
    if (!task) return null;
    const pipelineJobId = parseLinkedPipelineJobId(task.seedPayloadJson);
    if (!pipelineJobId) {
      return { taskPendingManualRecovery: task.pendingManualRecovery, linkedPipelineJob: null };
    }
    const job = await prisma.generationJob.findUnique({
      where: { id: pipelineJobId },
      select: {
        id: true,
        novelId: true,
        status: true,
        pendingManualRecovery: true,
        cancelRequestedAt: true,
        error: true,
        payload: true,
      },
    });
    if (!job) {
      throw new Error("Linked pipeline job does not exist.");
    }
    if (job.novelId !== task.novelId) {
      throw new Error("Linked pipeline job belongs to another novel.");
    }
    const payloadTaskId = parsePipelineWorkflowTaskId(job.payload);
    if (payloadTaskId && payloadTaskId !== taskId) {
      throw new Error("Linked pipeline job belongs to another workflow task.");
    }
    return {
      taskPendingManualRecovery: task.pendingManualRecovery,
      linkedPipelineJob: job,
    };
  }

  private canReattachToPipeline(
    job: DirectorLeaseRecoveryState["linkedPipelineJob"],
  ): boolean {
    return Boolean(
      job
      && !job.pendingManualRecovery
      && !job.cancelRequestedAt
      && ["queued", "running", "succeeded"].includes(job.status),
    );
  }

  private async requeueCommandWithoutClearingPause(
    commandId: string,
    taskId: string,
    now: Date,
  ): Promise<void> {
    await prisma.directorRunCommand.updateMany({
      where: { id: commandId, status: { in: ["leased", "running"] } },
      data: {
        status: "queued",
        leaseOwner: null,
        leaseExpiresAt: null,
        runAfter: now,
        startedAt: null,
        finishedAt: null,
        errorMessage: STALE_COMMAND_AUTO_RECOVERY_MESSAGE,
      },
    });
    await prisma.novelWorkflowTask.updateMany({
      where: {
        id: taskId,
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
      },
      data: {
        status: "queued",
        lastError: null,
        heartbeatAt: now,
        finishedAt: null,
      },
    });
    taskDispatcher.notify();
  }

  private async markCommandWaitingForManualRecovery(
    commandId: string,
    taskId: string,
    now: Date,
    recoveryMessage: string | null,
  ): Promise<void> {
    await prisma.directorRunCommand.updateMany({
      where: { id: commandId, status: { in: ["leased", "running"] } },
      data: {
        status: "stale",
        leaseOwner: null,
        leaseExpiresAt: null,
        finishedAt: now,
        errorMessage: STALE_COMMAND_INTERNAL_MESSAGE,
      },
    });
    await prisma.directorStepRun.updateMany({
      where: { taskId, status: "running" },
      data: { status: "failed", finishedAt: now, error: STALE_COMMAND_INTERNAL_MESSAGE },
    }).catch(() => null);
    if (recoveryMessage) {
      await this.workflowService.requeueTaskForRecovery(taskId, recoveryMessage);
    }
  }

  async leaseNextCommand(input: { workerId: string; leaseMs: number }) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: now },
        task: { status: { in: ["queued", "running"] }, pendingManualRecovery: false },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) return null;
    const claimed = await prisma.directorRunCommand.updateMany({
      where: {
        id: candidate.id,
        status: "queued",
        task: { status: { in: ["queued", "running"] }, pendingManualRecovery: false },
      },
      data: {
        status: "leased",
        leaseOwner: input.workerId,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    return prisma.directorRunCommand.findUnique({ where: { id: candidate.id } });
  }

  async markCommandRunning(commandId: string, workerId: string, leaseMs: number): Promise<void> {
    const now = new Date();
    await prisma.directorRunCommand.updateMany({
      where: { id: commandId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: { status: "running", startedAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
    });
  }

  async renewLease(commandId: string, workerId: string, leaseMs: number): Promise<boolean> {
    const updated = await prisma.directorRunCommand.updateMany({
      where: { id: commandId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
    });
    return updated.count === 1;
  }

  async markCommandSucceeded(commandId: string, workerId: string): Promise<void> {
    await prisma.directorRunCommand.updateMany({
      where: { id: commandId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: {
        status: "succeeded",
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async markCommandCancelled(commandId: string, workerId: string): Promise<void> {
    const finishedAt = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: { id: commandId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: {
        status: "cancelled",
        leaseExpiresAt: null,
        finishedAt,
        errorMessage: CANCELLED_COMMAND_MESSAGE,
      },
    });
    if (updated.count !== 1) return;
    const command = await prisma.directorRunCommand.findUnique({ where: { id: commandId } });
    if (command) await this.closeCancelledTaskRuntimeState(command.taskId, finishedAt);
  }

  async markCommandFailed(commandId: string, workerId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: { id: commandId, leaseOwner: workerId, status: { in: ["leased", "running"] } },
      data: {
        status: "failed",
        leaseExpiresAt: null,
        finishedAt: failedAt,
        errorMessage: message,
      },
    });
    if (updated.count !== 1) return;
    const command = await prisma.directorRunCommand.findUnique({ where: { id: commandId } });
    if (!command) return;
    await prisma.directorStepRun.updateMany({
      where: { taskId: command.taskId, status: "running" },
      data: { status: "failed", finishedAt: failedAt, error: message },
    }).catch(() => null);
    await this.workflowService.requeueTaskForRecovery(command.taskId, message).catch(() => null);
  }

  async closeCancelledTaskRuntimeState(taskId: string, now: Date): Promise<void> {
    await prisma.directorStepRun.updateMany({
      where: { taskId, status: "running" },
      data: { status: "failed", finishedAt: now, error: CANCELLED_COMMAND_MESSAGE },
    }).catch(() => null);
    await prisma.generationJob.updateMany({
      where: { status: { in: ["queued", "running"] }, payload: { contains: taskId } },
      data: {
        status: "cancelled",
        cancelRequestedAt: now,
        finishedAt: now,
        error: CANCELLED_COMMAND_MESSAGE,
      },
    }).catch(() => null);
    const run = await prisma.directorRun.findUnique({
      where: { taskId },
      select: { id: true, novelId: true },
    }).catch(() => null);
    if (!run) return;
    await prisma.directorEvent.create({
      data: {
        id: `${taskId}:run_cancelled:${crypto.randomUUID()}`,
        runId: run.id,
        taskId,
        novelId: run.novelId,
        type: "run_cancelled",
        summary: "自动导演已停止，后台运行状态已收束。",
        severity: "low",
        occurredAt: now,
      },
    }).catch(() => null);
  }
}
