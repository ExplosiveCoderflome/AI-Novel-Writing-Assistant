import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { DramaVideoPromptService } from "../DramaVideoPromptService";
import { DramaDialogueAudioService } from "../audio/DramaDialogueAudioService";
import { ttsProviderRegistry } from "../audio/TTSProviderPort";
import { DramaShotKeyframeService } from "../visual/DramaShotKeyframeService";
import { videoProviderRegistry } from "../video/VideoProviderPort";

export type DramaBatchJobType = "keyframes" | "videos" | "tts";
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
  useCharacterRefImages?: boolean;
  cost?: DramaBatchCostBreakdown;
}

export interface DramaBatchCostUnits {
  images?: number;
  seconds?: number;
  shots?: number;
  lines?: number;
}

export interface DramaBatchCostBreakdown {
  currency: string;
  estimated: number;
  actual: number;
  estimatedUnits: DramaBatchCostUnits;
  actualUnits: DramaBatchCostUnits;
  unit: {
    costPerImage?: number;
    costPerSecond?: number;
  };
}

export interface CreateEpisodeBatchJobInput {
  type: DramaBatchJobType;
  provider?: string;
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
}

interface CreateEpisodeBatchJobOptions {
  autoStart?: boolean;
}

interface BatchShot {
  id: string;
  durationSec?: number | null;
  dialogue?: string | null;
  keyframeData?: string | null;
  dialogueAudioData?: string | null;
}

interface BatchEpisode {
  id: string;
  storyboards: Array<{ shots: BatchShot[] }>;
  videoPrompts?: BatchVideoPrompt[];
}

interface BatchVideoPrompt {
  shotId?: string | null;
  providerTaskId?: string | null;
  status: string;
}

type BatchProcessResult = {
  status: "processed" | "skipped";
  costUnits?: DramaBatchCostUnits;
};

const DEFAULT_VIDEO_PROVIDER = "mock";
const DEFAULT_IMAGE_PROVIDER = "openai";
const DEFAULT_TTS_PROVIDER = "mock";

function normalizeDurationSec(value: number | null | undefined, fallback = 5): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeCostNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function readCostCurrency(): string {
  return process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";
}

function providerEnvKey(provider: string): string {
  return provider.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function readImageCostPerImage(provider: string): number {
  const providerKey = providerEnvKey(provider);
  return normalizeCostNumber(
    process.env[`DRAMA_IMAGE_COST_PER_IMAGE_${providerKey}`]
    ?? process.env.DRAMA_IMAGE_COST_PER_IMAGE,
  );
}

function hasDoneKeyframe(raw: string | null | undefined): boolean {
  const parsed = safeJsonParse<{ status?: string; url?: string }>(raw, {});
  return parsed.status === "done" && typeof parsed.url === "string" && parsed.url.trim().length > 0;
}

function hasDoneDialogueAudio(raw: string | null | undefined): boolean {
  const parsed = safeJsonParse<{ status?: string; items?: unknown[] }>(raw, {});
  return parsed.status === "done" && Array.isArray(parsed.items) && parsed.items.length > 0;
}

function addCostUnits(left: DramaBatchCostUnits, right: DramaBatchCostUnits): DramaBatchCostUnits {
  return {
    images: (left.images ?? 0) + (right.images ?? 0) || undefined,
    seconds: (left.seconds ?? 0) + (right.seconds ?? 0) || undefined,
    shots: (left.shots ?? 0) + (right.shots ?? 0) || undefined,
    lines: (left.lines ?? 0) + (right.lines ?? 0) || undefined,
  };
}

function calculateCost(unit: DramaBatchCostBreakdown["unit"], units: DramaBatchCostUnits): number {
  return roundCost(
    (unit.costPerImage ?? 0) * (units.images ?? 0)
    + (unit.costPerSecond ?? 0) * (units.seconds ?? 0),
  );
}

function normalizeCostBreakdown(input: DramaBatchCostBreakdown | undefined): DramaBatchCostBreakdown | undefined {
  if (!input) {
    return undefined;
  }
  const unit = {
    costPerImage: normalizeCostNumber(input.unit?.costPerImage),
    costPerSecond: normalizeCostNumber(input.unit?.costPerSecond),
  };
  const estimatedUnits = input.estimatedUnits ?? {};
  const actualUnits = input.actualUnits ?? {};
  return {
    currency: input.currency || readCostCurrency(),
    estimated: calculateCost(unit, estimatedUnits),
    actual: calculateCost(unit, actualUnits),
    estimatedUnits,
    actualUnits,
    unit,
  };
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
    useCharacterRefImages: input.useCharacterRefImages,
    cost: normalizeCostBreakdown(input.cost),
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
    private readonly dialogueAudioService = new DramaDialogueAudioService(),
  ) {}

  async createEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
    options: CreateEpisodeBatchJobOptions = {},
  ) {
    const prepared = await this.prepareEpisodeBatchJob(projectId, order, input);
    const progress = normalizeProgress({
      total: prepared.targetShotIds.length,
      done: 0,
      failed: 0,
      skipped: 0,
      failedShotIds: [],
      provider: prepared.provider,
      targetShotIds: prepared.targetShotIds,
      errors: [],
      useCharacterRefImages: input.useCharacterRefImages ?? false,
      cost: prepared.cost,
    });
    const job = await prisma.dramaBatchJob.create({
      data: {
        projectId,
        episodeId: prepared.episode.id,
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

  async estimateEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
  ) {
    const prepared = await this.prepareEpisodeBatchJob(projectId, order, input);
    return {
      type: input.type,
      provider: prepared.provider,
      total: prepared.targetShotIds.length,
      targetShotIds: prepared.targetShotIds,
      cost: prepared.cost,
    };
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
        cost: progress.cost ? { ...progress.cost, actual: 0, actualUnits: {} } : undefined,
      });
      await this.updateJob(jobId, "running", nextProgress);

      for (const shot of shots) {
        nextProgress.currentShotId = shot.id;
        await this.updateJob(jobId, "running", nextProgress);
        try {
          const result = await this.processShot(job.type as DramaBatchJobType, job.projectId, episode.id, shot, nextProgress.provider, nextProgress.useCharacterRefImages ?? false);
          if (result.status === "skipped") {
            nextProgress.skipped += 1;
          }
          if (result.status === "processed" && result.costUnits && nextProgress.cost) {
            nextProgress.cost = this.addActualCost(nextProgress.cost, result.costUnits);
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

  private async processKeyframeShot(shot: BatchShot, provider?: string, useCharacterRefImages = false): Promise<"processed" | "skipped"> {
    if (hasDoneKeyframe(shot.keyframeData)) {
      return "skipped";
    }
    await this.keyframeService.generateKeyframe(shot.id, (provider || DEFAULT_IMAGE_PROVIDER) as LLMProvider, useCharacterRefImages);
    return "processed";
  }

  private async processTtsShot(shot: BatchShot, provider?: string): Promise<BatchProcessResult> {
    if (hasDoneDialogueAudio(shot.dialogueAudioData)) {
      return { status: "skipped" };
    }
    const data = await this.dialogueAudioService.synthesizeShotDialogue(shot.id, provider || DEFAULT_TTS_PROVIDER);
    const seconds = (data.items ?? []).reduce((sum, item) => {
      return sum + normalizeDurationSec(item.durationSec, Math.max(1, Math.ceil(item.text.length / 5)));
    }, 0);
    return {
      status: "processed",
      costUnits: {
        seconds,
        lines: data.items?.length ?? 0,
        shots: 1,
      },
    };
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

  private async processShot(
    type: DramaBatchJobType,
    projectId: string,
    episodeId: string,
    shot: BatchShot,
    provider?: string,
    useCharacterRefImages = false,
  ): Promise<BatchProcessResult> {
    if (type === "keyframes") {
      const status = await this.processKeyframeShot(shot, provider, useCharacterRefImages);
      return status === "processed"
        ? { status, costUnits: { images: 1, shots: 1 } }
        : { status };
    }
    if (type === "tts") {
      return this.processTtsShot(shot, provider);
    }
    const status = await this.processVideoShot(projectId, episodeId, shot.id, provider);
    return status === "processed"
      ? { status, costUnits: { seconds: normalizeDurationSec(shot.durationSec), shots: 1 } }
      : { status };
  }

  private defaultProviderForType(type: DramaBatchJobType): string {
    if (type === "keyframes") {
      return DEFAULT_IMAGE_PROVIDER;
    }
    if (type === "tts") {
      return DEFAULT_TTS_PROVIDER;
    }
    return DEFAULT_VIDEO_PROVIDER;
  }

  private async prepareEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
  ): Promise<{
    episode: BatchEpisode;
    provider: string;
    targetShotIds: string[];
    cost: DramaBatchCostBreakdown;
  }> {
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        storyboards: {
          orderBy: { createdAt: "desc" },
          include: { shots: { orderBy: { order: "asc" } } },
        },
        videoPrompts: { orderBy: { createdAt: "desc" } },
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
    const targetShots = (input.failedShotIds?.length
      ? shots.filter((shot) => input.failedShotIds?.includes(shot.id))
      : shots)
      .filter((shot) => allowedShotIds.has(shot.id));
    if (!targetShots.length) {
      throw new AppError("没有可处理的镜头。", 400);
    }

    const provider = input.provider?.trim() || this.defaultProviderForType(input.type);
    return {
      episode,
      provider,
      targetShotIds: targetShots.map((shot) => shot.id),
      cost: this.estimateCost(input.type, provider, targetShots, episode.videoPrompts ?? []),
    };
  }

  private estimateCost(
    type: DramaBatchJobType,
    provider: string,
    shots: BatchShot[],
    videoPrompts: BatchVideoPrompt[],
  ): DramaBatchCostBreakdown {
    const unit = this.resolveCostUnit(type, provider);
    const latestPromptByShot = new Map<string, BatchVideoPrompt>();
    for (const prompt of videoPrompts) {
      if (prompt.shotId && !latestPromptByShot.has(prompt.shotId)) {
        latestPromptByShot.set(prompt.shotId, prompt);
      }
    }

    let estimatedUnits: DramaBatchCostUnits = {};
    if (type === "keyframes") {
      const billableShots = shots.filter((shot) => !hasDoneKeyframe(shot.keyframeData));
      estimatedUnits = { images: billableShots.length, shots: billableShots.length };
    } else if (type === "videos") {
      const billableShots = shots.filter((shot) => {
        const prompt = latestPromptByShot.get(shot.id);
        return !(prompt?.providerTaskId && prompt.status !== "failed");
      });
      estimatedUnits = {
        seconds: billableShots.reduce((sum, shot) => sum + normalizeDurationSec(shot.durationSec), 0),
        shots: billableShots.length,
      };
    } else {
      const billableShots = shots.filter((shot) => !hasDoneDialogueAudio(shot.dialogueAudioData));
      estimatedUnits = {
        seconds: billableShots.reduce((sum, shot) => sum + normalizeDurationSec(shot.durationSec), 0),
        shots: billableShots.length,
      };
    }

    return normalizeCostBreakdown({
      currency: unit.currency,
      estimated: 0,
      actual: 0,
      estimatedUnits,
      actualUnits: {},
      unit: unit.unit,
    })!;
  }

  private resolveCostUnit(type: DramaBatchJobType, provider: string): {
    currency: string;
    unit: DramaBatchCostBreakdown["unit"];
  } {
    if (type === "keyframes") {
      return {
        currency: readCostCurrency(),
        unit: { costPerImage: readImageCostPerImage(provider) },
      };
    }
    if (type === "tts") {
      const resolved = ttsProviderRegistry.resolve(provider);
      return {
        currency: resolved.currency ?? readCostCurrency(),
        unit: { costPerSecond: resolved.costPerSecond ?? 0 },
      };
    }
    const resolved = videoProviderRegistry.resolve(provider);
    return {
      currency: resolved.currency ?? readCostCurrency(),
      unit: { costPerSecond: resolved.costPerSecond ?? 0 },
    };
  }

  private addActualCost(cost: DramaBatchCostBreakdown, units: DramaBatchCostUnits): DramaBatchCostBreakdown {
    return normalizeCostBreakdown({
      ...cost,
      actualUnits: addCostUnits(cost.actualUnits, units),
    })!;
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
