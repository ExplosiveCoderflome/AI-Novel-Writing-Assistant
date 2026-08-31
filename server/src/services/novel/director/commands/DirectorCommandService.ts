import type {
  DirectorCommandAcceptedResponse,
  DirectorRuntimePolicyUpdateRequest,
  DirectorRunCommandStatus,
  DirectorRunCommandType,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCandidatePatchRequest,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidatesRequest,
  DirectorConfirmRequest,
  DirectorLLMOptions,
  DirectorRefinementRequest,
  DirectorTakeoverRequest,
  DirectorStepCalibrationRequest,
} from "@ai-novel/shared/types/novelDirector";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { AppError } from "../../../../middleware/errorHandler";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import {
  applyDirectorRunModeContract,
  buildDirectorSessionState,
  buildDirectorWorkflowSeedPayload,
} from "../runtime/novelDirectorHelpers";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
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
import { taskDispatcher } from "../../../../workers/TaskDispatcher";
import { DirectorCommandLeaseService } from "./leases/DirectorCommandLeaseService";

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
  "calibrate_step",
  "accept_manual_changes_and_continue",
  "repair_chapter_titles",
];

export type DirectorRunCommandRow = Awaited<ReturnType<DirectorCommandService["getCommandById"]>>;

const UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";

interface ConfirmTaskSeedPayload extends Record<string, unknown> {
  idea?: unknown;
  basicForm?: Record<string, unknown>;
  batches?: DirectorCandidateBatch[];
  candidate?: unknown;
  commercialTags?: unknown;
  directorInput?: {
    candidate?: unknown;
  };
  styleIntentSummary?: unknown;
}

function containsUnicodeReplacementCharacter(value: unknown): boolean {
  if (typeof value === "string") {
    return value.includes(UNICODE_REPLACEMENT_CHARACTER);
  }
  if (Array.isArray(value)) {
    return value.some(containsUnicodeReplacementCharacter);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(containsUnicodeReplacementCharacter);
  }
  return false;
}

function recoverText(value: string | undefined, ...fallbacks: unknown[]): string | undefined {
  if (!containsUnicodeReplacementCharacter(value)) {
    return value;
  }
  return fallbacks.find((fallback): fallback is string => (
    typeof fallback === "string" && !containsUnicodeReplacementCharacter(fallback)
  )) ?? value;
}

function findAuthoritativeCandidate(
  seed: ConfirmTaskSeedPayload,
  input: DirectorConfirmRequest,
): DirectorCandidate | null {
  const batches = Array.isArray(seed.batches) ? seed.batches : [];
  const preferredBatch = input.batchId
    ? batches.find((batch) => batch.id === input.batchId)
    : null;
  const batchCandidate = input.batchId
    ? preferredBatch?.candidates.find((candidate) => candidate.id === input.candidate.id) ?? null
    : batches.flatMap((batch) => batch.candidates).find((candidate) => candidate.id === input.candidate.id) ?? null;
  if (batches.length > 0 && !batchCandidate) {
    return null;
  }
  const previouslyConfirmedCandidate = [seed.candidate, seed.directorInput?.candidate]
    .find((candidate): candidate is DirectorCandidate => Boolean(
      candidate
      && typeof candidate === "object"
      && !Array.isArray(candidate)
      && (candidate as { id?: unknown }).id === input.candidate.id
      && !containsUnicodeReplacementCharacter(candidate),
    ));
  return previouslyConfirmedCandidate ?? batchCandidate;
}

function resolveConfirmRequestFromTaskSeed(
  input: DirectorConfirmRequest,
  seedPayloadJson: string | null | undefined,
): DirectorConfirmRequest {
  const seed = parseSeedPayload<ConfirmTaskSeedPayload>(seedPayloadJson) ?? {};
  const basicForm = seed.basicForm ?? {};
  const batches = Array.isArray(seed.batches) ? seed.batches : [];
  const authoritativeCandidate = findAuthoritativeCandidate(seed, input);
  if (batches.length > 0 && !authoritativeCandidate) {
    throw new AppError("所选书级方向与任务记录不一致，请刷新候选方案后重新确认。", 409);
  }

  const candidate = authoritativeCandidate
    ? {
        ...authoritativeCandidate,
        workingTitle: recoverText(
          input.candidate.workingTitle,
          authoritativeCandidate.workingTitle,
        ) ?? authoritativeCandidate.workingTitle,
      }
    : input.candidate;
  const commercialTags = containsUnicodeReplacementCharacter(input.commercialTags)
    ? [seed.commercialTags, basicForm.commercialTagsText]
        .map((value) => normalizeCommercialTags(value as string | string[] | null | undefined))
        .find((value) => value.length > 0 && !containsUnicodeReplacementCharacter(value))
        ?? input.commercialTags
    : input.commercialTags;
  const styleIntentSummary = containsUnicodeReplacementCharacter(input.styleIntentSummary)
    && !containsUnicodeReplacementCharacter(seed.styleIntentSummary)
    ? seed.styleIntentSummary as DirectorConfirmRequest["styleIntentSummary"]
    : input.styleIntentSummary;
  const normalized: DirectorConfirmRequest = {
    ...input,
    candidate,
    idea: recoverText(input.idea, seed.idea, basicForm.description, batches.at(-1)?.idea) ?? input.idea,
    title: recoverText(input.title, seed.title, basicForm.title),
    description: recoverText(input.description, seed.description, basicForm.description),
    targetAudience: recoverText(input.targetAudience, seed.targetAudience, basicForm.targetAudience),
    bookSellingPoint: recoverText(input.bookSellingPoint, seed.bookSellingPoint, basicForm.bookSellingPoint),
    competingFeel: recoverText(input.competingFeel, seed.competingFeel, basicForm.competingFeel),
    first30ChapterPromise: recoverText(
      input.first30ChapterPromise,
      seed.first30ChapterPromise,
      basicForm.first30ChapterPromise,
    ),
    commercialTags,
    styleTone: recoverText(input.styleTone, seed.styleTone, basicForm.styleTone),
    styleIntentSummary,
  };
  if (containsUnicodeReplacementCharacter(normalized)) {
    throw new AppError("书级方向包含无法还原的异常字符，请刷新候选方案后重新确认。", 400);
  }
  return normalized;
}

export class DirectorCommandService {
  constructor(private readonly workflowService = new NovelWorkflowService()) {}

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
    const existingTask = input.workflowTaskId?.trim()
      ? await this.workflowService.getTaskByIdWithoutHealing(input.workflowTaskId.trim())
      : null;
    const confirmedInput = applyDirectorRunModeContract(resolveConfirmRequestFromTaskSeed(
      input,
      existingTask?.seedPayloadJson,
    ));
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
        itemLabel: "等待创建小说项目",
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

  async enqueueCalibrateStepCommand(taskId: string, input: DirectorStepCalibrationRequest): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "calibrate_step",
      payload: { stepCalibrationRequest: input },
    });
  }

  async enqueueAcceptManualChangesAndContinueCommand(taskId: string): Promise<DirectorCommandAcceptedResponse> {
    return this.enqueueExecutionCommand({
      taskId,
      commandType: "accept_manual_changes_and_continue",
      payload: {
        acceptManualChanges: true,
        continuationMode: "resume",
        forceResume: true,
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
    await new DirectorCommandLeaseService(this.workflowService).closeCancelledTaskRuntimeState(taskId, new Date());
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
      return toAcceptedResponse(reusableCommand, null);
    }

    const task = await this.workflowService.bootstrapTask({
      novelId: takeoverInput.novelId,
      lane: "auto_director",
      title: "执行 AI 自动导演接管",
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
    return new DirectorCommandLeaseService(this.workflowService).recoverStaleLeases(now, options);
  }

  async leaseNextCommand(input: {
    workerId: string;
    leaseMs: number;
  }) {
    return new DirectorCommandLeaseService(this.workflowService).leaseNextCommand(input);
  }

  async markCommandRunning(commandId: string, workerId: string, leaseMs: number) {
    return new DirectorCommandLeaseService(this.workflowService).markCommandRunning(commandId, workerId, leaseMs);
  }

  async renewLease(commandId: string, workerId: string, leaseMs: number): Promise<boolean> {
    return new DirectorCommandLeaseService(this.workflowService).renewLease(commandId, workerId, leaseMs);
  }

  async markCommandSucceeded(commandId: string, workerId: string): Promise<void> {
    return new DirectorCommandLeaseService(this.workflowService).markCommandSucceeded(commandId, workerId);
  }

  async markCommandCancelled(commandId: string, workerId: string): Promise<void> {
    return new DirectorCommandLeaseService(this.workflowService).markCommandCancelled(commandId, workerId);
  }

  async markCommandFailed(commandId: string, workerId: string, error: unknown): Promise<void> {
    return new DirectorCommandLeaseService(this.workflowService).markCommandFailed(commandId, workerId, error);
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
      return toAcceptedResponse(reusableCommand, null);
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
      await this.markCommandAcceptedOnTask(input.taskId, input.commandType, {
        preserveLastError: input.preserveLastError,
      });
      taskDispatcher.notify({ commandType: input.commandType, taskId: input.taskId });
      return toAcceptedResponse(command, null);
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
      return toAcceptedResponse(existing, null);
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
