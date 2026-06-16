import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { comicPanelImageService } from "./ComicPanelImageService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchProgress {
  total: number;
  done: number;
  failed: number;
  failedPanelIds: string[];
  status: "running" | "completed" | "partial";
}

export interface StartBatchOptions {
  provider?: LLMProvider;
  /** 并发格子数，默认 3（避免 API 限流） */
  concurrency?: number;
  /** 是否跳过已有图片的格子，默认 true */
  skipDone?: boolean;
}

// ─── Provider cost estimate (cents per image, rough) ─────────────────────────

const COST_PER_IMAGE_CENTS: Partial<Record<string, number>> = {
  openai: 4,   // gpt-image-1 ~$0.04/image
  jimeng: 0.5, // 即梦约 ¥0.04/张
  grok: 10,
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class ComicBatchOrchestrator {
  /**
   * 批量生成一话内所有格子图像。
   * - 并发限制 concurrency（默认3），避免 API 限流
   * - 失败格子记录入 ComicBatchJob.progress，可重跑
   * - 写 ComicBatchJob 记录进度，前端可轮询
   */
  async startEpisodeBatch(
    episodeId: string,
    opts: StartBatchOptions = {},
  ): Promise<{ jobId: string }> {
    const { provider = "openai", concurrency = 3, skipDone = true } = opts;

    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        panels: { orderBy: { order: "asc" } },
        project: true,
      },
    });
    if (!episode) throw new AppError(`未找到话数：${episodeId}`, 404);
    if (episode.panels.length === 0) {
      throw new AppError("该话尚无分格脚本，请先生成脚本再批量生图。", 400);
    }

    // 筛选待生成格子
    const targetPanels = skipDone
      ? episode.panels.filter((p) => {
          if (!p.imageData) return true;
          try {
            const d = JSON.parse(p.imageData) as { status?: string };
            return d.status !== "done";
          } catch {
            return true;
          }
        })
      : episode.panels;

    if (targetPanels.length === 0) {
      throw new AppError("所有格子已有图片，无需重新生成。若要重新生成请使用 skipDone=false。", 400);
    }

    // 创建 BatchJob 记录
    const progress: BatchProgress = {
      total: targetPanels.length,
      done: 0,
      failed: 0,
      failedPanelIds: [],
      status: "running",
    };
    const batchJob = await prisma.comicBatchJob.create({
      data: {
        projectId: episode.projectId,
        type: "episode_image_batch",
        status: "running",
        progress: JSON.stringify(progress),
      },
    });

    // 异步执行，不阻塞 HTTP 响应
    void this._runBatch(batchJob.id, targetPanels.map((p) => p.id), provider, concurrency);

    return { jobId: batchJob.id };
  }

  private async _runBatch(
    jobId: string,
    panelIds: string[],
    provider: LLMProvider,
    concurrency: number,
  ): Promise<void> {
    const progress: BatchProgress = {
      total: panelIds.length,
      done: 0,
      failed: 0,
      failedPanelIds: [],
      status: "running",
    };

    // 并发池：每次最多 concurrency 格并发
    const queue = [...panelIds];
    const workers: Promise<void>[] = [];

    const runNext = async () => {
      while (queue.length > 0) {
        const panelId = queue.shift()!;
        try {
          await comicPanelImageService.generatePanelImage(panelId, provider);
          progress.done++;
        } catch {
          progress.failed++;
          progress.failedPanelIds.push(panelId);
        }
        // 每完成一格就持久化进度
        await prisma.comicBatchJob.update({
          where: { id: jobId },
          data: { progress: JSON.stringify(progress) },
        }).catch(() => { /* 进度写入失败不中断批量 */ });
      }
    };

    for (let i = 0; i < concurrency; i++) {
      workers.push(runNext());
    }
    await Promise.all(workers);

    progress.status = progress.failed === 0 ? "completed" : "partial";
    const finalStatus = progress.status === "completed" ? "completed" : "partial";

    await prisma.comicBatchJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        progress: JSON.stringify(progress),
      },
    }).catch(() => {});

    console.log(
      `[comic.batch] job=${jobId} done=${progress.done} failed=${progress.failed} status=${finalStatus}`,
    );
  }

  /**
   * 重试失败的格子（读取 BatchJob 中的 failedPanelIds）。
   */
  async retryFailed(jobId: string, opts: { provider?: LLMProvider } = {}): Promise<{ jobId: string }> {
    const job = await prisma.comicBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError(`批量任务不存在：${jobId}`, 404);
    if (job.status === "running") throw new AppError("任务仍在运行中，请等待完成后重试。", 409);

    const prev = JSON.parse(job.progress) as BatchProgress;
    if (prev.failedPanelIds.length === 0) {
      throw new AppError("没有失败的格子需要重试。", 400);
    }

    const provider = opts.provider ?? "openai";
    const newProgress: BatchProgress = {
      total: prev.failedPanelIds.length,
      done: 0,
      failed: 0,
      failedPanelIds: [],
      status: "running",
    };

    await prisma.comicBatchJob.update({
      where: { id: jobId },
      data: { status: "running", progress: JSON.stringify(newProgress) },
    });

    void this._runBatch(jobId, prev.failedPanelIds, provider, 3);
    return { jobId };
  }

  /**
   * 估算批量生成费用（粗略）。
   */
  async estimateCost(episodeId: string, provider: string = "openai"): Promise<{
    totalPanels: number;
    pendingPanels: number;
    estimatedCentsCost: number;
    providerNote: string;
  }> {
    const panels = await prisma.comicPanel.findMany({
      where: { episodeId },
      select: { imageData: true },
    });
    const pending = panels.filter((p) => {
      if (!p.imageData) return true;
      try {
        const d = JSON.parse(p.imageData) as { status?: string };
        return d.status !== "done";
      } catch { return true; }
    });

    const centsPerImage = COST_PER_IMAGE_CENTS[provider] ?? 4;
    return {
      totalPanels: panels.length,
      pendingPanels: pending.length,
      estimatedCentsCost: pending.length * centsPerImage,
      providerNote: `基于 ${provider} 约 ${centsPerImage} 美分/张估算，实际费用以平台账单为准`,
    };
  }

  async getBatchJob(jobId: string) {
    return prisma.comicBatchJob.findUnique({ where: { id: jobId } });
  }

  async listBatchJobs(projectId: string) {
    return prisma.comicBatchJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const comicBatchOrchestrator = new ComicBatchOrchestrator();
