import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaStoryboardPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import type { DramaLLMOptions } from "./DramaStrategyService";

export class DramaStoryboardService {
  async generateStoryboard(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${episodeOrder} 集尚未生成台本，不能生成分镜。`);
    }
    const result = await runStructuredPrompt({
      asset: dramaStoryboardPrompt,
      promptInput: {
        content: context.episode.content,
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    });
    const output = result.output;
    const storyboard = await prisma.$transaction(async (tx) => {
      const created = await tx.dramaStoryboard.create({
        data: {
          projectId,
          episodeId: context.episode.id,
          summary: output.summary,
          status: "draft",
        },
      });
      await tx.dramaShot.createMany({
        data: output.shots.map((shot) => ({
          storyboardId: created.id,
          order: shot.order,
          shotSize: shot.shotSize ?? null,
          cameraMove: shot.cameraMove ?? null,
          durationSec: shot.durationSec ?? null,
          location: shot.location ?? null,
          action: shot.action,
          dialogue: shot.dialogue ?? null,
          characterRefs: shot.characterRefs?.length ? JSON.stringify(shot.characterRefs) : null,
          visualPrompt: shot.visualPrompt ?? null,
        })),
      });
      return tx.dramaStoryboard.findUnique({
        where: { id: created.id },
        include: { shots: { orderBy: { order: "asc" } } },
      });
    });
    return storyboard;
  }

  async getStoryboard(storyboardId: string) {
    return prisma.dramaStoryboard.findUnique({
      where: { id: storyboardId },
      include: { shots: { orderBy: { order: "asc" } } },
    });
  }
}

export const dramaStoryboardService = new DramaStoryboardService();
