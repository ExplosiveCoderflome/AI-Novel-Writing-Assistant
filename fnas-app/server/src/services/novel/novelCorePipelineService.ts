import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { novelEventBus } from "../../events";
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

export class NovelCorePipelineService {
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  async startPipelineJob(novelId: string, options: PipelineRunOptions) {
    await ensureNovelCharacters(novelId, "启动批量章节流水");

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
        payload: JSON.stringify({
          provider: options.provider ?? "deepseek",
          model: options.model ?? "",
          temperature: options.temperature ?? 0.8,
          runMode: options.runMode ?? "fast",
          autoReview: options.autoReview ?? true,
          autoRepair: options.autoRepair ?? true,
          skipCompleted: options.skipCompleted ?? true,
          qualityThreshold: options.qualityThreshold ?? null,
          repairMode: options.repairMode ?? "light_repair",
        }),
      },
    });

    logPipelineInfo("批量任务已入队", {
      jobId: job.id,
      novelId,
      totalCount: job.totalCount,
    });

    void this.executePipeline(job.id, novelId, options).catch(() => {
      // 防止后台任务未处理拒绝导致进程不稳定
    });
    return job;
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

    const payload = this.parsePipelinePayload(job.payload);
    return this.startPipelineJob(job.novelId, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
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
        cancelRequestedAt: new Date(),
        heartbeatAt: new Date(),
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
      };
    } catch {
      return {};
    }
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

  private async executePipeline(jobId: string, novelId: string, options: PipelineRunOptions) {
    const maxRetries = options.maxRetries ?? 2;
    const qualityThreshold = options.qualityThreshold ?? 75;
    let totalRetryCount = 0;
    const failedDetails: string[] = [];

    try {
      await this.updateJobSafe(jobId, {
        status: "running",
        startedAt: new Date(),
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

      let completed = 0;
      for (const chapter of chapters) {
        await this.ensurePipelineNotCancelled(jobId);
        let final = { score: normalizeScore({}), issues: [] as ReviewIssue[] };

        await this.updateJobSafe(jobId, {
          heartbeatAt: new Date(),
          currentStage: "generating_chapters",
          currentItemKey: chapter.id,
          currentItemLabel: chapter.title,
        });
        logPipelineInfo("开始处理章节", {
          jobId,
          chapterId: chapter.id,
          order: chapter.order,
          hasDraft: Boolean((chapter.content ?? "").trim()),
        });

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
              await this.updateJobSafe(jobId, {
                heartbeatAt: new Date(),
                currentStage: stage,
                currentItemKey: chapter.id,
                currentItemLabel: chapter.title,
              });
            },
          },
        );

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
          progress: Number((completed / chapters.length).toFixed(4)),
          retryCount: totalRetryCount,
          heartbeatAt: new Date(),
        });
        logPipelineInfo("任务进度更新", {
          jobId,
          completed,
          total: chapters.length,
          progress: Number((completed / chapters.length).toFixed(4)),
          retryCount: totalRetryCount,
        });
      }

      const finalStatus = failedDetails.length === 0 ? "succeeded" : "failed";
      await this.updateJobSafe(jobId, {
        status: finalStatus,
        error: failedDetails.length === 0 ? null : `以下章节未达标：${failedDetails.join("；")}`,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
        finishedAt: new Date(),
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
