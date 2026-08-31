import type { Prisma } from "@prisma/client";
import {
  DIRECTOR_ISSUE_GOVERNANCE_VERSION,
  type DirectorIssueAction,
  type DirectorIssueCode,
} from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import { runWithLlmUsageTracking } from "../../../llm/usageTracking";
import { ChapterPlanJITService } from "../planning/ChapterPlanJITService";
import { buildDirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import { ChapterRouteWindowService } from "../planning/ChapterRouteWindowService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { ChapterRuntimeCoordinator } from "../runtime/ChapterRuntimeCoordinator";
import { isChapterEmptyContentError } from "../runtime/chapterEmptyContentError";
import { ChapterContentPersistenceError } from "../runtime/lifecycle";
import {
  logPipelineError,
  logPipelineInfo,
  logPipelineWarn,
  type PipelinePayload,
  type PipelineRunOptions,
} from "../novelCoreShared";
import { plannerService } from "../../planner/PlannerService";
import { applyChapterQualityClosure } from "./qualityClosure/ChapterQualityClosure";
import {
  loadDirectorIssueTaskContext,
} from "../director/issues";
import {
  reportPipelineIssue,
  resolvePipelineRuntimeIssueCode,
} from "./issueGovernance/PipelineIssueGovernance";
import {
  buildPipelineCurrentItemLabel,
  buildPipelineStageProgress,
  parsePipelinePayload as parsePipelineJobPayload,
  stringifyPipelinePayload as stringifyPipelineJobPayload,
  type PipelineActiveStage,
} from "../pipelineJobState";

const PIPELINE_HEARTBEAT_INTERVAL_MS = 15000;
const TERMINAL_CONTINUE_QUALITY_LOOP_RISK_FLAG_FRAGMENT = '"terminalAction":"defer_and_continue"';

class PipelineIssueAppliedError extends Error {
  constructor(
    message: string,
    readonly action: Exclude<DirectorIssueAction, "auto_retry">,
  ) {
    super(message);
    this.name = "PipelineIssueAppliedError";
  }
}

class PipelineIssueFailure extends Error {
  constructor(
    message: string,
    readonly issueCode: DirectorIssueCode,
    readonly stage: string,
    readonly chapterId?: string,
    readonly chapterOrder?: number,
  ) {
    super(message);
    this.name = "PipelineIssueFailure";
  }
}

function clampPipelineMaxRetries(value: number | null | undefined): number {
  return Math.max(0, Math.min(value ?? 1, 1));
}

function buildEmptyChapterDetail(chapter: { order: number; title: string }): string {
  return `第${chapter.order}章「${chapter.title}」正文生成失败：模型连续未返回可保存正文，已暂停继续。`;
}

function buildSkipCompletedChapterWhere(): Prisma.ChapterWhereInput {
  return {
    NOT: {
      AND: [
        { content: { not: null } },
        { content: { not: "" } },
        {
          OR: [
            { generationState: { in: ["approved", "published"] } },
            { chapterStatus: "completed" },
            {
              AND: [
                { riskFlags: { not: null } },
                { riskFlags: { contains: TERMINAL_CONTINUE_QUALITY_LOOP_RISK_FLAG_FRAGMENT } },
              ],
            },
          ],
        },
      ],
    },
  };
}

export class NovelPipelineExecutor {
  constructor(private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator()) {}

  private async ensurePipelineNotCancelled(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: { status: true, cancelRequestedAt: true },
    });
    if (!job || job.status === "cancelled" || job.cancelRequestedAt) {
      throw new Error("PIPELINE_CANCELLED");
    }
  }

  private async updateJobSafe(jobId: string, data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress?: number;
    completedCount?: number;
    totalCount?: number;
    endOrder?: number;
    retryCount?: number;
    pendingManualRecovery?: boolean;
    heartbeatAt?: Date | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    cancelRequestedAt?: Date | null;
    error?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    payload?: string | null;
  }) {
    try {
      await prisma.generationJob.update({ where: { id: jobId }, data });
    } catch {
      // 后台任务状态更新失败不应影响主服务稳定
    }
  }

  private async updateJobRequired(
    jobId: string,
    data: Parameters<NovelPipelineExecutor["updateJobSafe"]>[1],
  ): Promise<void> {
    await prisma.generationJob.update({ where: { id: jobId }, data });
  }

  private stringifyPipelinePayload(input: PipelinePayload) {
    return stringifyPipelineJobPayload(input);
  }

  private parsePipelinePayload(payload: string | null | undefined) {
    return parsePipelineJobPayload(payload);
  }

  async execute(jobId: string, novelId: string, options: PipelineRunOptions) {
    const maxRetries = clampPipelineMaxRetries(options.maxRetries);
    const qualityThreshold = options.qualityThreshold ?? 75;
    const existingJob = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        startedAt: true,
        completedCount: true,
        totalCount: true,
        retryCount: true,
        payload: true,
      },
    });
    const persistedPayload = this.parsePipelinePayload(existingJob?.payload);
    const runtimePayload: PipelinePayload = {
      provider: persistedPayload.provider ?? options.provider ?? "deepseek",
      model: persistedPayload.model ?? options.model ?? "",
      temperature: persistedPayload.temperature ?? options.temperature ?? 0.8,
      controlPolicy: persistedPayload.controlPolicy ?? options.controlPolicy,
      issueGovernanceVersion: persistedPayload.issueGovernanceVersion ?? options.issueGovernanceVersion,
      issuePolicySnapshot: persistedPayload.issuePolicySnapshot ?? options.issuePolicySnapshot,
      workflowTaskId: persistedPayload.workflowTaskId ?? options.workflowTaskId,
      taskStyleProfileId: persistedPayload.taskStyleProfileId ?? options.taskStyleProfileId,
      maxRetries: clampPipelineMaxRetries(persistedPayload.maxRetries ?? options.maxRetries),
      runMode: persistedPayload.runMode ?? options.runMode ?? "fast",
      autoReview: persistedPayload.autoReview ?? options.autoReview ?? true,
      autoRepair: persistedPayload.autoRepair ?? options.autoRepair ?? true,
      skipCompleted: persistedPayload.skipCompleted ?? options.skipCompleted ?? true,
      qualityThreshold: persistedPayload.qualityThreshold ?? options.qualityThreshold,
      repairMode: persistedPayload.repairMode ?? options.repairMode ?? "light_repair",
      artifactSyncMode: persistedPayload.artifactSyncMode ?? options.artifactSyncMode ?? "adaptive",
    };
    const directorTelemetryTask = runtimePayload.workflowTaskId
      ? await prisma.novelWorkflowTask.findUnique({
        where: { id: runtimePayload.workflowTaskId },
        select: {
          lane: true,
          directorRun: {
            select: { id: true },
          },
        },
      }).catch(() => null)
      : null;
    const shouldRecordDirectorTelemetry = directorTelemetryTask?.lane === "auto_director";
    const snapshottedIssueGovernance = runtimePayload.issueGovernanceVersion === DIRECTOR_ISSUE_GOVERNANCE_VERSION
      && runtimePayload.issuePolicySnapshot
      ? {
        novelId,
        issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
        policy: runtimePayload.issuePolicySnapshot,
        runMode: runtimePayload.controlPolicy?.advanceMode ?? runtimePayload.runMode,
        policySource: "task_snapshot" as const,
      }
      : null;
    const issueGovernance = snapshottedIssueGovernance ?? (shouldRecordDirectorTelemetry
      ? await loadDirectorIssueTaskContext(runtimePayload.workflowTaskId)
      : null);
    let totalRetryCount = Math.max(existingJob?.retryCount ?? 0, 0);
    const qualityAlertDetails = [...(persistedPayload.qualityAlertDetails ?? [])];
    const replanAlertDetails = [...(persistedPayload.replanAlertDetails ?? [])];
    const recoverableRepairDetails = [...(persistedPayload.recoverableRepairDetails ?? [])];
    const applyGovernedIssue = async (input: {
      issueCode: DirectorIssueCode;
      stage: string;
      summary: string;
      evidence?: string;
      chapterId?: string;
      chapterOrder?: number;
      attempt: number;
      onRetry?: () => Promise<void>;
    }): Promise<DirectorIssueAction | null> => {
      let appliedAction: DirectorIssueAction | null = null;
      const result = await reportPipelineIssue({
        governance: issueGovernance,
        workflowTaskId: runtimePayload.workflowTaskId,
        novelId,
        jobId,
        issueCode: input.issueCode,
        stage: input.stage,
        summary: input.summary,
        evidence: input.evidence,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attempt: input.attempt,
        hasUsableOutput: false,
        provider: runtimePayload.provider,
        model: runtimePayload.model,
        temperature: runtimePayload.temperature,
        applyAction: async (decision) => {
          appliedAction = decision.action;
          if (decision.action === "auto_retry") {
            if (!input.onRetry) {
              throw new Error("问题策略要求自动重试，但当前执行边界没有安全的重试入口。");
            }
            await input.onRetry();
            return;
          }
          const payload = this.stringifyPipelinePayload({
            ...runtimePayload,
            qualityAlertDetails,
            replanAlertDetails,
            recoverableRepairDetails,
          });
          if (decision.action === "pause_for_manual") {
            await this.updateJobRequired(jobId, {
              status: "queued",
              pendingManualRecovery: true,
              error: input.summary,
              heartbeatAt: null,
              currentStage: "queued",
              currentItemKey: null,
              currentItemLabel: null,
              cancelRequestedAt: null,
              finishedAt: null,
              payload,
            });
            return;
          }
          await this.updateJobRequired(jobId, {
            status: "failed",
            pendingManualRecovery: false,
            error: input.summary,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
            finishedAt: new Date(),
            payload,
          });
        },
      });
      return result ? appliedAction ?? result.decision.action : null;
    };

    try {
      await runWithLlmUsageTracking({
        generationJobId: jobId,
        workflowTaskId: runtimePayload.workflowTaskId,
        directorTelemetry: shouldRecordDirectorTelemetry,
        novelId: shouldRecordDirectorTelemetry ? novelId : null,
        directorRunId: shouldRecordDirectorTelemetry
          ? directorTelemetryTask?.directorRun?.id ?? runtimePayload.workflowTaskId ?? null
          : null,
      }, async () => {
        await this.updateJobSafe(jobId, {
          status: "running",
          pendingManualRecovery: false,
          startedAt: existingJob?.startedAt ?? new Date(),
          heartbeatAt: new Date(),
          currentStage: "generating_chapters",
        });
        logPipelineInfo("任务开始执行", {
          jobId,
          novelId,
          range: `${options.startOrder}-${options.endOrder}`,
          maxRetries,
        });

        const [novel, chapters] = await Promise.all([
          prisma.novel.findUnique({ where: { id: novelId } }),
          prisma.chapter.findMany({
            where: {
              novelId,
              order: { gte: options.startOrder, lte: options.endOrder },
              ...(options.skipCompleted
                ? buildSkipCompletedChapterWhere()
                : {}),
            },
            orderBy: { order: "asc" },
          }),
        ]);
        if (!novel || chapters.length === 0) {
          throw new Error("任务执行失败：小说或章节不存在");
        }

        logPipelineInfo("任务加载完成", {
          jobId,
          novelId,
          title: novel.title,
          chapterCount: chapters.length,
        });

        const isAutopilotMode = runtimePayload.controlPolicy?.advanceMode === "full_book_autopilot";
        const autopilotTargetEndOrder = isAutopilotMode
          ? Math.max(options.endOrder, novel.estimatedChapterCount ?? options.endOrder)
          : options.endOrder;
        let totalCount = isAutopilotMode
          ? Math.max(1, autopilotTargetEndOrder - options.startOrder + 1)
          : Math.max(existingJob?.totalCount ?? 0, chapters.length, 1);
        const storedCompleted = Math.min(Math.max(existingJob?.completedCount ?? 0, 0), totalCount);
        const filteredCompletedCount = runtimePayload.skipCompleted
          ? Math.max(0, totalCount - chapters.length)
          : 0;
        const remainingStartIndex = Math.min(
          Math.max(0, storedCompleted - filteredCompletedCount),
          chapters.length,
        );
        let completed = storedCompleted;
        const chaptersToProcess = chapters.slice(remainingStartIndex);
        let pendingManualRecovery = false;

        // Phase 3：JIT 预取服务（N+1 章执行预取）
        const prefetchVolumeService = new NovelVolumeService();
        const prefetchRouteWindowService = new ChapterRouteWindowService(prefetchVolumeService);
        const prefetchJITService = new ChapterPlanJITService({
          ensureChapterExecutionContract: (nId, cId, opts) =>
            prefetchVolumeService.ensureChapterExecutionContract(nId, cId, opts),
          ensureRouteWindow: (nId, fromOrder, opts) => (
            prefetchRouteWindowService.ensureRouteWindow(nId, fromOrder, opts)
          ),
        });
        if (isAutopilotMode) {
          await this.updateJobSafe(jobId, {
            endOrder: autopilotTargetEndOrder,
            totalCount,
          });
        }

        for (let chapterIndex = 0; chapterIndex < chaptersToProcess.length; chapterIndex++) {
          const chapter = chaptersToProcess[chapterIndex];
          await this.ensurePipelineNotCancelled(jobId);

          let shouldStopAfterCurrentChapter = false;
          let chapterStopAction: "pause_for_manual" | "fail_task" | null = null;
          const currentItemLabel = buildPipelineCurrentItemLabel({
            completedCount: completed,
            totalCount,
            chapterOrder: chapter.order,
            title: chapter.title,
          });
          let activeStage: PipelineActiveStage = "generating_chapters";
          const applyChapterStage = async (stage: PipelineActiveStage) => {
            activeStage = stage;
            await this.updateJobSafe(jobId, {
              heartbeatAt: new Date(),
              currentStage: stage,
              currentItemKey: chapter.id,
              currentItemLabel,
              progress: buildPipelineStageProgress({
                completedCount: completed,
                totalCount,
                stage,
              }),
            });
          };

          await applyChapterStage("generating_chapters");
          logPipelineInfo("开始处理章节", {
            jobId,
            chapterId: chapter.id,
            order: chapter.order,
            hasDraft: Boolean((chapter.content ?? "").trim()),
          });

          const heartbeatTimer = setInterval(() => {
            void this.updateJobSafe(jobId, {
              heartbeatAt: new Date(),
              currentStage: activeStage,
              currentItemKey: chapter.id,
              currentItemLabel,
              progress: buildPipelineStageProgress({
                completedCount: completed,
                totalCount,
                stage: activeStage,
              }),
            });
          }, PIPELINE_HEARTBEAT_INTERVAL_MS);
          heartbeatTimer.unref?.();

          let chapterResult: Awaited<ReturnType<ChapterRuntimeCoordinator["runPipelineChapter"]>> | null = null;
          const chapterRetryBudget = isAutopilotMode
            ? Math.min(maxRetries, issueGovernance?.policy.maxAutomaticRetries ?? maxRetries)
            : maxRetries;
          let chapterRetryCountUsed = 0;
          try {
            while (true) {
              try {
                chapterResult = await this.chapterRuntimeCoordinator.runPipelineChapter(
                  novelId,
                  chapter.id,
                  {
                    provider: runtimePayload.provider,
                    model: runtimePayload.model,
                    temperature: runtimePayload.temperature,
                    workflowTaskId: runtimePayload.workflowTaskId,
                    taskStyleProfileId: runtimePayload.taskStyleProfileId,
                    controlPolicy: runtimePayload.controlPolicy,
                    maxRetries: Math.max(0, chapterRetryBudget - chapterRetryCountUsed),
                    autoReview: runtimePayload.autoReview,
                    autoRepair: runtimePayload.autoRepair,
                    qualityThreshold,
                    repairMode: runtimePayload.repairMode,
                    artifactSyncMode: runtimePayload.artifactSyncMode,
                  },
                  {
                  onCheckCancelled: () => this.ensurePipelineNotCancelled(jobId),
                  onStageChange: async (stage) => {
                    await applyChapterStage(stage);
                  },
                  onRetryConsumed: async () => {
                    chapterRetryCountUsed += 1;
                  },
                  onEmptyContent: async (event) => {
                    const willRetry = event.willRetry || (isAutopilotMode && chapterRetryCountUsed < chapterRetryBudget);
                    const detail = buildEmptyChapterDetail(chapter);
                    const meta = {
                      jobId,
                      workflowTaskId: runtimePayload.workflowTaskId,
                      novelId,
                      chapterId: chapter.id,
                      chapterOrder: chapter.order,
                      provider: runtimePayload.provider,
                      model: runtimePayload.model,
                      runMode: runtimePayload.runMode,
                      emptyAttempt: event.attempt,
                      willRetry,
                      contentLength: event.contentLength,
                      rawContentLength: event.rawContentLength,
                      source: event.error.details.source,
                    };
                    if (willRetry) {
                      logPipelineWarn("章节生成未返回正文，正在重试当前章", meta);
                      return;
                    }
                    if (!qualityAlertDetails.includes(detail)) {
                      qualityAlertDetails.push(detail);
                    }
                    logPipelineError("章节生成连续未返回正文，准备自动重试当前章", meta);
                  },
                  },
                );
                break;
              } catch (error) {
                if (error instanceof Error && error.message === "PIPELINE_CANCELLED") {
                  throw error;
                }
                const message = error instanceof Error ? error.message : `第${chapter.order}章运行失败。`;
                const canOfferGovernedRetry = !(error instanceof ChapterContentPersistenceError)
                  && isAutopilotMode
                  && chapterRetryCountUsed < chapterRetryBudget;
                const action = await applyGovernedIssue({
                  issueCode: error instanceof ChapterContentPersistenceError
                    ? "runtime.persistence_failed"
                    : isChapterEmptyContentError(error)
                      ? "generation.empty_content"
                      : resolvePipelineRuntimeIssueCode(error),
                  stage: error instanceof ChapterContentPersistenceError
                    ? "chapter_persistence"
                    : "chapter_generation",
                  summary: error instanceof ChapterContentPersistenceError
                    ? `第${chapter.order}章正文无法确认已保存，已停止自动重试。`
                    : message,
                  evidence: error instanceof Error ? error.stack : undefined,
                  chapterId: chapter.id,
                  chapterOrder: chapter.order,
                  attempt: canOfferGovernedRetry
                    ? chapterRetryCountUsed
                    : issueGovernance?.policy.maxAutomaticRetries ?? chapterRetryCountUsed,
                  onRetry: canOfferGovernedRetry
                    ? async () => {
                        chapterRetryCountUsed += 1;
                        const retryLabel = `第${chapter.order}章遇到临时问题，AI 正在自动修复并重试（${chapterRetryCountUsed}/${chapterRetryBudget}）`;
                        await this.updateJobRequired(jobId, {
                          heartbeatAt: new Date(),
                          currentStage: "generating_chapters",
                          currentItemKey: chapter.id,
                          currentItemLabel: retryLabel,
                        });
                      }
                    : undefined,
                });
                if (action && action !== "auto_retry") {
                  throw new PipelineIssueAppliedError(message, action);
                }
                const canRetry = action === "auto_retry"
                  || (
                    !issueGovernance
                    && !(error instanceof ChapterContentPersistenceError)
                    && isAutopilotMode
                    && chapterRetryCountUsed < chapterRetryBudget
                  );
                if (!canRetry) {
                  throw error;
                }
                if (!action) {
                  chapterRetryCountUsed += 1;
                }
                const retryLabel = `第${chapter.order}章遇到临时问题，AI 正在自动修复并重试（${chapterRetryCountUsed}/${chapterRetryBudget}）`;
                if (!action) {
                  await this.updateJobSafe(jobId, {
                    heartbeatAt: new Date(),
                    currentStage: "generating_chapters",
                    currentItemKey: chapter.id,
                    currentItemLabel: retryLabel,
                  });
                }
                logPipelineWarn("章节运行时失败，自动重试当前章", {
                  jobId,
                  novelId,
                  chapterId: chapter.id,
                  chapterOrder: chapter.order,
                  retry: chapterRetryCountUsed,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          } finally {
            clearInterval(heartbeatTimer);
          }
          if (!chapterResult) {
            throw new Error(`第${chapter.order}章在自动重试后仍未生成可用结果。`);
          }

          totalRetryCount += Math.max(chapterRetryCountUsed, chapterResult.retryCountUsed);
          const closure = await applyChapterQualityClosure({
            governance: issueGovernance,
            workflowTaskId: runtimePayload.workflowTaskId,
            novelId,
            jobId,
            chapter: { id: chapter.id, order: chapter.order },
            chapterResult,
            qualityThreshold,
            runtimePayload,
            qualityAlertDetails,
            replanAlertDetails,
            recoverableRepairDetails,
            runLocalReplan: (replan) => plannerService.replan(novelId, {
              ...replan,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
            }),
          });
          shouldStopAfterCurrentChapter = closure.shouldStopAfterCurrentChapter;
          chapterStopAction = closure.stopAction;

          // Phase 3：同步补齐下一段章节路线；正文执行合同仍由下一章 JIT 独立生成。
          if (!shouldStopAfterCurrentChapter && isAutopilotMode && chapter.order < autopilotTargetEndOrder) {
            try {
              await prefetchRouteWindowService.ensureRouteWindow(novelId, chapter.order + 1, {
                min: 3,
                target: 5,
                provider: runtimePayload.provider,
                model: runtimePayload.model,
                temperature: runtimePayload.temperature,
                taskId: runtimePayload.workflowTaskId ?? jobId,
                completionProfile: buildDirectorCompletionProfile(autopilotTargetEndOrder),
              });
            } catch (error) {
              throw new PipelineIssueFailure(
                `滚动规划未能准备第 ${chapter.order + 1} 章，当前正文已安全保存，可从本章后恢复。`,
                "planning.route_window_unavailable",
                "route_window",
                chapter.id,
                chapter.order,
              );
            }
            const queuedNextChapter = chaptersToProcess[chapterIndex + 1];
            if (!queuedNextChapter) {
              const persistedNextChapter = await prisma.chapter.findFirst({
                where: {
                  novelId,
                  order: chapter.order + 1,
                },
                orderBy: { order: "asc" },
              });
            if (!persistedNextChapter) {
                throw new PipelineIssueFailure(
                  `滚动规划未能准备第 ${chapter.order + 1} 章，当前正文已安全保存，可从本章后恢复。`,
                  "planning.route_window_unavailable",
                  "route_window",
                  chapter.id,
                  chapter.order,
                );
              }
              chaptersToProcess.push(persistedNextChapter);
            }
          }

          const nextChapter = chaptersToProcess[chapterIndex + 1];
          if (nextChapter && isAutopilotMode) {
            void prefetchJITService.ensureExecutionReady(novelId, nextChapter.id, {
              min: 3,
              target: 5,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
              completionProfile: buildDirectorCompletionProfile(autopilotTargetEndOrder),
            }).catch((error) => {
              logPipelineInfo("N+1 JIT 预取失败（非阻断，下一章将在组装时重试）", {
                jobId,
                nextChapterId: nextChapter.id,
                nextChapterOrder: nextChapter.order,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }

          completed += 1;
          await this.updateJobSafe(jobId, {
            completedCount: completed,
            progress: Number((completed / totalCount).toFixed(4)),
            retryCount: totalRetryCount,
            heartbeatAt: new Date(),
            payload: this.stringifyPipelinePayload({
              ...runtimePayload,
              qualityAlertDetails,
              replanAlertDetails,
              recoverableRepairDetails,
            }),
          });
          logPipelineInfo("任务进度更新", {
            jobId,
            completed,
            total: totalCount,
            progress: Number((completed / totalCount).toFixed(4)),
            retryCount: totalRetryCount,
          });
          if (chapterStopAction === "fail_task") {
            const failureMessage = `第${chapter.order}章质量问题已按任务规则结束本次流水线。`;
            await this.updateJobRequired(jobId, {
              status: "failed",
              pendingManualRecovery: false,
              error: failureMessage,
              heartbeatAt: null,
              currentStage: null,
              currentItemKey: chapter.id,
              currentItemLabel: currentItemLabel,
              cancelRequestedAt: null,
              finishedAt: new Date(),
              payload: this.stringifyPipelinePayload({
                ...runtimePayload,
                qualityAlertDetails,
                replanAlertDetails,
                recoverableRepairDetails,
              }),
            });
            throw new PipelineIssueAppliedError(failureMessage, "fail_task");
          }
          if (shouldStopAfterCurrentChapter) {
            pendingManualRecovery = true;
            logPipelineWarn("章节需要人工处理，已暂停后续章节流水线", {
              jobId,
              order: chapter.order,
              remaining: Math.max(0, totalCount - completed),
            });
            break;
          }
        }

        if (pendingManualRecovery) {
          await this.updateJobSafe(jobId, {
            status: "queued",
            pendingManualRecovery: true,
            error: "章节需要人工确认，后续生成已暂停。",
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
            finishedAt: null,
            payload: this.stringifyPipelinePayload({
              ...runtimePayload,
              qualityAlertDetails,
              replanAlertDetails,
              recoverableRepairDetails,
            }),
          });
          return;
        }

        const finalStatus: "succeeded" = "succeeded";
        await this.updateJobSafe(jobId, {
          heartbeatAt: new Date(),
          currentStage: "finalizing",
          currentItemKey: null,
          currentItemLabel: "正在收尾章节流水线任务",
          progress: buildPipelineStageProgress({
            completedCount: completed,
            totalCount,
            stage: "finalizing",
          }),
        });
        await this.updateJobSafe(jobId, {
          status: finalStatus,
          error: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
          payload: this.stringifyPipelinePayload({
            ...runtimePayload,
            qualityAlertDetails,
            replanAlertDetails,
            recoverableRepairDetails,
          }),
        });
        logPipelineInfo("任务执行结束", {
          jobId,
          status: finalStatus,
          qualityAlertCount: qualityAlertDetails.length,
        });
        void novelEventBus.emit({
          type: "pipeline:completed",
          payload: { novelId, jobId, status: finalStatus },
        }).catch(() => {});
      });
    } catch (error) {
      if (error instanceof PipelineIssueAppliedError) {
        logPipelineError("任务已按问题策略结束当前执行", {
          jobId,
          novelId,
          action: error.action,
          message: error.message,
        });
        if (error.action === "fail_task") {
          void novelEventBus.emit({
            type: "pipeline:completed",
            payload: { novelId, jobId, status: "failed" },
          }).catch(() => {});
        }
        return;
      }
      if (error instanceof Error && error.message === "PIPELINE_CANCELLED") {
        await this.updateJobSafe(jobId, {
          status: "cancelled",
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
          payload: this.stringifyPipelinePayload({
            ...runtimePayload,
            qualityAlertDetails,
            replanAlertDetails,
            recoverableRepairDetails,
          }),
        });
        void novelEventBus.emit({
          type: "pipeline:completed",
          payload: { novelId, jobId, status: "cancelled" },
        }).catch(() => {});
        return;
      }

      const message = error instanceof Error ? error.message : "流水线执行失败";
      if (isChapterEmptyContentError(error)) {
        logPipelineError("任务因章节空正文失败", {
          jobId,
          novelId,
          provider: runtimePayload.provider,
          model: runtimePayload.model,
          runMode: runtimePayload.runMode,
          workflowTaskId: runtimePayload.workflowTaskId,
          source: error.details.source,
          contentLength: error.details.trimmedLength,
          rawContentLength: error.details.rawLength,
        });
      }
      const governedAction = await applyGovernedIssue({
        issueCode: error instanceof PipelineIssueFailure
          ? error.issueCode
          : error instanceof ChapterContentPersistenceError
            ? "runtime.persistence_failed"
            : isChapterEmptyContentError(error)
              ? "generation.empty_content"
              : resolvePipelineRuntimeIssueCode(error),
        stage: error instanceof PipelineIssueFailure
          ? error.stage
          : error instanceof ChapterContentPersistenceError
            ? "chapter_persistence"
            : "chapter_execution",
        summary: message,
        evidence: error instanceof Error ? error.stack : undefined,
        chapterId: error instanceof PipelineIssueFailure ? error.chapterId : undefined,
        chapterOrder: error instanceof PipelineIssueFailure ? error.chapterOrder : undefined,
        attempt: issueGovernance?.policy.maxAutomaticRetries ?? maxRetries,
      });
      if (governedAction) {
        logPipelineError("任务已按问题策略收束", {
          jobId,
          novelId,
          action: governedAction,
          message,
        });
        if (governedAction === "fail_task") {
          void novelEventBus.emit({
            type: "pipeline:completed",
            payload: { novelId, jobId, status: "failed" },
          }).catch(() => {});
        }
        return;
      }
      await this.updateJobSafe(jobId, {
        status: "failed",
        error: message,
        finishedAt: new Date(),
        payload: this.stringifyPipelinePayload({
          ...runtimePayload,
          qualityAlertDetails,
          replanAlertDetails,
          recoverableRepairDetails,
        }),
      });
      logPipelineError("任务执行异常", {
        jobId,
        novelId,
        message,
      });
      void novelEventBus.emit({
        type: "pipeline:completed",
        payload: { novelId, jobId, status: "failed" },
      }).catch(() => {});
    }
  }
}
