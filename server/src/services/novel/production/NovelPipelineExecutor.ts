import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import { runWithLlmUsageTracking } from "../../../llm/usageTracking";
import { ChapterPlanJITService } from "../planning/ChapterPlanJITService";
import { buildDirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import { ChapterRouteWindowService } from "../planning/ChapterRouteWindowService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { ChapterRuntimeCoordinator } from "../runtime/ChapterRuntimeCoordinator";
import { isChapterEmptyContentError } from "../runtime/chapterEmptyContentError";
import {
  logPipelineError,
  logPipelineInfo,
  logPipelineWarn,
  normalizeScore,
  type PipelinePayload,
  type PipelineRunOptions,
} from "../novelCoreShared";
import { createQualityReport } from "../novelCoreReviewService";
import { chapterQualityLoopService } from "../quality/ChapterQualityLoopService";
import {
  directorIssueService,
  loadDirectorIssueTaskContext,
  type DirectorIssueTaskContext,
} from "../director/issues";
import type { DirectorIssueCode } from "@ai-novel/shared/types/directorIssue";
import {
  buildPipelineCurrentItemLabel,
  buildPipelineStageProgress,
  parsePipelinePayload as parsePipelineJobPayload,
  stringifyPipelinePayload as stringifyPipelineJobPayload,
  type PipelineActiveStage,
} from "../pipelineJobState";

const PIPELINE_HEARTBEAT_INTERVAL_MS = 15000;
const TERMINAL_CONTINUE_QUALITY_LOOP_RISK_FLAG_FRAGMENT = '"terminalAction":"defer_and_continue"';

function clampPipelineMaxRetries(value: number | null | undefined): number {
  return Math.max(0, Math.min(value ?? 2, 2));
}

function buildEmptyChapterDetail(chapter: { order: number; title: string }): string {
  return `第${chapter.order}章「${chapter.title}」正文生成失败：模型连续未返回可保存正文，已暂停继续。`;
}

async function reportPipelineIssue(input: {
  governance: DirectorIssueTaskContext | null;
  workflowTaskId?: string;
  novelId: string;
  jobId: string;
  issueCode: DirectorIssueCode;
  stage: string;
  summary: string;
  evidence?: string;
  chapterId?: string;
  chapterOrder?: number;
  qualityScores?: Record<string, number>;
  attempt?: number;
  maxAttempts?: number;
  hasUsableOutput?: boolean;
  provider?: PipelinePayload["provider"];
  model?: string;
  temperature?: number;
}): Promise<void> {
  if (!input.governance || !input.workflowTaskId) return;
  await directorIssueService.reportIssue({
    issueGovernanceVersion: input.governance.issueGovernanceVersion,
    taskId: input.workflowTaskId,
    novelId: input.novelId,
    issueCode: input.issueCode,
    stage: input.stage,
    summary: input.summary,
    evidence: input.evidence,
    affectedScope: input.chapterId ? `chapter:${input.chapterId}` : `pipeline:${input.jobId}`,
    chapterId: input.chapterId,
    chapterOrder: input.chapterOrder,
    qualityScores: input.qualityScores,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    hasUsableOutput: input.hasUsableOutput,
    runMode: input.governance.runMode,
    fingerprint: [input.jobId, input.issueCode, input.chapterId ?? "book", input.attempt ?? 0].join(":"),
    policy: input.governance.policy,
    policySource: input.governance.policySource,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
  }).catch((error) => {
    logPipelineWarn("自动导演问题记录失败", {
      jobId: input.jobId,
      issueCode: input.issueCode,
      error: error instanceof Error ? error.message : String(error),
    });
  });
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

async function consumeProfessionalHandoffAtChapterBoundary(
  workflowTaskId: string | null | undefined,
  novelId: string,
): Promise<boolean> {
  if (!workflowTaskId) return false;
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: workflowTaskId },
    select: { seedPayloadJson: true },
  });
  if (!task?.seedPayloadJson) return false;
  let seed: Record<string, unknown>;
  try {
    seed = JSON.parse(task.seedPayloadJson) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (seed.pendingProductionExperience !== "professional") return false;
  const directorInput = seed.directorInput && typeof seed.directorInput === "object"
    ? { ...(seed.directorInput as Record<string, unknown>), runMode: "auto_to_ready", autoExecutionPlan: undefined }
    : seed.directorInput;
  const nextSeed = {
    ...seed,
    productionExperience: "professional",
    pendingProductionExperience: undefined,
    runMode: "auto_to_ready",
    autoExecutionPlan: undefined,
    directorInput,
  };
  await prisma.$transaction([
    prisma.novel.update({
      where: { id: novelId },
      data: { creationExperience: "professional" },
    }),
    prisma.novelWorkflowTask.update({
      where: { id: workflowTaskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeed),
        status: "succeeded",
        progress: 1,
        currentStage: "chapter_execution",
        currentItemKey: "professional_production_handoff",
        currentItemLabel: "已暂停并交接精细创作",
        checkpointType: "workflow_completed",
        checkpointSummary: "当前章节已安全保存，后续自动章节已停止。",
        pendingManualRecovery: false,
        finishedAt: new Date(),
      },
    }),
  ]);
  return true;
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
    const issueGovernance = shouldRecordDirectorTelemetry
      ? await loadDirectorIssueTaskContext(runtimePayload.workflowTaskId)
      : null;
    let totalRetryCount = Math.max(existingJob?.retryCount ?? 0, 0);
    const qualityAlertDetails = [...(persistedPayload.qualityAlertDetails ?? [])];
    const replanAlertDetails = [...(persistedPayload.replanAlertDetails ?? [])];
    const recoverableRepairDetails = [...(persistedPayload.recoverableRepairDetails ?? [])];

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

          let final = { score: normalizeScore({}), issues: [] as ReviewIssue[] };
          let shouldStopAfterCurrentChapter = false;
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
          const chapterExecutionRetryLimit = isAutopilotMode ? 2 : 0;
          try {
            for (let executionAttempt = 0; executionAttempt <= chapterExecutionRetryLimit; executionAttempt += 1) {
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
                  maxRetries,
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
                  onEmptyContent: async (event) => {
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
                      willRetry: event.willRetry,
                      contentLength: event.contentLength,
                      rawContentLength: event.rawContentLength,
                      source: event.error.details.source,
                    };
                    await reportPipelineIssue({
                      governance: issueGovernance,
                      workflowTaskId: runtimePayload.workflowTaskId,
                      novelId,
                      jobId,
                      issueCode: "generation.empty_content",
                      stage: "chapter_generation",
                      summary: detail,
                      evidence: `source=${event.error.details.source}; length=${event.contentLength}`,
                      chapterId: chapter.id,
                      chapterOrder: chapter.order,
                      attempt: event.attempt,
                      maxAttempts: maxRetries + 1,
                      hasUsableOutput: false,
                      provider: runtimePayload.provider,
                      model: runtimePayload.model,
                      temperature: runtimePayload.temperature,
                    });
                    if (event.willRetry) {
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
                const canRetry = executionAttempt < chapterExecutionRetryLimit;
                if (!canRetry) {
                  throw error;
                }
                const retryLabel = `第${chapter.order}章遇到临时问题，AI 正在自动修复并重试（${executionAttempt + 1}/${chapterExecutionRetryLimit}）`;
                await this.updateJobSafe(jobId, {
                  heartbeatAt: new Date(),
                  currentStage: "generating_chapters",
                  currentItemKey: chapter.id,
                  currentItemLabel: retryLabel,
                });
                logPipelineWarn("章节运行时失败，自动重试当前章", {
                  jobId,
                  novelId,
                  chapterId: chapter.id,
                  chapterOrder: chapter.order,
                  retry: executionAttempt + 1,
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

          totalRetryCount += chapterResult.retryCountUsed;
          final = { score: chapterResult.score, issues: chapterResult.issues };
          if (runtimePayload.autoReview && !chapterResult.reviewExecuted) {
            await reportPipelineIssue({
              governance: issueGovernance,
              workflowTaskId: runtimePayload.workflowTaskId,
              novelId,
              jobId,
              issueCode: "quality.acceptance_unavailable",
              stage: "chapter_review",
              summary: `第${chapter.order}章接收检查未能执行，正文已保留并等待后续复查。`,
              chapterId: chapter.id,
              chapterOrder: chapter.order,
              hasUsableOutput: true,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
            });
          }
          const replanRecommendation = chapterResult.runtimePackage?.replanRecommendation;
          const qualityDebtTerminalAction = chapterResult.pass || replanRecommendation?.action === "stop_for_replan"
            ? null
            : "defer_and_continue" as const;
          if (chapterResult.recoverableRepairFailure) {
            recoverableRepairDetails.push(
              `第${chapter.order}章需要后续修复：${chapterResult.recoverableRepairFailure.message}`,
            );
            logPipelineWarn("章节局部修复未安全应用，已记录并继续后续章节", {
              jobId,
              order: chapter.order,
              reason: chapterResult.recoverableRepairFailure.message,
              failureTypes: chapterResult.recoverableRepairFailure.failureTypes,
            });
            await reportPipelineIssue({
              governance: issueGovernance,
              workflowTaskId: runtimePayload.workflowTaskId,
              novelId,
              jobId,
              issueCode: "quality.local_repair_failed",
              stage: "chapter_repair",
              summary: chapterResult.recoverableRepairFailure.message,
              evidence: chapterResult.recoverableRepairFailure.failureTypes.join(", "),
              chapterId: chapter.id,
              chapterOrder: chapter.order,
              hasUsableOutput: true,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
            });
          }
          if (chapterResult.reviewExecuted) {
            await createQualityReport(novelId, chapter.id, final.score, final.issues);
            await chapterQualityLoopService.recordAssessment({
              novelId,
              chapterId: chapter.id,
              chapterOrder: chapter.order,
              score: final.score,
              issues: final.issues,
              runtimePackage: chapterResult.runtimePackage,
              source: chapterResult.retryCountUsed > 0 ? "repair_recheck" : "pipeline_review",
              terminalAction: qualityDebtTerminalAction,
              taskId: runtimePayload.workflowTaskId,
              qualityDebtAttribution: chapterResult.qualityDebtAttribution ?? null,
            }).catch((error) => {
              logPipelineError("记录章节质量闭环状态失败", {
                jobId,
                novelId,
                chapterId: chapter.id,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }

          if (chapterResult.reviewExecuted && !chapterResult.pass) {
            qualityAlertDetails.push(
              `第${chapter.order}章（coherence=${final.score.coherence}, repetition=${final.score.repetition}, engagement=${final.score.engagement}）`,
            );
            logPipelineWarn("章节最终未达标", {
              jobId,
              order: chapter.order,
              score: final.score,
            });
            await reportPipelineIssue({
              governance: issueGovernance,
              workflowTaskId: runtimePayload.workflowTaskId,
              novelId,
              jobId,
              issueCode: "quality.chapter_below_threshold",
              stage: "chapter_review",
              summary: `第${chapter.order}章质量分未达到 ${qualityThreshold} 分。`,
              chapterId: chapter.id,
              chapterOrder: chapter.order,
              qualityScores: {
                coherence: final.score.coherence,
                repetition: final.score.repetition,
                engagement: final.score.engagement,
              },
              hasUsableOutput: true,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
            });
          }

          if (replanRecommendation?.recommended) {
            const impactedOrders = replanRecommendation.affectedChapterOrders?.length
              ? `影响章节=${replanRecommendation.affectedChapterOrders.join(",")}`
              : `锚点章节=${replanRecommendation.anchorChapterOrder ?? chapter.order}`;
            const detail = `第${chapter.order}章${replanRecommendation.action === "stop_for_replan" ? "需要重规划" : "建议局部处理"}（${impactedOrders}；原因=${replanRecommendation.triggerReason ?? replanRecommendation.reason}）`;
            if (replanRecommendation.action === "stop_for_replan") {
              await reportPipelineIssue({
                governance: issueGovernance,
                workflowTaskId: runtimePayload.workflowTaskId,
                novelId,
                jobId,
                issueCode: "quality.replan_required",
                stage: "chapter_review",
                summary: detail,
                evidence: replanRecommendation.reason,
                chapterId: chapter.id,
                chapterOrder: chapter.order,
                hasUsableOutput: true,
                provider: runtimePayload.provider,
                model: runtimePayload.model,
                temperature: runtimePayload.temperature,
              });
              replanAlertDetails.push(detail);
              shouldStopAfterCurrentChapter = true;
            } else if (!qualityAlertDetails.includes(detail)) {
              qualityAlertDetails.push(detail);
            }
          }

          const handedOffToProfessional = await consumeProfessionalHandoffAtChapterBoundary(
            runtimePayload.workflowTaskId,
            novelId,
          );
          if (handedOffToProfessional) {
            shouldStopAfterCurrentChapter = true;
            logPipelineInfo("当前章节已安全保存，自动创作已交接到专业工作台", {
              jobId,
              order: chapter.order,
            });
          }

          // Phase 3：N+1 章 JIT 预取
          // 当前章 finalize 完成后（factLedger 已写入），后台触发下一章的 task sheet 生成。
          // fire-and-forget：预取失败不影响当前流水线，下一章正式组装时会重试。
          if (!shouldStopAfterCurrentChapter && isAutopilotMode && chapter.order < autopilotTargetEndOrder) {
            await prefetchRouteWindowService.ensureRouteWindow(novelId, chapter.order + 1, {
              min: 3,
              target: 5,
              provider: runtimePayload.provider,
              model: runtimePayload.model,
              temperature: runtimePayload.temperature,
              taskId: runtimePayload.workflowTaskId ?? jobId,
              completionProfile: buildDirectorCompletionProfile(autopilotTargetEndOrder),
            });
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
                await reportPipelineIssue({
                  governance: issueGovernance,
                  workflowTaskId: runtimePayload.workflowTaskId,
                  novelId,
                  jobId,
                  issueCode: "planning.route_window_unavailable",
                  stage: "route_window",
                  summary: `滚动规划未能准备第 ${chapter.order + 1} 章。`,
                  chapterId: chapter.id,
                  chapterOrder: chapter.order,
                  attempt: maxRetries,
                  maxAttempts: maxRetries,
                  hasUsableOutput: true,
                  provider: runtimePayload.provider,
                  model: runtimePayload.model,
                  temperature: runtimePayload.temperature,
                });
                throw new Error(`滚动规划未能准备第 ${chapter.order + 1} 章，当前正文已安全保存，可从本章后恢复。`);
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
              void reportPipelineIssue({
                governance: issueGovernance,
                workflowTaskId: runtimePayload.workflowTaskId,
                novelId,
                jobId,
                issueCode: "runtime.background_prefetch_failed",
                stage: "background_prefetch",
                summary: `第 ${nextChapter.order} 章后台预取失败，正式执行时将重新准备。`,
                evidence: error instanceof Error ? error.message : String(error),
                chapterId: nextChapter.id,
                chapterOrder: nextChapter.order,
                hasUsableOutput: true,
                provider: runtimePayload.provider,
                model: runtimePayload.model,
                temperature: runtimePayload.temperature,
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
          if (shouldStopAfterCurrentChapter) {
            logPipelineWarn("章节触发重规划，已停止后续章节流水线", {
              jobId,
              order: chapter.order,
              remaining: Math.max(0, totalCount - completed),
            });
            break;
          }
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
      } else {
        await reportPipelineIssue({
          governance: issueGovernance,
          workflowTaskId: runtimePayload.workflowTaskId,
          novelId,
          jobId,
          issueCode: "generation.runtime_failed",
          stage: "chapter_execution",
          summary: message,
          evidence: error instanceof Error ? error.stack : undefined,
          attempt: maxRetries,
          maxAttempts: maxRetries,
          hasUsableOutput: false,
          provider: runtimePayload.provider,
          model: runtimePayload.model,
          temperature: runtimePayload.temperature,
        });
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
