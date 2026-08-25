import crypto from "node:crypto";
import { prisma } from "../../../../../db/prisma";
import { taskDispatcher } from "../../../../../workers/TaskDispatcher";
import { NovelWorkflowService } from "../../../workflow/NovelWorkflowService";
import { directorIssueService, loadDirectorIssueTaskContext } from "../../issues";
import { parsePayload, resolveNumberEnv } from "../DirectorCommandServiceHelpers";

const DEFAULT_STALE_AUTO_RECOVERY_MAX_ATTEMPTS = 2;
const STALE_COMMAND_AUTO_RECOVERY_MESSAGE = "后台执行中断，系统已自动从最近进度继续。";
const STALE_COMMAND_MANUAL_RECOVERY_MESSAGE = "后台执行中断，任务已暂停。点击恢复后会从最近进度继续。";
const STALE_COMMAND_INTERNAL_MESSAGE = "Director Worker 租约过期，任务等待恢复。";
const CANCELLED_COMMAND_MESSAGE = "自动导演任务已取消。";

function isAutoRecoverableStaleCommand(command: {
  commandType: string;
  attempt: number;
  payloadJson?: string | null;
}): boolean {
  const defaultMaxAttempts = resolveNumberEnv(
    "DIRECTOR_WORKER_STALE_AUTO_RECOVERY_MAX_ATTEMPTS",
    DEFAULT_STALE_AUTO_RECOVERY_MAX_ATTEMPTS,
  );
  const payload = parsePayload(command.payloadJson ?? null);
  const payloadRunMode = payload.confirmRequest?.runMode ?? payload.takeoverRequest?.runMode ?? null;
  const isFullBookAutopilot = payloadRunMode === "full_book_autopilot";
  const maxAttempts = isFullBookAutopilot
    ? resolveNumberEnv(
      "DIRECTOR_WORKER_FULL_BOOK_STALE_AUTO_RECOVERY_MAX_ATTEMPTS",
      Math.max(defaultMaxAttempts, 5),
    )
    : defaultMaxAttempts;
  return command.attempt < maxAttempts
    && (
      isFullBookAutopilot
      || command.commandType === "continue"
      || command.commandType === "resume_from_checkpoint"
    );
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
        payloadJson: true,
      },
    });
    for (const command of staleCommands) {
      const autoRecoverable = isAutoRecoverableStaleCommand(command);
      const governance = await loadDirectorIssueTaskContext(command.taskId);
      let actionApplied = false;
      const applyAction = async (action: "auto_retry" | "continue_with_warning" | "pause_for_manual" | "fail_task") => {
        if (action === "auto_retry" || action === "continue_with_warning") {
          await prisma.directorRunCommand.updateMany({
            where: { id: command.id },
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
            where: { id: command.taskId },
            data: {
              status: "queued",
              pendingManualRecovery: false,
              lastError: null,
              heartbeatAt: now,
              finishedAt: null,
            },
          });
          taskDispatcher.notify();
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
        await applyAction(autoRecoverable ? "auto_retry" : "pause_for_manual");
        continue;
      }
      await directorIssueService.reportIssue({
        issueGovernanceVersion: governance.issueGovernanceVersion,
        taskId: command.taskId,
        novelId: governance.novelId,
        issueCode: "runtime.worker_stale",
        stage: "director_worker",
        summary: autoRecoverable ? STALE_COMMAND_AUTO_RECOVERY_MESSAGE : STALE_COMMAND_MANUAL_RECOVERY_MESSAGE,
        evidence: `command=${command.commandType}; attempt=${command.attempt}`,
        attempt: command.attempt,
        hasUsableOutput: false,
        runMode: governance.runMode,
        fingerprint: ["worker_stale", command.id, command.attempt].join(":"),
        policy: governance.policy,
        policySource: governance.policySource,
        applyAction: (decision) => applyAction(decision.action),
      }).catch(async () => {
        if (!actionApplied) await applyAction(autoRecoverable ? "auto_retry" : "pause_for_manual");
      });
    }
    return staleCommands.length;
  }

  async leaseNextCommand(input: { workerId: string; leaseMs: number }) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: { status: "queued", runAfter: { lte: now } },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) return null;
    const claimed = await prisma.directorRunCommand.updateMany({
      where: { id: candidate.id, status: "queued" },
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
