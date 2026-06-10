import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { DramaVideoPromptService } from "../DramaVideoPromptService";
import { DramaShotKeyframeService } from "../visual/DramaShotKeyframeService";

export type DramaBatchJobType = "keyframes" | "videos";
export type DramaBatchJobStatus = "pending" | "running" | "paused" | "done" | "failed";

export interface DramaBatchProgress {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  failedShotIds: string[];
  provider?: string;
  targetShotIds?: string[];
  currentShotId?: string;
  errors?: Array<{ shotId: string; message: string }>;
}

export interface CreateEpisodeBatchJobInput {
  type: DramaBatchJobType;
  provider?: string;
  failedShotIds?: string[];
}

interface CreateEpisodeBatchJobOptions {
  autoStart?: boolean;
}

interface BatchShot {
  id: string;
  keyframeData?: string | null;
}

const DEFAULT_VIDEO_PROVIDER = "mock";
const DEFAULT_IMAGE_PROVIDER = "openai";

function hasDoneKeyframe(raw: string | null | undefined): boolean {
  const parsed = safeJsonParse<{ status?: string; url?: string }>(raw, {});
  return parsed.status === "done" && typeof parsed.url === "string" && parsed.url.trim().length > 0;
}

function normalizeProgress(input: Partial<DramaBatchProgress>): DramaBatchProgress {
  return {
    total: input.total ?? 0,
    done: input.done ?? 0,
    failed: input.failed ?? 0,
    skipped: input.skipped ?? 0,
    failedShotIds: input.failedShotIds ?? [],
    provider: input.provider,
    targetShotIds: input.targetShotIds,
    currentShotId: input.currentShotId,
    errors: input.errors ?? [],
  };
}

function readProgress(raw: string | null | undefined): DramaBatchProgress {
  return normalizeProgress(safeJsonParse<Partial<DramaBatchProgress>>(raw, {}));
}

export class DramaBatchOrchestrator {
  private readonly runningJobs = new Set<string>();

  constructor(
    private readonly keyframeService = new DramaShotKeyframeService(),
    private readonly videoPromptService = new DramaVideoPromptService(),
  ) {}

  async createEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
    options: CreateEpisodeBatchJobOptions = {},
  ) {
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        storyboards: {
          orderBy: { createdAt: "desc" },
          include: { shots: { orderBy: { order: "asc" } } },
        },
      },
    });
    if (!episode) {
      throw new AppError(`未找到短剧第 ${order} 集。`, 404);
    }
    const shots = episode.storyboards[0]?.shots ?? [];
    if (!shots.length) {
      throw new AppError(`第 ${order} 集还没有分镜，不能创建批量任务。`, 400);
    }
    const allowedShotIds = new Set(shots.map((shot) => shot.id));
    const targetShotIds = (input.failedShotIds?.length ? input.failedShotIds : shots.map((shot) => shot.id))
      .filter((shotId) => allowedShotIds.has(shotId));
    if (!targetShotIds.length) {
      throw new AppError("没有可处理的镜头。", 400);
    }

    const provider = input.provider?.trim()
      || (input.type === "videos" ? DEFAULT_VIDEO_PROVIDER : DEFAULT_IMAGE_PROVIDER);
    const progress = normalizeProgress({
      total: targetShotIds.length,
      done: 0,
      failed: 0,
      skipped: 0,
      failedShotIds: [],
      provider,
      targetShotIds,
      errors: [],
    });
    const job = await prisma.dramaBatchJob.create({
      data: {
        projectId,
        episodeId: episode.id,
        type: input.type,
        status: "pending",
        progress: JSON.stringify(progress),
      },
    });

    if (options.autoStart ?? true) {
      void this.runBatchJob(job.id).catch(() => undefined);
    }
    return job;
  }

  async runBatchJob(jobId: string) {
    if (this.runningJobs.has(jobId)) {
      return prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
    }
    this.runningJobs.add(jobId);
    try {
      const job = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
      if (!job) {
        throw new AppError(`未找到短剧批量任务：${jobId}`, 404);
      }
      if (!job.episodeId) {
        throw new AppError("短剧批量任务缺少集数关联。", 400);
      }
      const episode = await prisma.dramaEpisode.findUnique({
        where: { id: job.episodeId },
        include: {
          storyboards: {
            orderBy: { createdAt: "desc" },
            include: { shots: { orderBy: { order: "asc" } } },
          },
        },
      });
      if (!episode) {
        throw new AppError(`未找到短剧批量任务关联的集数：${job.episodeId}`, 404);
      }

      const progress = readProgress(job.progress);
      const targetSet = new Set(progress.targetShotIds ?? []);
      const shots = (episode.storyboards[0]?.shots ?? [])
        .filter((shot) => targetSet.size === 0 || targetSet.has(shot.id));
      const nextProgress = normalizeProgress({
        ...progress,
        total: shots.length,
        done: 0,
        failed: 0,
        skipped: 0,
        failedShotIds: [],
        errors: [],
      });
      await this.updateJob(jobId, "running", nextProgress);

      for (const shot of shots) {
        nextProgress.currentShotId = shot.id;
        await this.updateJob(jobId, "running", nextProgress);
        try {
          const result = job.type === "keyframes"
            ? await this.processKeyframeShot(shot, nextProgress.provider)
            : await this.processVideoShot(job.projectId, episode.id, shot.id, nextProgress.provider);
          if (result === "skipped") {
            nextProgress.skipped += 1;
          }
          nextProgress.done += 1;
        } catch (error) {
          nextProgress.failed += 1;
          nextProgress.failedShotIds.push(shot.id);
          nextProgress.errors = (nextProgress.errors ?? []).concat({
            shotId: shot.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        await this.updateJob(jobId, "running", nextProgress);
      }

      nextProgress.currentShotId = undefined;
      return this.updateJob(jobId, nextProgress.failed > 0 ? "failed" : "done", nextProgress);
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private async processKeyframeShot(shot: BatchShot, provider?: string): Promise<"processed" | "skipped"> {
    if (hasDoneKeyframe(shot.keyframeData)) {
      return "skipped";
    }
    await this.keyframeService.generateKeyframe(shot.id, (provider || DEFAULT_IMAGE_PROVIDER) as LLMProvider);
    return "processed";
  }

  private async processVideoShot(
    projectId: string,
    episodeId: string,
    shotId: string,
    provider?: string,
  ): Promise<"processed" | "skipped"> {
    let prompt = await prisma.dramaVideoPrompt.findFirst({
      where: { projectId, episodeId, shotId },
      orderBy: { createdAt: "desc" },
    });
    if (prompt?.providerTaskId && prompt.status !== "failed") {
      return "skipped";
    }
    if (!prompt) {
      prompt = await this.videoPromptService.generateVideoPromptForShot(projectId, shotId);
    }
    await this.videoPromptService.createProviderTask(prompt.id, provider || DEFAULT_VIDEO_PROVIDER);
    return "processed";
  }

  private async updateJob(
    jobId: string,
    status: DramaBatchJobStatus,
    progress: DramaBatchProgress,
  ) {
    return prisma.dramaBatchJob.update({
      where: { id: jobId },
      data: {
        status,
        progress: JSON.stringify(progress),
      },
    });
  }
}

export const dramaBatchOrchestrator = new DramaBatchOrchestrator();
