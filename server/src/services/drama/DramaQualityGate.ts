import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  dramaQualityPrompt,
  type DramaQualityOutput,
} from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import {
  describeDramaPaywallPlan,
  resolveDramaPaywallPlan,
} from "./engine/paywallPlanPolicy";
import { rhythmEngine } from "./engine/rhythmEngine";
import type { DramaLLMOptions } from "./DramaStrategyService";

interface EpisodeRhythmLite {
  order: number;
  title: string;
  cliffhanger?: string | null;
  emotionNet?: number | null;
  isPaywall?: boolean;
}

type DramaQualityFlag = DramaQualityOutput["flags"][number];

function buildEpisodeRhythmDigest(episodes: EpisodeRhythmLite[], focusOrder: number): string {
  return episodes
    .filter((episode) => episode.order >= focusOrder - 3 && episode.order <= focusOrder + 3)
    .map((episode) => [
      `第${episode.order}集《${episode.title}》`,
      episode.isPaywall ? "付费卡点" : "普通集",
      `情绪净值:${episode.emotionNet ?? "待定"}`,
      `结尾:${episode.cliffhanger ?? "待定"}`,
    ].join(" | "))
    .join("\n") || "暂无相邻分集节奏。";
}

function addRepairInstruction(existing: DramaQualityOutput["repairPlan"], flags: DramaQualityFlag[]): DramaQualityOutput["repairPlan"] {
  if (existing) {
    return existing;
  }
  return {
    mode: "patch",
    instruction: flags.map((flag) => flag.suggestion).join("；"),
  };
}

export function applyPaywallQualityRules(
  output: DramaQualityOutput,
  input: {
    episode: EpisodeRhythmLite;
    episodes: EpisodeRhythmLite[];
    strategyJson?: string | null;
    targetEpisodes: number;
  },
): DramaQualityOutput {
  const plan = resolveDramaPaywallPlan(input.strategyJson, input.targetEpisodes);
  const flags: DramaQualityFlag[] = [];
  const isPaywallEpisode = input.episode.isPaywall
    || rhythmEngine.isPaywallEpisode(input.episode.order, input.targetEpisodes, plan);

  if (input.episode.order === plan.firstPaywallAt - 1) {
    const freeStageEpisodes = input.episodes.filter((episode) =>
      episode.order < plan.firstPaywallAt && typeof episode.emotionNet === "number"
    );
    const minEmotionNet = freeStageEpisodes.length
      ? Math.min(...freeStageEpisodes.map((episode) => episode.emotionNet as number))
      : null;
    if (minEmotionNet !== null && typeof input.episode.emotionNet === "number" && input.episode.emotionNet > minEmotionNet) {
      flags.push({
        severity: "high",
        code: "pre_paywall_buildup_not_lowest",
        evidence: `第 ${input.episode.order} 集情绪净值为 ${input.episode.emotionNet}，未形成首付费前阶段低谷 ${minEmotionNet}。`,
        suggestion: `把第 ${input.episode.order} 集结尾改成更强的受压、误解或危机蓄势，让第 ${plan.firstPaywallAt} 集付费卡点有更高释放空间。`,
      });
    }
  }

  if (isPaywallEpisode && output.score.paywall < plan.cliffhangerStrengthThreshold) {
    flags.push({
      severity: "high",
      code: "paywall_cliffhanger_below_plan",
      evidence: `付费卡点评分 ${output.score.paywall} 低于计划阈值 ${plan.cliffhangerStrengthThreshold}。`,
      suggestion: "强化本集结尾的身份揭示、危机升级或反打承诺，让用户有明确理由继续付费观看下一集。",
    });
  }

  if (!flags.length) {
    return output;
  }

  const status = output.status === "blocked" ? "blocked" : "repairable";
  return {
    ...output,
    status,
    flags: output.flags.concat(flags),
    repairPlan: status === "repairable" ? addRepairInstruction(output.repairPlan, flags) : output.repairPlan,
  };
}

export class DramaQualityGate {
  async reviewEpisode(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${episodeOrder} 集尚未生成台本，不能执行质量闸。`);
    }
    const paywallPlan = resolveDramaPaywallPlan(context.strategyJson, context.project.targetEpisodes);
    const result = await runStructuredPrompt({
      asset: dramaQualityPrompt,
      promptInput: {
        episodeJson: context.episodeJson,
        content: context.episode.content,
        factsDigest: context.factsDigest,
        charactersDigest: context.charactersDigest,
        strategyJson: context.strategyJson,
        paywallPlanDigest: describeDramaPaywallPlan(paywallPlan),
        episodeRhythmDigest: buildEpisodeRhythmDigest(context.project.episodes, episodeOrder),
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.2,
      },
    });
    const output = applyPaywallQualityRules(result.output, {
      episode: context.episode,
      episodes: context.project.episodes,
      strategyJson: context.strategyJson,
      targetEpisodes: context.project.targetEpisodes,
    });
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
