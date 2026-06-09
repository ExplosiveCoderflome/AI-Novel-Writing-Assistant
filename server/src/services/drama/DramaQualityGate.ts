import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaQualityPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import type { DramaLLMOptions } from "./DramaStrategyService";

export class DramaQualityGate {
  async reviewEpisode(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${episodeOrder} 集尚未生成台本，不能执行质量闸。`);
    }
    const result = await runStructuredPrompt({
      asset: dramaQualityPrompt,
      promptInput: {
        episodeJson: context.episodeJson,
        content: context.episode.content,
        factsDigest: context.factsDigest,
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.2,
      },
    });
    const output = result.output;
    const status = output.status === "approved" ? "approved"
      : output.status === "repairable" || output.status === "blocked" ? "needs_repair"
        : "reviewed";
    await prisma.dramaEpisode.update({
      where: { id: context.episode.id },
      data: {
        status,
        qualityFlags: JSON.stringify(output),
      },
    });
    return output;
  }
}

export const dramaQualityGate = new DramaQualityGate();
