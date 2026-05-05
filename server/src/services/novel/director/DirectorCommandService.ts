import crypto from "node:crypto";
import type {
  DirectorCommandAcceptedResponse,
  DirectorRuntimePolicyUpdateRequest,
  DirectorRunCommandStatus,
  DirectorRunCommandType,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorCandidatePatchRequest,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidatesRequest,
  DirectorConfirmRequest,
  DirectorLLMOptions,
  DirectorRefinementRequest,
  DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { AppError } from "../../../middleware/errorHandler";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  applyDirectorRunModeContract,
  buildDirectorSessionState,
  buildDirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import { parseSeedPayload } from "../workflow/novelWorkflow.shared";
import { DirectorRuntimeExecutionService } from "./DirectorRuntimeExecutionService";
import {
  buildAcceptedTaskState,
  hashPayload,
  isUniqueConstraintError,
  parsePayload,
  resolveNumberEnv,
  stableJson,
  toAcceptedResponse,
  type DirectorCommandPayload,
} from "./DirectorCommandServiceHelpers";
import { taskDispatcher } from "../../../workers/TaskDispatcher";

const ACTIVE_COMMAND_STATUSES: DirectorRunCommandStatus[] = ["queued", "leased", "running"];
const EXECUTION_COMMAND_TYPES: DirectorRunCommandType[] = [
  "generate_candidates",
  "refine_candidates",
  "patch_candidate",
  "refine_titles",
  "confirm_candidate",
  "continue",
  "resume_from_checkpoint",
  "retry",
  "takeover",
  "approve_gate",
  "policy_update",
  "workspace_analysis",
  "manual_edit_impact",
  "repair_chapter_titles",
];

export type DirectorRunCommandRow = Awaited<ReturnType<DirectorCommandService["getCommandById"]>>;

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

export class DirectorCommandService {
  constructor(
    private readonly workflowService = new NovelWorkflowService(),
    private readonly runtimeExecutionService = new DirectorRuntimeExecutionService(),
  ) {}

  async enqueueGenerateCandidatesCommand(input: DirectorCandidatesRequest): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.ensureCandidateTask(input, {
      mode: "generate",
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "generate_candidates",
      payload: {
        candidatesRequest: {
          ...input,
          workflowTaskId: task.id,
        },
      },
    });
  }

  async enqueueRefineCandidatesCommand(input: DirectorRefinementRequest): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.ensureCandidateTask(input, {
      mode: "refine",
      presets: input.presets ?? [],
      feedback: input.feedback ?? null,
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "refine_candidates",
      payload: {
        refinementRequest: {
          ...input,
          workflowTaskId: task.id,
        },
      },
    });
  }

  async enqueuePatchCandidateCommand(input: DirectorCandidatePatchRequest): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.ensureCandidateTask(input, {
      mode: "patch_candidate",
      batchId: input.batchId,
      candidateId: input.candidateId,
      presets: input.presets ?? [],
      feedback: input.feedback,
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "patch_candidate",
      payload: {
        candidatePatchRequest: {
          ...input,
          workflowTaskId: task.id,
        },
      },
    });
  }

  async enqueueRefineTitlesCommand(input: DirectorCandidateTitleRefineRequest): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.ensureCandidateTask(input, {
      mode: "refine_titles",
      batchId: input.batchId,
      candidateId: input.candidateId,
      feedback: input.feedback,
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "refine_titles",
      payload: {
        titleRefineRequest: {
          ...input,
          workflowTaskId: task.id,
        },
      },
    });
  }

  async enqueueConfirmCandidateCommand(input: DirectorConfirmRequest): Promise<DirectorCommandAcceptedResponse> {
    const confirmedInput = applyDirectorRunModeContract(input);
    const runMode = confirmedInput.runMode;
    const task = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.candidate.workingTitle.trim() || input.title?.trim() || "自动导演开书",
      seedPayload: buildDirectorWorkflowSeedPayload(confirmedInput, null, {
        directorSession: buildDirectorSessionState({
          runMode,
          phase: "candidate_selection",
          isBackgroundRunning: false,
        }),
      }),
      initialState: {
        stage: "auto_director",
        itemKey: "candidate_confirm",
        itemLabel: "绛夊緟鍒涘缓灏忚椤圭洰",
        progress: 0.18,
      },
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "confirm_candidate",
      payload: {
        confirmRequest: {
          ...confirmedInput,
          workflowTaskId: task.id,
        },
      },
    });
  }

  async enqueueContinueCommand(taskId: string, input: DirectorCommandPayload = {}): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "continue",
      payload: input,
    });
  }

  async enqueueApproveGateCommand(taskId: string, input: DirectorCommandPayload = {}): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "approve_gate",
      payload: {
        ...input,
        continuationMode: "resume",
        forceResume: true,
      },
    });
  }

  async enqueuePolicyUpdateCommand(taskId: string, input: DirectorRuntimePolicyUpdateRequest): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "policy_update",
      payload: {
        policyUpdateRequest: input,
      },
    });
  }

  async enqueueWorkspaceAnalysisCommand(input: {
    novelId: string;
    workflowTaskId?: string | null;
    includeAiInterpretation?: boolean;
  }): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId?.trim() || undefined,
      novelId: input.novelId,
      lane: "auto_director",
      title: "AI 自动导演工作区分析",
      initialState: {
        stage: "auto_director",
        itemKey: "workspace_analysis",
        itemLabel: "AI 正在检查当前小说产物和可继续状态",
        progress: 0.08,
      },
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "workspace_analysis",
      payload: {
        workspaceAnalysisRequest: {
          novelId: input.novelId,
          workflowTaskId: task.id,
          includeAiInterpretation: input.includeAiInterpretation,
        },
      },
    });
  }

  async enqueueManualEditImpactCommand(input: {
    novelId: string;
    workflowTaskId?: string | null;
    chapterId?: string | null;
    includeAiInterpretation?: boolean;
  }): Promise<DirectorCommandAcceptedResponse> {
    const task = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId?.trim() || undefined,
      novelId: input.novelId,
      lane: "auto_director",
      title: "AI 自动导演编辑影响分析",
      initialState: {
        stage: "auto_director",
        itemKey: "manual_edit_impact",
        itemLabel: "AI 正在分析手动编辑对后续产物的影响",
        progress: 0.08,
      },
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "manual_edit_impact",
      payload: {
        manualEditImpactRequest: {
          novelId: input.novelId,
          workflowTaskId: task.id,
          chapterId: input.chapterId ?? null,
          includeAiInterpretation: input.includeAiInterpretation,
        },
      },
    });
  }

  async enqueueRecoveryCommand(taskId: string, input: DirectorCommandPayload = {}): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "resume_from_checkpoint",
      payload: {
        ...input,
        forceResume: true,
      },
    });
  }

  async enqueueRetryCommand(input: {
    taskId: string;
    llmOverride?: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">;
    batchAlreadyStartedCount?: number;
  }): Promise<DirectorCommandAcceptedResponse> {
    const row = await this.workflowService.getTaskById(input.taskId);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks can be queued as director commands.", 400);
    }
    if (input.llmOverride) {
      await this.workflowService.applyAutoDirectorLlmOverride(input.taskId, input.llmOverride);
    }
    await this.workflowService.retryTask(input.taskId);
    return this.enqueueExecutionCommand({
      taskId: input.taskId,
      commandType: "retry",
      payload: {
        forceResume: true,
        batchAlreadyStartedCount: input.batchAlreadyStartedCount,
      },
    });
  }

  async enqueueCancelCommand(taskId: string): Promise<DirectorCommandAcceptedResponse> {
    const row = await this.workflowService.getTaskById(taskId);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks can be queued as director commands.", 400);
    }
    await this.workflowService.cancelTask(taskId);
    await prisma.directorRunCommand.updateMany({
      where: {
        taskId,
        commandType: { in: EXECUTION_COMMAND_TYPES },
        status: { in: ACTIVE_COMMAND_STATUSES },
      },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
        errorMessage: "用户请求取消自动导演任务。",
      },
    });
    await this.runtimeExecutionService.requestRuntimeCancel(taskId);
    await this.closeCancelledTaskRuntimeState(taskId, new Date());
    const now = new Date();
    const command = await withSqliteRetry(() => prisma.directorRunCommand.create({
      data: {
        taskId,
        novelId: row.novelId,
        commandType: "cancel",
        idempotencyKey: `cancel:${now.getTime()}`,
        status: "succeeded",
        payloadJson: stableJson({}),
        finishedAt: now,
      },
    }), { label: "director.command.cancel.record" });
    return toAcceptedResponse(command, null);
  }

  async enqueueTakeoverCommand(input: DirectorTakeoverRequest): Promise<DirectorCommandAcceptedResponse> {
    const takeoverInput = applyDirectorRunModeContract(input);
    const reusableCommand = await prisma.directorRunCommand.findFirst({
      where: {
        novelId: takeoverInput.novelId,
        commandType: "takeover",
        status: { in: ACTIVE_COMMAND_STATUSES },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (reusableCommand) {
      const runtime = await this.runtimeExecutionService.ensureRuntimeCommandForLegacyCommand(reusableCommand, {
        runMode: takeoverInput.runMode,
      });
      return toAcceptedResponse(reusableCommand, runtime?.runtime ?? null);
    }

    const task = await this.workflowService.bootstrapTask({
      novelId: takeoverInput.novelId,
      lane: "auto_director",
      title: "鑷姩瀵兼紨鎺ョ",
      forceNew: true,
      initialState: {
        stage: "auto_director",
        itemKey: "takeover",
        itemLabel: "自动导演接管任务已提交",
        progress: 0,
      },
      seedPayload: {
        takeover: {
          entryStep: takeoverInput.entryStep ?? null,
          startPhase: takeoverInput.startPhase ?? null,
          strategy: takeoverInput.strategy ?? null,
          autoExecutionPlan: takeoverInput.autoExecutionPlan ?? null,
        },
      },
    });
    return this.enqueueExecutionCommand({
      taskId: task.id,
      commandType: "takeover",
      payload: {
        takeoverRequest: takeoverInput,
      },
    });
  }

  async enqueueChapterTitleRepairCommand(taskId: string, input: {
    volumeId?: string | null;
  } = {}): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "repair_chapter_titles",
      payload: {
        volumeId: input.volumeId?.trim() || null,
      },
      preserveLastError: true,
    });
  }

  private async ensureCandidateTask(
    input: DirectorCandidatesRequest | DirectorRefinementRequest | DirectorCandidatePatchRequest | DirectorCandidateTitleRefineRequest,
    candidateStage: {
      mode: "generate" | "refine" | "patch_candidate" | "refine_titles";
      presets?: unknown[];
      feedback?: string | null;
      batchId?: string | null;
      candidateId?: string | null;
    },
  ) {
    return this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId?.trim() || undefined,
      lane: "auto_director",
      title: input.title?.trim() || "AI 自动导演候选方向",
      seedPayload: {
        idea: input.idea,
        provider: input.provider ?? null,
        model: input.model ?? null,
        temperature: input.temperature ?? null,
        runMode: input.runMode,
        batches: "previousBatches" in input ? input.previousBatches : [],
        candidateStage,
        directorSession: buildDirectorSessionState({
          runMode: input.runMode,
          phase: "candidate_selection",
          isBackgroundRunning: true,
        }),
      },
      initialState: {
        stage: "auto_director",
        itemKey: "candidate_direction_batch",
        itemLabel: "AI 正在生成书级方向候选",
        progress: 0.1,
      },
    });
  }

  async getCommandById(commandId: string) {
    return prisma.directorRunCommand.findUnique({
      where: { id: commandId },
    });
  }

  async getCommandResult(commandId: string) {
    const command = await this.getCommandById(commandId);
    if (!command) {
      throw new AppError("Director command not found.", 404);
    }
    const task = await this.workflowService.getTaskByIdWithoutHealing(command.taskId);
    const seedPayload = parseSeedPayload<{ directorCommandResults?: Record<string, { result?: unknown } | unknown> }>(
      task?.seedPayloadJson,
    ) ?? {};
    const resultEntry = seedPayload.directorCommandResults?.[commandId] ?? null;
    const result = resultEntry && typeof resultEntry === "object" && "result" in resultEntry
      ? (resultEntry as { result?: unknown }).result ?? null
      : resultEntry;
    return {
      commandId: command.id,
      taskId: command.taskId,
      commandType: command.commandType,
      status: command.status,
      result,
      errorMessage: command.errorMessage ?? null,
    };
  }

  async recoverStaleLeases(now = new Date(), options: {
    taskId?: string;
  } = {}): Promise<number> {
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
    if (staleCommands.length === 0) {
      return 0;
    }
    const autoRecoverableCommands = staleCommands.filter(isAutoRecoverableStaleCommand);
    const manualRecoveryCommands = staleCommands.filter((command) => !isAutoRecoverableStaleCommand(command));

    if (autoRecoverableCommands.length > 0) {
      const autoRecoverableIds = autoRecoverableCommands.map((command) => command.id);
      await prisma.directorRunCommand.updateMany({
        where: { id: { in: autoRecoverableIds } },
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
      const autoRecoverableTaskIds = Array.from(new Set(autoRecoverableCommands.map((command) => command.taskId)));
      await prisma.novelWorkflowTask.updateMany({
        where: { id: { in: autoRecoverableTaskIds } },
        data: {
          status: "queued",
          pendingManualRecovery: false,
          lastError: null,
          heartbeatAt: now,
          finishedAt: null,
        },
      }).catch(() => null);
      taskDispatcher.notify();
    }

    if (manualRecoveryCommands.length === 0) {
      return staleCommands.length;
    }
    const manualRecoveryIds = manualRecoveryCommands.map((command) => command.id);
    await prisma.directorRunCommand.updateMany({
      where: { id: { in: manualRecoveryIds } },
      data: {
        status: "stale",
        finishedAt: now,
        errorMessage: STALE_COMMAND_INTERNAL_MESSAGE,
      },
    });
    const manualRecoveryTaskIds = Array.from(new Set(manualRecoveryCommands.map((command) => command.taskId)));
    for (const taskId of manualRecoveryTaskIds) {
      await prisma.directorStepRun.updateMany({
        where: {
          taskId,
          status: "running",
        },
        data: {
          status: "failed",
          finishedAt: now,
          error: STALE_COMMAND_INTERNAL_MESSAGE,
        },
      }).catch(() => null);
      await this.workflowService.requeueTaskForRecovery(taskId, STALE_COMMAND_MANUAL_RECOVERY_MESSAGE)
        .catch(() => null);
    }
    return staleCommands.length;
  }

  async leaseNextCommand(input: {
    workerId: string;
    leaseMs: number;
  }) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: now },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) {
      return null;
    }
    const claimed = await prisma.directorRunCommand.updateMany({
      where: {
        id: candidate.id,
        status: "queued",
      },
      data: {
        status: "leased",
        leaseOwner: input.workerId,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    return this.getCommandById(candidate.id);
  }

  async markCommandRunning(commandId: string, workerId: string, leaseMs: number) {
    const now = new Date();
    await prisma.directorRunCommand.updateMany({
      where: {
        id: commandId,
        leaseOwner: workerId,
        status: { in: ["leased", "running"] },
      },
      data: {
        status: "running",
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
    });
  }

  async renewLease(commandId: string, workerId: string, leaseMs: number): Promise<boolean> {
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        id: commandId,
        leaseOwner: workerId,
        status: { in: ["leased", "running"] },
      },
      data: {
        leaseExpiresAt: new Date(Date.now() + leaseMs),
      },
    });
    return updated.count === 1;
  }

  async markCommandSucceeded(commandId: string, workerId: string): Promise<void> {
    await prisma.directorRunCommand.updateMany({
      where: {
        id: commandId,
        leaseOwner: workerId,
        status: { in: ["leased", "running"] },
      },
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
      where: {
        id: commandId,
        leaseOwner: workerId,
        status: { in: ["leased", "running"] },
      },
      data: {
        status: "cancelled",
        leaseExpiresAt: null,
        finishedAt,
        errorMessage: CANCELLED_COMMAND_MESSAGE,
      },
    });
    if (updated.count !== 1) {
      return;
    }
    const command = await this.getCommandById(commandId);
    if (command) {
      await this.closeCancelledTaskRuntimeState(command.taskId, finishedAt);
    }
  }

  async markCommandFailed(commandId: string, workerId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        id: commandId,
        leaseOwner: workerId,
        status: { in: ["leased", "running"] },
      },
      data: {
        status: "failed",
        leaseExpiresAt: null,
        finishedAt: failedAt,
        errorMessage: message,
      },
    });
    if (updated.count !== 1) {
      return;
    }
    const command = await this.getCommandById(commandId);
    if (!command) {
      return;
    }
    await prisma.directorStepRun.updateMany({
      where: {
        taskId: command.taskId,
        status: "running",
      },
      data: {
        status: "failed",
        finishedAt: failedAt,
        error: message,
      },
    }).catch(() => null);
    await this.workflowService.requeueTaskForRecovery(command.taskId, message)
      .catch(() => null);
  }

  private async closeCancelledTaskRuntimeState(taskId: string, now: Date): Promise<void> {
    await prisma.directorStepRun.updateMany({
      where: {
        taskId,
        status: "running",
      },
      data: {
        status: "failed",
        finishedAt: now,
        error: CANCELLED_COMMAND_MESSAGE,
      },
    }).catch(() => null);
    await prisma.generationJob.updateMany({
      where: {
        status: { in: ["queued", "running"] },
        payload: { contains: taskId },
      },
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
    if (!run) {
      return;
    }
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

  parseCommandPayload(command: NonNullable<DirectorRunCommandRow>): DirectorCommandPayload {
    return parsePayload(command.payloadJson);
  }

  async getLatestTakeoverRequestForTask(taskId: string): Promise<DirectorTakeoverRequest | null> {
    const command = await prisma.directorRunCommand.findFirst({
      where: {
        taskId,
        commandType: "takeover",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!command) {
      return null;
    }
    return parsePayload(command.payloadJson).takeoverRequest ?? null;
  }

  private async enqueueExecutionCommand(input: {
    taskId: string;
    commandType: DirectorRunCommandType;
    payload: DirectorCommandPayload;
    allowTerminalReuse?: boolean;
    preserveLastError?: boolean;
  }): Promise<DirectorCommandAcceptedResponse> {
    let row = await this.workflowService.getTaskById(input.taskId);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks can be queued as director commands.", 400);
    }
    const recoveredStaleLeaseCount = await this.recoverStaleLeases(new Date(), { taskId: input.taskId });
    if (recoveredStaleLeaseCount > 0) {
      row = await this.workflowService.getTaskById(input.taskId);
      if (!row) {
        throw new AppError("Task not found.", 404);
      }
    }
    const reusableCommand = await prisma.directorRunCommand.findFirst({
      where: {
        taskId: input.taskId,
        commandType: input.commandType === "cancel" ? "cancel" : { in: EXECUTION_COMMAND_TYPES },
        status: { in: ACTIVE_COMMAND_STATUSES },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (reusableCommand) {
      const runtime = await this.runtimeExecutionService.ensureRuntimeCommandForLegacyCommand(reusableCommand, {
        runMode: input.payload.confirmRequest?.runMode ?? input.payload.takeoverRequest?.runMode ?? null,
      });
      return toAcceptedResponse(reusableCommand, runtime?.runtime ?? null);
    }

    const normalizedPayload = Object.fromEntries(
      Object.entries(input.payload).filter(([, value]) => value !== undefined),
    );
    const idempotencyKey = `${input.commandType}:${row.updatedAt.getTime()}:${hashPayload(normalizedPayload)}`;
    const payloadJson = stableJson(normalizedPayload);
    const createCommand = () => prisma.directorRunCommand.create({
      data: {
        taskId: input.taskId,
        novelId: row.novelId,
        commandType: input.commandType,
        idempotencyKey,
        status: "queued",
        payloadJson,
      },
    });

    try {
      const command = await withSqliteRetry(createCommand, { label: "director.command.create" });
      const runtime = await this.runtimeExecutionService.ensureRuntimeCommandForLegacyCommand(command, {
        runMode: input.payload.confirmRequest?.runMode ?? input.payload.takeoverRequest?.runMode ?? null,
      });
      await this.markCommandAcceptedOnTask(input.taskId, input.commandType, {
        preserveLastError: input.preserveLastError,
      });
      taskDispatcher.notify({ commandType: input.commandType, taskId: input.taskId });
      return toAcceptedResponse(command, runtime?.runtime ?? null);
    } catch (error) {
      if (!isUniqueConstraintError(error) || input.allowTerminalReuse === false) {
        throw error;
      }
      const existing = await prisma.directorRunCommand.findFirst({
        where: {
          taskId: input.taskId,
          commandType: input.commandType,
          idempotencyKey,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!existing) {
        throw error;
      }
      const runtime = await this.runtimeExecutionService.ensureRuntimeCommandForLegacyCommand(existing, {
        runMode: input.payload.confirmRequest?.runMode ?? input.payload.takeoverRequest?.runMode ?? null,
      });
      return toAcceptedResponse(existing, runtime?.runtime ?? null);
    }
  }

  private async markCommandAcceptedOnTask(taskId: string, commandType: DirectorRunCommandType, options: {
    preserveLastError?: boolean;
  } = {}): Promise<void> {
    const taskState = buildAcceptedTaskState(commandType);
    await prisma.novelWorkflowTask.updateMany({
      where: {
        id: taskId,
        OR: [
          { status: { in: ["queued", "running", "waiting_approval", "failed"] } },
          { pendingManualRecovery: true },
        ],
      },
      data: {
        status: "queued",
        pendingManualRecovery: false,
        ...(options.preserveLastError ? {} : { lastError: null }),
        ...taskState,
        heartbeatAt: new Date(),
        finishedAt: null,
        cancelRequestedAt: null,
      },
    }).catch(() => null);
  }
}
