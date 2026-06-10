import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaVideoPromptPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { safeJsonParse } from "./utils/json";
import { videoProviderRegistry } from "./video/VideoProviderPort";
import type { DramaLLMOptions } from "./DramaStrategyService";
import type { VideoGenerationRequest } from "./video/VideoProviderPort";

interface PortraitReferenceData {
  status?: string;
  url?: string;
}

interface VideoPromptReferenceSource {
  projectId: string;
  shotId?: string | null;
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function normalizeRefImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  const baseUrl = process.env.DRAMA_VIDEO_REF_IMAGE_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

async function collectShotReferenceImages(videoPrompt: VideoPromptReferenceSource): Promise<string[]> {
  if (!videoPrompt.shotId) {
    return [];
  }
  const shot = await prisma.dramaShot.findUnique({
    where: { id: videoPrompt.shotId },
    select: { characterRefs: true },
  });
  const refs = parseCharacterRefs(shot?.characterRefs);
  if (!refs.length) {
    return [];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  const characters = await prisma.dramaCharacter.findMany({
    where: { projectId: videoPrompt.projectId },
    select: { id: true, name: true, portraitData: true },
  });
  const urls: string[] = [];
  for (const character of characters) {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    if ((!idKey || !refKeys.has(idKey)) && (!nameKey || !refKeys.has(nameKey))) {
      continue;
    }
    const portrait = safeJsonParse<PortraitReferenceData>(character.portraitData, {});
    const url = typeof portrait.url === "string" ? normalizeRefImageUrl(portrait.url) : "";
    if (portrait.status === "done" && url) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export class DramaVideoPromptService {
  async generateVideoPromptForShot(projectId: string, shotId: string, options: DramaLLMOptions = {}) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: { storyboard: { include: { episode: true } } },
    });
    if (!shot) {
      throw new Error(`未找到短剧镜头：${shotId}`);
    }
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, shot.storyboard.episode.order);
    const result = await runStructuredPrompt({
      asset: dramaVideoPromptPrompt,
      promptInput: {
        shotJson: JSON.stringify({
          order: shot.order,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          durationSec: shot.durationSec,
          location: shot.location,
          action: shot.action,
          dialogue: shot.dialogue,
          characterRefs: shot.characterRefs,
          visualPrompt: shot.visualPrompt,
        }, null, 2),
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    });
    const output = result.output;
    return prisma.dramaVideoPrompt.create({
      data: {
        projectId,
        episodeId: shot.storyboard.episodeId,
        shotId,
        provider: "mock",
        prompt: output.prompt,
        negativePrompt: output.negativePrompt ?? null,
        aspectRatio: output.aspectRatio || "9:16",
        durationSec: output.durationSec ?? shot.durationSec,
        status: "prompted",
      },
    });
  }

  async createProviderTask(videoPromptId: string, provider = "mock") {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (!videoPrompt) {
      throw new Error(`未找到视频提示词：${videoPromptId}`);
    }
    const adapter = videoProviderRegistry.resolve(provider);
    const refImages = adapter.supportsRefImages ? await collectShotReferenceImages(videoPrompt) : [];
    const request: VideoGenerationRequest = {
      prompt: videoPrompt.prompt,
      negativePrompt: videoPrompt.negativePrompt,
      aspectRatio: videoPrompt.aspectRatio,
      durationSec: videoPrompt.durationSec,
    };
    if (refImages.length) {
      request.refImages = refImages;
    }
    const result = await adapter.createTask(request);
    return prisma.dramaVideoPrompt.update({
      where: { id: videoPromptId },
      data: {
        provider,
        providerTaskId: result.providerTaskId,
        status: result.status,
        resultUrl: result.resultUrl ?? null,
        failureReason: result.failureReason ?? null,
        providerResult: JSON.stringify(result),
      },
    });
  }

  async refreshProviderTask(videoPromptId: string) {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (!videoPrompt?.providerTaskId) {
      throw new Error(`视频提示词尚未创建 provider 任务：${videoPromptId}`);
    }
    const adapter = videoProviderRegistry.resolve(videoPrompt.provider);
    const result = await adapter.getTask(videoPrompt.providerTaskId);
    return prisma.dramaVideoPrompt.update({
      where: { id: videoPromptId },
      data: {
        status: result.status,
        resultUrl: result.resultUrl ?? null,
        failureReason: result.failureReason ?? null,
        providerResult: JSON.stringify(result),
      },
    });
  }
}

export const dramaVideoPromptService = new DramaVideoPromptService();
