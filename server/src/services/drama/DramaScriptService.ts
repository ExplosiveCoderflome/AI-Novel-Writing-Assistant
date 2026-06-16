import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaScriptPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import type { DramaLLMOptions } from "./DramaStrategyService";

export class DramaScriptService {
  async generateEpisodeScript(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    const result = await runStructuredPrompt({
      asset: dramaScriptPrompt,
      promptInput: {
        projectTitle: context.project.title,
        strategyJson: context.strategyJson,
        episodeJson: context.episodeJson,
        charactersDigest: context.charactersDigest,
        factsDigest: context.factsDigest,
        previousDigest: context.previousDigest,
        sourceDigest: context.sourceDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.75,
      },
    });

    const output = result.output;
    await prisma.$transaction(async (tx) => {
      await tx.dramaEpisode.update({
        where: { id: context.episode.id },
        data: {
          content: output.content,
          durationSec: output.durationSec,
          status: "scripted",
          qualityFlags: null,
        },
      });
      if (output.newlyIntroducedFacts?.length) {
        await tx.dramaFact.createMany({
          data: output.newlyIntroducedFacts.map((fact) => ({
            projectId,
            episodeOrder,
            text: fact.text,
            category: fact.category,
            source: "script",
          })),
        });
      }
    });

    return output;
  }
}

export const dramaScriptService = new DramaScriptService();
