import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { novelEventBus } from "../../events";
import { runWithLlmUsageTracking } from "../../llm/usageTracking";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import {
  logPipelineError,
  logPipelineInfo,
  logPipelineWarn,
  normalizeScore,
  PipelinePayload,
  PipelineRunOptions,
} from "./novelCoreShared";
import { ensureNovelCharacters } from "./novelCoreSupport";
import { createQualityReport } from "./novelCoreReviewService";
import { selectPrimaryPipelineJob } from "./pipelineJobDedup";

const PIPELINE_ACTIVE_STAGES = ["queued", "generating_chapters", "reviewing", "repairing", "finalizing"] as const;
const PIPELINE_HEARTBEAT_INTERVAL_MS = 15000;
const PIPELINE_STAGE_PROGRESS = {
  queued: 0,
  generating_chapters: 0.2,
  reviewing: 0.65,
  repairing: 0.88,
  finalizing: 0.98,
} as const;

type PipelineActiveStage = (typeof PIPELINE_ACTIVE_STAGES)[number];

function isPipelineActiveStage(value: string | null | undefined): value is PipelineActiveStage {
  return PIPELINE_ACTIVE_STAGES.includes((value ?? "") as PipelineActiveStage);
}

function clampPipelineProgress(value: number, stage: PipelineActiveStage): number {
  const max = stage === "finalizing" ? 0.999 : 0.995;
  return Number(Math.max(0, Math.min(max, value)).toFixed(4));
}

export function buildPipelineStageProgress(input: {
  completedCount: number;
  totalCount: number;
  stage: PipelineActiveStage;
}): number {
  if (input.totalCount <= 0) {
    return 0;
  }
  const completedBase = Math.max(0, input.completedCount) / input.totalCount;
  const stageFraction = PIPELINE_STAGE_PROGRESS[input.stage] ?? 0;
  return clampPipelineProgress((Math.max(0, input.completedCount) + stageFraction) / input.totalCount, input.stage)
    || Number(completedBase.toFixed(4));
}

export function buildPipelineCurrentItemLabel(input: {
  completedCount: number;
  totalCount: number;
  chapterOrder: number;
  title: string;
}): string {
  const currentIndex = Math.min(input.totalCount, Math.max(1, input.completedCount + 1));
  return `第 ${input.chapterOrder} 章 · ${input.title.trim()} · 批次 ${currentIndex}/${input.totalCount}`;
}

export class NovelCorePipelineService {
  private static readonly activeJobIds = new Set<string>();
  private static readonly startLocks = new Set<string>();
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  private buildRangeKey(novelId: string, startOrder: number, endOrder: number): string {
    return `${novelId}:${startOrder}:${endOrder}`;
  }

  private async waitForStartLock(key: string): Promise<void> {
    while (NovelCorePipelineService.startLocks.has(key)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async withStartLock<T>(key: string, runner: () => Promise<T>): Promise<T> {
    await this.waitForStartLock(key);
    NovelCorePipelineService.startLocks.add(key);
    try {
      return await runner();
    } finally {
      NovelCorePipelineService.startLocks.delete(key);
    }
  }

  private async listActivePipelineJobsForRange(novelId: string, startOrder: number, endOrder: number) {
    return prisma.generationJob.findMany({
      where: {
        novelId,
        startOrder,
        endOrder,
        status: { in: ["queued", "running"] },
      },
      orderBy: [
        { completedCount: "desc" },
        { progress: "desc" },
        { updatedAt: "desc" },
        { createdAt: "asc" },
      ],
    });
  }

  private async reconcileActivePipelineJobsForRange(input: {
    novelId: string;
    startOrder: number;
    endOrder: number;
    preferredJobId?: string | null;
  }) {
    const jobs = await this.listActivePipelineJobsForRange(input.novelId, input.startOrder, input.endOrder);
    if (jobs.length === 0) {
      return null;
    }

    const primaryJob = selectPrimaryPipelineJob(jobs, input.preferredJobId);
    const duplicateJobs = jobs.filter((job) => job.id !== primaryJob.id);

    if (duplicateJobs.length > 0) {
      const cancelledAt = new Date();
      await prisma.generationJob.updateMany({
        where: {
          id: { in: duplicateJobs.map((job) => job.id) },
          status: { in: ["queued", "running"] },
        },
        data: {
          status: "cancelled",
          error: `检测到同一本书相同章节区间存在重复流水线，已切换为主任务 ${primaryJob.id}。`,
          cancelRequestedAt: cancelledAt,
          heartbeatAt: cancelledAt,
          finishedAt: cancelledAt,
        },
      });
      logPipelineWarn("发现重复活跃批量任务，已取消重复项", {
        novelId: input.novelId,
        range: `${input.startOrder}-${input.endOrder}`,
        primaryJobId: primaryJob.id,
        cancelledJobIds: duplicateJobs.map((job) => job.id),
      });
    }

    return primaryJob;
  }

  async findActivePipelineJobForRange(
    novelId: string,
    startOrder: number,
    endOrder: number,
    preferredJobId?: string | null,
  ) {
    return this.reconcileActivePipelineJobsForRange({
      novelId,
      startOrder,
      endOrder,
      preferredJobId,
    });
  }

  async listRecoverablePipelineJobs(): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        status: { in: ["queued", "running"] },
        finishedAt: null,
        cancelRequestedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async listPendingCancellationPipelineJobs(): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        finishedAt: null,
        cancelRequestedAt: { not: null },
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async listStaleRecoverablePipelineJobs(cutoff: Date): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        status: { in: ["queued", "running"] },
        finishedAt: null,
        cancelRequestedAt: null,
        OR: [
          { heartbeatAt: { lt: cutoff } },
          { heartbeatAt: null, updatedAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async markPipelineJobFailed(jobId: string, message: string): Promise<void> {
    await this.updateJobSafe(jobId, {
      status: "failed",
      error: message.trim(),
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      finishedAt: new Date(),
    });
  }

  async markPipelineJobCancelled(jobId: string): Promise<void> {
    await this.updateJobSafe(jobId, {
      status: "cancelled",
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      finishedAt: new Date(),
    });
  }

  async resumePipelineJob(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        novelId: true,
        status: true,
        startOrder: true,
        endOrder: true,
        runMode: true,
        autoReview: true,
        autoRepair: true,
        skipCompleted: true,
        qualityThreshold: true,
        repairMode: true,
        maxRetries: true,
        payload: true,
      },
    });
    if (!job) {
      throw new Error("章节流水线任务不存在。");
    }
    if (job.status !== "queued" && job.status !== "running") {
      return;
    }
    const payload = this.parsePipelinePayload(job.payload);
    this.schedulePipelineExecution(job.id, job.novelId, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
      workflowTaskId: payload.workflowTaskId,
      maxRetries: job.maxRetries,
      runMode: job.runMode ?? payload.runMode,
      autoReview: job.autoReview ?? payload.autoReview,
      autoRepair: job.autoRepair ?? payload.autoRepair,
      skipCompleted: job.skipCompleted ?? payload.skipCompleted,
      qualityThreshold: job.qualityThreshold ?? payload.qualityThreshold,
      repairMode: job.repairMode ?? payload.repairMode,
      provider: payload.provider,
      model: payload.model,
      temperature: payload.temperature,
    });
  }

  async startPipelineJob(novelId: string, options: PipelineRunOptions) {
    const rangeKey = this.buildRangeKey(novelId, options.startOrder, options.endOrder);
    return this.withStartLock(rangeKey, async () => {
      await ensureNovelCharacters(novelId, "启动批量章节流水");

      const existingActiveJob = await this.reconcileActivePipelineJobsForRange({
        novelId,
        startOrder: options.startOrder,
        endOrder: options.endOrder,
      });
      if (existingActiveJob) {
        logPipelineWarn("检测到同区间已有活跃批量任务，复用现有任务", {
          novelId,
          range: `${options.startOrder}-${options.endOrder}`,
          reusedJobId: existingActiveJob.id,
        });
        this.schedulePipelineExecution(existingActiveJob.id, novelId, options);
        return existingActiveJob;
      }

      const chapterStats = await prisma.chapter.aggregate({
        where: { novelId },
        _min: { order: true },
        _max: { order: true },
        _count: { order: true },
      });
      if ((chapterStats._count.order ?? 0) === 0) {
        throw new Error("当前小说还没有章节，请先创建章节后再启动流水线");
      }

      const chapters = await prisma.chapter.findMany({
        where: {
          novelId,
          order: { gte: options.startOrder, lte: options.endOrder },
          ...(options.skipCompleted
            ? { generationState: { notIn: ["approved", "published"] as const } }
            : {}),
        },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (chapters.length === 0) {
        const minOrder = chapterStats._min.order ?? 1;
        const maxOrder = chapterStats._max.order ?? 1;
        throw new Error(`指定区间内没有可生成的章节。当前可用章节范围为 ${minOrder} 章到 ${maxOrder} 章。`);
      }

      logPipelineInfo("创建批量任务", {
        novelId,
        range: `${options.startOrder}-${options.endOrder}`,
        matchedChapters: chapters.length,
        availableRange: `${chapterStats._min.order ?? 1}-${chapterStats._max.order ?? 1}`,
        maxRetries: options.maxRetries ?? 2,
        provider: options.provider ?? "deepseek",
        model: options.model ?? "",
      });

      const job = await prisma.generationJob.create({
        data: {
          novelId,
          startOrder: options.startOrder,
          endOrder: options.endOrder,
          runMode: options.runMode ?? "fast",
          autoReview: options.autoReview ?? true,
          autoRepair: options.autoRepair ?? true,
          skipCompleted: options.skipCompleted ?? true,
          qualityThreshold: options.qualityThreshold ?? null,
          repairMode: options.repairMode ?? "light_repair",
          status: "queued",
          totalCount: chapters.length,
          maxRetries: options.maxRetries ?? 2,
          currentStage: "queued",
          payload: this.stringifyPipelinePayload({
            provider: options.provider ?? "deepseek",
            model: options.model ?? "",
            temperature: options.temperature ?? 0.8,
            workflowTaskId: options.workflowTaskId?.trim() || undefined,
            maxRetries: options.maxRetries ?? 2,
            runMode: options.runMode ?? "fast",
            autoReview: options.autoReview ?? true,
            autoRepair: options.autoRepair ?? true,
            skipCompleted: options.skipCompleted ?? true,
            qualityThreshold: options.qualityThreshold,
            repairMode: options.repairMode ?? "light_repair",
          }),
        },
      });

      logPipelineInfo("批量任务已入队", {
        jobId: job.id,
        novelId,
        totalCount: job.totalCount,
      });

      this.schedulePipelineExecution(job.id, novelId, options);
      return job;
    });
  }

  async getPipelineJob(novelId: string, jobId: string) {
    return prisma.generationJob.findFirst({ where: { id: jobId, novelId } });
  }

  async getPipelineJobById(jobId: string) {
    return prisma.generationJob.findUnique({ where: { id: jobId } });
  }

  async retryPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("仅失败或已取消的任务支持重试。");
    }
    if (job.status === "cancelled" && job.cancelRequestedAt && !job.finishedAt) {
      throw new Error("任务仍在取消中，请等待取消完成后再重试。");
    }

    const payload = this.parsePipelinePayload(job.payload);
    return this.startPipelineJob(job.novelId, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
      workflowTaskId: payload.workflowTaskId,
      maxRetries: job.maxRetries,
      runMode: job.runMode ?? payload.runMode,
      autoReview: job.autoReview ?? payload.autoReview,
      autoRepair: job.autoRepair ?? payload.autoRepair,
      skipCompleted: job.skipCompleted ?? payload.skipCompleted,
      qualityThreshold: job.qualityThreshold ?? payload.qualityThreshold,
      repairMode: job.repairMode ?? payload.repairMode,
      provider: payload.provider,
      model: payload.model,
      temperature: payload.temperature,
    });
  }

  async cancelPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      throw new Error("仅排队中或运行中的任务可取消。");
    }
    if (job.status === "queued") {
      return prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          cancelRequestedAt: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          finishedAt: new Date(),
        },
      });
    }
    return prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        cancelRequestedAt: new Date(),
        heartbeatAt: new Date(),
        finishedAt: null,
      },
    });
  }

  private parsePipelinePayload(payload: string | null | undefined): PipelinePayload {
    if (!payload?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      return {
        provider: typeof parsed.provider === "string" ? (parsed.provider as PipelinePayload["provider"]) : undefined,
        model: typeof parsed.model === "string" ? parsed.model : undefined,
        temperature: typeof parsed.temperature === "number" ? parsed.temperature : undefined,
        workflowTaskId: typeof parsed.workflowTaskId === "string" ? parsed.workflowTaskId : undefined,
        maxRetries: typeof parsed.maxRetries === "number" ? parsed.maxRetries : undefined,
        runMode: parsed.runMode === "polish" ? "polish" : parsed.runMode === "fast" ? "fast" : undefined,
        autoReview: typeof parsed.autoReview === "boolean" ? parsed.autoReview : undefined,
        autoRepair: typeof parsed.autoRepair === "boolean" ? parsed.autoRepair : undefined,
        skipCompleted: typeof parsed.skipCompleted === "boolean" ? parsed.skipCompleted : undefined,
        qualityThreshold: typeof parsed.qualityThreshold === "number" ? parsed.qualityThreshold : undefined,
        repairMode:
          parsed.repairMode === "detect_only"
          || parsed.repairMode === "light_repair"
          || parsed.repairMode === "heavy_repair"
          || parsed.repairMode === "continuity_only"
          || parsed.repairMode === "character_only"
          || parsed.repairMode === "ending_only"
            ? parsed.repairMode
            : undefined,
        failedDetails: Array.isArray(parsed.failedDetails)
          ? parsed.failedDetails.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : undefined,
      };
    } catch {
      return {};
    }
  }

  private stringifyPipelinePayload(input: PipelinePayload): string {
    const failedDetails = Array.isArray(input.failedDetails)
      ? input.failedDetails.map((item) => item.trim()).filter(Boolean)
      : [];
    return JSON.stringify({
      provider: input.provider ?? "deepseek",
      model: input.model ?? "",
      temperature: input.temperature ?? 0.8,
      ...(input.workflowTaskId?.trim() ? { workflowTaskId: input.workflowTaskId.trim() } : {}),
      ...(typeof input.maxRetries === "number" ? { maxRetries: input.maxRetries } : {}),
      runMode: input.runMode ?? "fast",
      autoReview: input.autoReview ?? true,
      autoRepair: input.autoRepair ?? true,
      skipCompleted: input.skipCompleted ?? true,
      qualityThreshold: input.qualityThreshold ?? null,
      repairMode: input.repairMode ?? "light_repair",
      ...(failedDetails.length > 0 ? { failedDetails } : {}),
    });
  }

  private async ensurePipelineNotCancelled(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!job || job.status === "cancelled" || job.cancelRequestedAt) {
      throw new Error("PIPELINE_CANCELLED");
    }
  }

  private async updateJobSafe(jobId: string, data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress?: number;
    completedCount?: number;
    retryCount?: number;
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
      await prisma.generationJob.update({
        where: { id: jobId },
        data,
      });
    } catch {
      // 后台任务状态更新失败不应影响主服务稳定
    }
  }

  private schedulePipelineExecution(jobId: string, novelId: string, options: PipelineRunOptions): void {
    if (NovelCorePipelineService.activeJobIds.has(jobId)) {
      return;
    }
    NovelCorePipelineService.activeJobIds.add(jobId);
    void this.executePipeline(jobId, novelId, options)
      .catch(() => {
        // 防止后台任务未处理拒绝导致进程不稳定
      })
      .finally(() => {
        NovelCorePipelineService.activeJobIds.delete(jobId);
      });
  }

  private async executePipeline(jobId: string, novelId: string, options: PipelineRunOptions) {
    const maxRetries = options.maxRetries ?? 2;
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
      workflowTaskId: persistedPayload.workflowTaskId ?? options.workflowTaskId,
      maxRetries: persistedPayload.maxRetries ?? options.maxRetries ?? 2,
      runMode: persistedPayload.runMode ?? options.runMode ?? "fast",
      autoReview: persistedPayload.autoReview ?? options.autoReview ?? true,
      autoRepair: persistedPayload.autoRepair ?? options.autoRepair ?? true,
      skipCompleted: persistedPayload.skipCompleted ?? options.skipCompleted ?? true,
      qualityThreshold: persistedPayload.qualityThreshold ?? options.qualityThreshold,
      repairMode: persistedPayload.repairMode ?? options.repairMode ?? "light_repair",
    };
    let totalRetryCount = Math.max(existingJob?.retryCount ?? 0, 0);
    const failedDetails = [...(persistedPayload.failedDetails ?? [])];

    try {
      await runWithLlmUsageTracking({
        generationJobId: jobId,
        workflowTaskId: runtimePayload.workflowTaskId,
      }, async () => {
        await this.updateJobSafe(jobId, {
          status: "running",
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
                ? { generationState: { notIn: ["approved", "published"] as const } }
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

        const totalCount = Math.max(existingJob?.totalCount ?? 0, chapters.length, 1);
        let completed = Math.min(Math.max(existingJob?.completedCount ?? 0, 0), chapters.length);
        const chaptersToProcess = chapters.slice(completed);
        for (const chapter of chaptersToProcess) {
          await this.ensurePipelineNotCancelled(jobId);
          let final = { score: normalizeScore({}), issues: [] as ReviewIssue[] };
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

          const chapterResult = await this.chapterRuntimeCoordinator.runPipelineChapter(
            novelId,
            chapter.id,
            {
              provider: options.provider,
              model: options.model,
              temperature: options.temperature,
              maxRetries,
              autoRepair: options.autoRepair,
              qualityThreshold,
              repairMode: options.repairMode,
            },
            {
              onCheckCancelled: () => this.ensurePipelineNotCancelled(jobId),
              onStageChange: async (stage) => {
                await applyChapterStage(stage);
              },
            },
          ).finally(() => {
            clearInterval(heartbeatTimer);
          });

          totalRetryCount += chapterResult.retryCountUsed;
          final = { score: chapterResult.score, issues: chapterResult.issues };
          await createQualityReport(novelId, chapter.id, final.score, final.issues);

          if (!chapterResult.pass) {
            failedDetails.push(
              `${chapter.order}章（coherence=${final.score.coherence}, repetition=${final.score.repetition}, engagement=${final.score.engagement}）`,
            );
            logPipelineWarn("章节最终未达标", {
              jobId,
              order: chapter.order,
              score: final.score,
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
              failedDetails,
            }),
          });
          logPipelineInfo("任务进度更新", {
            jobId,
            completed,
            total: totalCount,
            progress: Number((completed / totalCount).toFixed(4)),
            retryCount: totalRetryCount,
          });
        }

        const finalStatus = failedDetails.length === 0 ? "succeeded" : "failed";
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
          error: failedDetails.length === 0 ? null : `以下章节未达标：${failedDetails.join("；")}`,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
          payload: this.stringifyPipelinePayload({
            ...runtimePayload,
            failedDetails: finalStatus === "failed" ? failedDetails : [],
          }),
        });
        logPipelineInfo("任务执行结束", {
          jobId,
          status: finalStatus,
          failedDetails,
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
            failedDetails,
          }),
        });
        void novelEventBus.emit({
          type: "pipeline:completed",
          payload: { novelId, jobId, status: "cancelled" },
        }).catch(() => {});
        return;
      }

      await this.updateJobSafe(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : "流水线执行失败",
        finishedAt: new Date(),
        payload: this.stringifyPipelinePayload({
          ...runtimePayload,
          failedDetails,
        }),
      });
      logPipelineError("任务执行异常", {
        jobId,
        novelId,
        message: error instanceof Error ? error.message : "流水线执行失败",
      });
      void novelEventBus.emit({
        type: "pipeline:completed",
        payload: { novelId, jobId, status: "failed" },
      }).catch(() => {});
    }
  }
}
