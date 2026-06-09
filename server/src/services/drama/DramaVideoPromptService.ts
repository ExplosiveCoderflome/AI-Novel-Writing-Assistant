import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaVideoPromptPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { videoProviderRegistry } from "./video/VideoProviderPort";
import type { DramaLLMOptions } from "./DramaStrategyService";

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
    const result = await adapter.createTask({
      prompt: videoPrompt.prompt,
      negativePrompt: videoPrompt.negativePrompt,
      aspectRatio: videoPrompt.aspectRatio,
      durationSec: videoPrompt.durationSec,
    });
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
