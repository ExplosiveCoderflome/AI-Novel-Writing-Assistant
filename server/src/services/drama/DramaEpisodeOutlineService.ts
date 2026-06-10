/**
 * 短剧分集大纲服务（P1-C）
 *
 * 读取策略 + 内容节拍 → LLM 生成区间分集大纲 → 落库 DramaEpisode。
 * 卡点集号由节奏引擎确定性给出（不交给 LLM 自由发挥），保证付费节奏可控。
 */
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaEpisodeOutlinePrompt } from "../../prompting/prompts/drama/drama.prompts";
import { rhythmEngine, type TrackId } from "./engine/rhythmEngine";
import {
  describeDramaPaywallPlan,
  resolveDramaPaywallPlan,
} from "./engine/paywallPlanPolicy";
import type { DramaLLMOptions } from "./DramaStrategyService";

interface SourceBeatLite {
  order: number;
  summary: string;
}

export interface GenerateOutlineInput {
  startOrder?: number;
  count?: number;
}

export class DramaEpisodeOutlineService {
  async generateOutline(
    projectId: string,
    input: GenerateOutlineInput = {},
    options: DramaLLMOptions = {},
  ) {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true },
    });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    if (!project.strategy) {
      throw new Error("请先生成改编策略（strategy）再生成分集大纲。");
    }
    if (!project.track || !rhythmEngine.getTrack(project.track as TrackId)) {
      throw new Error("项目赛道无效，请先设置有效赛道。");
    }
    const track = rhythmEngine.getTrack(project.track as TrackId)!;
    const synopsis = project.sourceBundle?.synopsis?.trim() ?? "";
    const paywallPlan = resolveDramaPaywallPlan(project.strategy, project.targetEpisodes);

    const startOrder = Math.max(1, input.startOrder ?? 1);
    const count = Math.min(40, Math.max(1, input.count ?? 12));
    const endOrder = Math.min(project.targetEpisodes, startOrder + count - 1);

    // 内容节拍摘要（截断，避免超预算）
    let beats: SourceBeatLite[] = [];
    try {
      beats = JSON.parse(project.sourceBundle?.beats ?? "[]") as SourceBeatLite[];
    } catch {
      beats = [];
    }
    const beatsDigest = beats
      .slice(0, 60)
      .map((beat) => `${beat.order}：${beat.summary}`)
      .join("\n") || "（无结构化节拍，按梗概自由分集）";

    const hookLibrary = rhythmEngine
      .listHooks()
      .map((hook) => `${hook.id}：${hook.label} — ${hook.description}`)
      .join("\n");

    // 确定性卡点集号
    const paywallInRange: number[] = [];
    for (let order = startOrder; order <= endOrder; order += 1) {
      if (rhythmEngine.isPaywallEpisode(order, project.targetEpisodes, paywallPlan)) {
        paywallInRange.push(order);
      }
    }

    const result = await runStructuredPrompt({
      asset: dramaEpisodeOutlinePrompt,
      promptInput: {
        synopsis,
        strategyJson: project.strategy,
        beatsDigest,
        trackLabel: track.label,
        hookLibrary,
        startOrder,
        count: endOrder - startOrder + 1,
        paywallEpisodes: paywallInRange.join("、"),
        paywallPlanDigest: describeDramaPaywallPlan(paywallPlan),
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.7,
      },
    });

    // 落库：upsert by (projectId, order)，卡点由引擎判定（不信任 LLM）
    const episodes = result.output.episodes.filter(
      (episode) => episode.order >= startOrder && episode.order <= endOrder,
    );

    for (const episode of episodes) {
      const isPaywall = rhythmEngine.isPaywallEpisode(episode.order, project.targetEpisodes, paywallPlan);
      const sourceMap = episode.sourceBeatRefs && episode.sourceBeatRefs.length > 0
        ? JSON.stringify({ beatRefs: episode.sourceBeatRefs })
        : null;
      const beatSheet = JSON.stringify({
        conflict: episode.conflict,
      });
      await prisma.dramaEpisode.upsert({
        where: { projectId_order: { projectId, order: episode.order } },
        update: {
          title: episode.title,
          hookOpening: episode.hookOpening,
          hookType: episode.hookType,
          cliffhanger: episode.cliffhanger,
          emotionNet: episode.emotionNet,
          isPaywall,
          beatSheet,
          sourceMap,
          status: "planned",
        },
        create: {
          projectId,
          order: episode.order,
          title: episode.title,
          hookOpening: episode.hookOpening,
          hookType: episode.hookType,
          cliffhanger: episode.cliffhanger,
          emotionNet: episode.emotionNet,
          isPaywall,
          beatSheet,
          sourceMap,
          status: "planned",
        },
      });
    }

    await prisma.dramaProject.update({
      where: { id: projectId },
      data: { status: "outlined" },
    });

    return { generated: episodes.length, startOrder, endOrder };
  }
}

export const dramaEpisodeOutlineService = new DramaEpisodeOutlineService();
