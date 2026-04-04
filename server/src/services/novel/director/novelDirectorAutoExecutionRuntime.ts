import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type {
  PipelineJobStatus,
} from "@ai-novel/shared/types/novel";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionPipelineOptions,
  buildDirectorAutoExecutionState,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
  type DirectorAutoExecutionChapterRef,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";

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
  }): Promise<unknown>;
  recordCheckpoint(taskId: string, input: {
    stage: "quality_repair";
    checkpointType: "workflow_completed";
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
    checkpointType?: "chapter_batch_ready";
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
    maxRetries: number;
    runMode: "fast" | "polish";
    autoReview: boolean;
    autoRepair: boolean;
    skipCompleted: boolean;
    qualityThreshold: number;
    repairMode: "light_repair";
  }): Promise<{ id: string; status: PipelineJobStatus }>;
  getPipelineJobById(jobId: string): Promise<{
    id: string;
    status: PipelineJobStatus;
    progress: number;
    currentStage?: string | null;
    currentItemLabel?: string | null;
    error?: string | null;
  } | null>;
  cancelPipelineJob(jobId: string): Promise<unknown>;
}

interface NovelDirectorAutoExecutionRuntimeDeps {
  novelContextService: Pick<NovelDirectorAutoExecutionNovelPort, "listChapters">;
  novelService: Pick<NovelDirectorAutoExecutionNovelPort, "startPipelineJob" | "getPipelineJobById" | "cancelPipelineJob">;
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
      throw new Error("当前还没有可自动执行的章节，请先完成前 10 章拆章同步。");
    }
    return {
      range,
      autoExecution: buildDirectorAutoExecutionState({
        range,
        chapters,
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
        totalChapterCount: input.range.totalChapterCount,
      }),
      itemLabel: buildDirectorAutoExecutionCompletedLabel(input.range.totalChapterCount),
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
  }): Promise<void> {
    let pipelineJobId = input.existingPipelineJobId?.trim() || "";
    let { range, autoExecution } = await this.resolveRangeAndState({
      novelId: input.novelId,
      existingState: input.existingState,
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
          itemLabel: `正在自动执行前 ${range.totalChapterCount} 章`,
          progress: 0.93,
        });
        try {
          const job = await this.deps.novelService.startPipelineJob(
            input.novelId,
            buildDirectorAutoExecutionPipelineOptions({
              provider: input.request.provider,
              model: input.request.model,
              temperature: input.request.temperature,
              startOrder: range.startOrder,
              endOrder: range.endOrder,
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
        });
      }

      while (pipelineJobId) {
        if (await this.shouldStopAutoExecution(input.taskId, pipelineJobId)) {
          return;
        }
        const job = await this.deps.novelService.getPipelineJobById(pipelineJobId);
        if (!job) {
          throw new Error("自动执行前 10 章时未能找到对应的批量任务。");
        }
        if (job.status === "queued" || job.status === "running") {
          const runningState = resolveDirectorAutoExecutionWorkflowState(job, range);
          await this.deps.workflowService.markTaskRunning(input.taskId, runningState);
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

        const failureMessage = job.error?.trim()
          || (job.status === "cancelled"
            ? "前 10 章自动执行已取消。"
            : "前 10 章自动执行未能全部通过质量要求。");
        await this.deps.workflowService.markTaskFailed(input.taskId, failureMessage, {
          stage: "quality_repair",
          itemKey: "quality_repair",
          itemLabel: buildDirectorAutoExecutionPausedLabel(autoExecution),
          checkpointType: "chapter_batch_ready",
          checkpointSummary: buildDirectorAutoExecutionPausedSummary({
            totalChapterCount: range.totalChapterCount,
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
