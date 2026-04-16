import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  normalizeDirectorAutoExecutionPlan,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  buildDirectorAutoExecutionPipelineOptions,
  buildDirectorAutoExecutionState,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
  type DirectorAutoExecutionChapterRef,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import { isSkippableAutoExecutionReviewFailure } from "./novelDirectorAutoExecutionFailure";
import { PIPELINE_REPLAN_NOTICE_CODE } from "../pipelineJobState";

type AutoExecutionResumeStage = "chapter" | "pipeline";

interface NovelDirectorAutoExecutionWorkflowPort {
  bootstrapTask(input: {
    workflowTaskId: string;
    novelId: string;
    lane: "auto_director";
    title: string;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  getTaskById(taskId: string): Promise<{ status: string } | null>;
  markTaskRunning(taskId: string, input: {
    stage: "chapter_execution" | "quality_repair";
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
  }): Promise<unknown>;
  recordCheckpoint(taskId: string, input: {
    stage: "quality_repair";
    checkpointType: "workflow_completed" | "chapter_batch_ready" | "replan_required";
    checkpointSummary: string;
    itemLabel: string;
    progress?: number;
    chapterId?: string | null;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  markTaskFailed(taskId: string, message: string, patch?: {
    stage?: "quality_repair";
    itemKey?: string | null;
    itemLabel?: string;
    checkpointType?: "chapter_batch_ready" | "replan_required";
    checkpointSummary?: string | null;
    chapterId?: string | null;
    progress?: number;
  }): Promise<unknown>;
}

interface NovelDirectorAutoExecutionNovelPort {
  listChapters(novelId: string): Promise<DirectorAutoExecutionChapterRef[]>;
  startPipelineJob(novelId: string, options: {
    provider?: string;
    model?: string;
    temperature?: number;
    startOrder: number;
    endOrder: number;
    controlPolicy?: NovelControlPolicy;
    maxRetries: number;
    runMode: "fast" | "polish";
    autoReview: boolean;
    autoRepair: boolean;
    skipCompleted: boolean;
    qualityThreshold: number;
    repairMode: "light_repair";
  }): Promise<{ id: string; status: PipelineJobStatus }>;
  findActivePipelineJobForRange(
    novelId: string,
    startOrder: number,
    endOrder: number,
    preferredJobId?: string | null,
  ): Promise<{ id: string; status: PipelineJobStatus } | null>;
    getPipelineJobById(jobId: string): Promise<{
    id: string;
    status: PipelineJobStatus;
    progress: number;
    currentStage?: string | null;
    currentItemLabel?: string | null;
    noticeCode?: string | null;
    payload?: string | null;
    noticeSummary?: string | null;
    error?: string | null;
  } | null>;
  cancelPipelineJob(jobId: string): Promise<unknown>;
}

interface NovelDirectorAutoExecutionRuntimeDeps {
  novelContextService: Pick<NovelDirectorAutoExecutionNovelPort, "listChapters">;
  novelService: Pick<
    NovelDirectorAutoExecutionNovelPort,
    "startPipelineJob" | "findActivePipelineJobForRange" | "getPipelineJobById" | "cancelPipelineJob"
  >;
  workflowService: NovelDirectorAutoExecutionWorkflowPort;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
}

function isNoChaptersToGenerateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("指定区间内没有可生成的章节");
}

export class NovelDirectorAutoExecutionRuntime {
  constructor(private readonly deps: NovelDirectorAutoExecutionRuntimeDeps) {}

  private applyReviewSkipOverride(input: {
    existingState?: DirectorAutoExecutionState | null;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
  }): DirectorAutoExecutionState | null {
    if (
      !input.allowSkipReviewBlockedChapter
      || !input.existingState
      || !isSkippableAutoExecutionReviewFailure(input.previousFailureMessage)
    ) {
      return input.existingState ?? null;
    }

    const nextChapterId = input.existingState.nextChapterId?.trim() || null;
    const nextChapterOrder = typeof input.existingState.nextChapterOrder === "number"
      ? input.existingState.nextChapterOrder
      : null;
    if (!nextChapterId && nextChapterOrder == null) {
      return input.existingState;
    }

    const skippedChapterIds = Array.from(new Set(
      [
        ...(input.existingState.skippedChapterIds ?? []),
        ...(nextChapterId ? [nextChapterId] : []),
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ));
    const skippedChapterOrders = Array.from(new Set(
      [
        ...(input.existingState.skippedChapterOrders ?? []),
        ...(typeof nextChapterOrder === "number" ? [nextChapterOrder] : []),
      ].filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
    )).sort((left, right) => left - right);

    return {
      ...input.existingState,
      skippedChapterIds,
      skippedChapterOrders,
      pipelineJobId: null,
      pipelineStatus: null,
    };
  }

  private buildRequestedAutoExecutionState(input: {
    request: DirectorConfirmRequest;
    existingState?: DirectorAutoExecutionState | null;
    existingPipelineJobId?: string | null;
  }): DirectorAutoExecutionState | null {
    const requestedPlan = normalizeDirectorAutoExecutionPlan(input.request.autoExecutionPlan);
    if (!input.existingState) {
      return {
        enabled: true,
        mode: requestedPlan.mode,
        startOrder: requestedPlan.startOrder,
        endOrder: requestedPlan.endOrder,
        volumeOrder: requestedPlan.volumeOrder,
        autoReview: requestedPlan.autoReview,
        autoRepair: requestedPlan.autoRepair,
        pipelineJobId: input.existingPipelineJobId?.trim() || null,
        pipelineStatus: input.existingPipelineJobId ? "running" : null,
      };
    }

    const keepPipelineBinding = Boolean(input.existingPipelineJobId?.trim());
    return {
      ...input.existingState,
      mode: requestedPlan.mode,
      startOrder: requestedPlan.startOrder,
      endOrder: requestedPlan.endOrder,
      volumeOrder: requestedPlan.volumeOrder,
      autoReview: requestedPlan.autoReview,
      autoRepair: requestedPlan.autoRepair,
      scopeLabel: null,
      pipelineJobId: keepPipelineBinding
        ? (input.existingPipelineJobId?.trim() || input.existingState.pipelineJobId || null)
        : null,
      pipelineStatus: keepPipelineBinding ? (input.existingState.pipelineStatus ?? "running") : null,
    };
  }

  private async resolveRangeAndState(input: {
    novelId: string;
    existingState?: DirectorAutoExecutionState | null;
    pipelineJobId?: string | null;
    pipelineStatus?: PipelineJobStatus | null;
  }): Promise<{
    range: DirectorAutoExecutionRange;
    autoExecution: DirectorAutoExecutionState;
  }> {
    const chapters = await this.deps.novelContextService.listChapters(input.novelId);
    const range = resolveDirectorAutoExecutionRangeFromState(input.existingState)
      ?? resolveDirectorAutoExecutionRange(chapters);
    if (!range) {
      throw new Error("当前还没有可自动执行的章节，请先完成目标范围的拆章同步。");
    }
    return {
      range,
      autoExecution: buildDirectorAutoExecutionState({
        range,
        chapters,
        plan: input.existingState,
        scopeLabel: input.existingState?.scopeLabel ?? null,
        volumeTitle: input.existingState?.volumeTitle ?? null,
        preparedVolumeIds: input.existingState?.preparedVolumeIds ?? [],
        pipelineJobId: input.pipelineJobId ?? input.existingState?.pipelineJobId ?? null,
        pipelineStatus: input.pipelineStatus ?? input.existingState?.pipelineStatus ?? null,
      }),
    };
  }

  private async syncAutoExecutionTaskState(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    range: DirectorAutoExecutionRange;
    autoExecution: DirectorAutoExecutionState;
    isBackgroundRunning: boolean;
    resumeStage?: AutoExecutionResumeStage;
  }) {
    const directorSession = buildDirectorSessionState({
      runMode: input.request.runMode,
      phase: "front10_ready",
      isBackgroundRunning: input.isBackgroundRunning,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      stage: input.resumeStage ?? "pipeline",
      chapterId: input.autoExecution.nextChapterId ?? input.range.firstChapterId,
    });
    await this.deps.workflowService.bootstrapTask({
      workflowTaskId: input.taskId,
      novelId: input.novelId,
      lane: "auto_director",
      title: input.request.candidate.workingTitle,
      seedPayload: this.deps.buildDirectorSeedPayload(input.request, input.novelId, {
        directorSession,
        resumeTarget,
        autoExecution: input.autoExecution,
      }),
    });
  }

  private async shouldStopAutoExecution(taskId: string, pipelineJobId?: string | null): Promise<boolean> {
    const row = await this.deps.workflowService.getTaskById(taskId);
    if (!row || row.status !== "cancelled") {
      return false;
    }
    if (pipelineJobId) {
      await this.deps.novelService.cancelPipelineJob(pipelineJobId).catch(() => null);
    }
    return true;
  }

  private async recordCompletedCheckpoint(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    range: DirectorAutoExecutionRange;
    autoExecution: DirectorAutoExecutionState;
    pipelineJobId?: string | null;
    pipelineStatus?: PipelineJobStatus | null;
  }) {
    const completedState = {
      ...input.autoExecution,
      pipelineJobId: input.pipelineJobId ?? input.autoExecution.pipelineJobId ?? null,
      pipelineStatus: input.pipelineStatus ?? input.autoExecution.pipelineStatus ?? null,
    };
    await this.deps.workflowService.recordCheckpoint(input.taskId, {
      stage: "quality_repair",
      checkpointType: "workflow_completed",
      checkpointSummary: buildDirectorAutoExecutionCompletedSummary({
        title: input.request.candidate.workingTitle.trim() || input.request.title?.trim() || "当前项目",
        scopeLabel: buildDirectorAutoExecutionScopeLabelFromState(completedState, input.range.totalChapterCount),
        autoReview: completedState.autoReview,
        autoRepair: completedState.autoRepair,
      }),
      itemLabel: buildDirectorAutoExecutionCompletedLabel(
        buildDirectorAutoExecutionScopeLabelFromState(completedState, input.range.totalChapterCount),
      ),
      progress: 1,
      chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
      seedPayload: this.deps.buildDirectorSeedPayload(input.request, input.novelId, {
        directorSession: buildDirectorSessionState({
          runMode: input.request.runMode,
          phase: "front10_ready",
          isBackgroundRunning: false,
        }),
        resumeTarget: buildNovelEditResumeTarget({
          novelId: input.novelId,
          taskId: input.taskId,
          stage: "pipeline",
          chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
        }),
        autoExecution: completedState,
      }),
    });
  }

  async runFromReady(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
    resumeStage?: AutoExecutionResumeStage;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
  }): Promise<void> {
    const shouldSkipReviewBlockedChapter = Boolean(
      input.allowSkipReviewBlockedChapter
      && isSkippableAutoExecutionReviewFailure(input.previousFailureMessage),
    );
    let pipelineJobId = shouldSkipReviewBlockedChapter
      ? ""
      : (input.existingPipelineJobId?.trim() || "");
    const existingState = this.applyReviewSkipOverride({
      existingState: input.existingState,
      previousFailureMessage: input.previousFailureMessage,
      allowSkipReviewBlockedChapter: input.allowSkipReviewBlockedChapter,
    });
    const requestedExecutionState = this.buildRequestedAutoExecutionState({
      request: input.request,
      existingState,
      existingPipelineJobId: pipelineJobId || null,
    });
    let { range, autoExecution } = await this.resolveRangeAndState({
      novelId: input.novelId,
      existingState: requestedExecutionState,
      pipelineJobId: pipelineJobId || null,
      pipelineStatus: pipelineJobId ? "running" : "queued",
    });

    try {
      await this.syncAutoExecutionTaskState({
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.request,
        range,
        autoExecution,
        isBackgroundRunning: true,
        resumeStage: input.resumeStage,
      });
      if (await this.shouldStopAutoExecution(input.taskId, pipelineJobId || null)) {
        return;
      }

      if (pipelineJobId) {
        const existingJob = await this.deps.novelService.getPipelineJobById(pipelineJobId);
        if (!existingJob || ["failed", "cancelled", "succeeded"].includes(existingJob.status)) {
          pipelineJobId = "";
        }
      }

      const activeRangeJob = await this.deps.novelService.findActivePipelineJobForRange(
        input.novelId,
        autoExecution.nextChapterOrder ?? range.startOrder,
        autoExecution.remainingChapterOrders?.[autoExecution.remainingChapterOrders.length - 1] ?? range.endOrder,
        pipelineJobId || null,
      );
      if (activeRangeJob) {
        pipelineJobId = activeRangeJob.id;
        ({ range, autoExecution } = await this.resolveRangeAndState({
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId,
          pipelineStatus: activeRangeJob.status,
        }));
        await this.syncAutoExecutionTaskState({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution,
          isBackgroundRunning: true,
          resumeStage: input.resumeStage,
        });
      }

      if (!pipelineJobId) {
        ({ range, autoExecution } = await this.resolveRangeAndState({
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId: null,
          pipelineStatus: "queued",
        }));
        if ((autoExecution.remainingChapterCount ?? 0) === 0) {
          await this.recordCompletedCheckpoint({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineStatus: "succeeded",
          });
          return;
        }

        await this.deps.workflowService.markTaskRunning(input.taskId, {
          stage: "chapter_execution",
          itemKey: "chapter_execution",
          itemLabel: `正在自动执行${buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount)}`,
          progress: 0.93,
          clearCheckpoint: input.resumeCheckpointType === "chapter_batch_ready",
        });
        try {
          const job = await this.deps.novelService.startPipelineJob(
            input.novelId,
            buildDirectorAutoExecutionPipelineOptions({
              provider: input.request.provider,
              model: input.request.model,
              temperature: input.request.temperature,
              workflowTaskId: input.taskId,
              startOrder: autoExecution.nextChapterOrder ?? range.startOrder,
              endOrder: autoExecution.remainingChapterOrders?.[autoExecution.remainingChapterOrders.length - 1] ?? range.endOrder,
              autoReview: autoExecution.autoReview,
              autoRepair: autoExecution.autoRepair,
            }),
          );
          pipelineJobId = job.id;
          autoExecution = {
            ...autoExecution,
            pipelineJobId: job.id,
            pipelineStatus: job.status,
          };
        } catch (error) {
          if (!isNoChaptersToGenerateError(error)) {
            throw error;
          }
          ({ range, autoExecution } = await this.resolveRangeAndState({
            novelId: input.novelId,
            existingState: autoExecution,
            pipelineJobId: null,
            pipelineStatus: "succeeded",
          }));
          if ((autoExecution.remainingChapterCount ?? 0) === 0) {
            await this.recordCompletedCheckpoint({
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              pipelineStatus: "succeeded",
            });
            return;
          }
          throw error;
        }
        await this.syncAutoExecutionTaskState({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution,
          isBackgroundRunning: true,
          resumeStage: input.resumeStage,
        });
      }

      while (pipelineJobId) {
        if (await this.shouldStopAutoExecution(input.taskId, pipelineJobId)) {
          return;
        }
        const job = await this.deps.novelService.getPipelineJobById(pipelineJobId);
        if (!job) {
          throw new Error("自动执行章节批次时未能找到对应的批量任务。");
        }
        if (job.status === "queued" || job.status === "running") {
          const runningState = resolveDirectorAutoExecutionWorkflowState(job, range, autoExecution);
          await this.deps.workflowService.markTaskRunning(input.taskId, {
            ...runningState,
            clearCheckpoint: input.resumeCheckpointType === "chapter_batch_ready" || input.resumeCheckpointType === "replan_required",
          });
          ({ range, autoExecution } = await this.resolveRangeAndState({
            novelId: input.novelId,
            existingState: autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
          }));
          await this.syncAutoExecutionTaskState({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            isBackgroundRunning: true,
            resumeStage: "pipeline",
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        ({ range, autoExecution } = await this.resolveRangeAndState({
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId,
          pipelineStatus: job.status,
        }));

        if (job.status === "succeeded" && job.noticeSummary?.trim()) {
          const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount);
          const pauseMessage = job.noticeSummary.trim();
          const checkpointType = job.noticeCode === PIPELINE_REPLAN_NOTICE_CODE
            ? "replan_required"
            : "chapter_batch_ready";
          const itemLabel = checkpointType === "replan_required"
            ? `${scopeLabel}等待处理重规划建议`
            : buildDirectorAutoExecutionPausedLabel(autoExecution);
          await this.deps.workflowService.recordCheckpoint(input.taskId, {
            stage: "quality_repair",
            checkpointType,
            itemLabel,
            checkpointSummary: buildDirectorAutoExecutionPausedSummary({
              scopeLabel,
              remainingChapterCount: autoExecution.remainingChapterCount ?? 0,
              nextChapterOrder: autoExecution.nextChapterOrder ?? null,
              failureMessage: pauseMessage,
            }),
            chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
            progress: 0.98,
            seedPayload: this.deps.buildDirectorSeedPayload(input.request, input.novelId, {
              directorSession: buildDirectorSessionState({
                runMode: input.request.runMode,
                phase: "front10_ready",
                isBackgroundRunning: false,
              }),
              resumeTarget: buildNovelEditResumeTarget({
                novelId: input.novelId,
                taskId: input.taskId,
                stage: "pipeline",
                chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
              }),
              autoExecution: {
                ...autoExecution,
                pipelineJobId,
                pipelineStatus: job.status,
              },
            }),
          });
          await this.syncAutoExecutionTaskState({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution: {
              ...autoExecution,
              pipelineJobId,
              pipelineStatus: job.status,
            },
            isBackgroundRunning: false,
            resumeStage: "pipeline",
          });
          return;
        }

        if (job.status === "succeeded" || (autoExecution.remainingChapterCount ?? 0) === 0) {
          await this.recordCompletedCheckpoint({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
          });
          return;
        }

        const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount);
        const failureMessage = job.error?.trim()
          || (job.status === "cancelled"
            ? `${scopeLabel}自动执行已取消。`
            : `${scopeLabel}自动执行未能全部通过质量要求。`);
        await this.deps.workflowService.markTaskFailed(input.taskId, failureMessage, {
          stage: "quality_repair",
          itemKey: "quality_repair",
          itemLabel: buildDirectorAutoExecutionPausedLabel(autoExecution),
          checkpointType: "chapter_batch_ready",
          checkpointSummary: buildDirectorAutoExecutionPausedSummary({
            scopeLabel,
            remainingChapterCount: autoExecution.remainingChapterCount ?? 0,
            nextChapterOrder: autoExecution.nextChapterOrder ?? null,
            failureMessage,
          }),
          chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
          progress: 0.98,
        });
        await this.syncAutoExecutionTaskState({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution: {
            ...autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
          },
          isBackgroundRunning: false,
          resumeStage: "pipeline",
        });
        return;
      }
    } catch (error) {
      throw error;
    }
  }
}
