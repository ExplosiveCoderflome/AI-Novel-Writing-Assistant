import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaRepairPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { safeJsonParse } from "./utils/json";
import type { DramaLLMOptions } from "./DramaStrategyService";

export class DramaRepairService {
  async repairEpisode(projectId: string, episodeOrder: number, instruction?: string, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${episodeOrder} 集尚未生成台本，不能修复。`);
    }
    const quality = safeJsonParse<{ repairPlan?: { instruction?: string } }>(context.episode.qualityFlags, {});
    const repairInstruction = instruction?.trim()
      || quality.repairPlan?.instruction
      || "修复台本中的钩子、卡点、时长、事实一致或角色一致问题，保留本集剧情目标。";
    const result = await runStructuredPrompt({
      asset: dramaRepairPrompt,
      promptInput: {
        content: context.episode.content,
        episodeJson: context.episodeJson,
        repairInstruction,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.45,
      },
    });
    const output = result.output;
    await prisma.dramaEpisode.update({
      where: { id: context.episode.id },
      data: {
        content: output.content,
        durationSec: output.durationSec,
        status: "scripted",
        qualityFlags: null,
      },
    });
    return output;
  }
}

export const dramaRepairService = new DramaRepairService();
