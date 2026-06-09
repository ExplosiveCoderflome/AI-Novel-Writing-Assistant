/**
 * 短剧策略规划服务（P1-B）
 *
 * 读取项目内容包 + 赛道模板 → LLM 生成改编策略 → 落库 project.strategy。
 */
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaStrategyPrompt } from "./prompts/strategy.prompts";
import {
  DEFAULT_PAYWALL_STRATEGY,
  rhythmEngine,
  type TrackId,
} from "./engine/rhythmEngine";

export interface DramaLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class DramaStrategyService {
  async generateStrategy(projectId: string, options: DramaLLMOptions = {}) {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true },
    });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    if (!project.track) {
      throw new Error("请先为项目设置赛道（track）再生成策略。");
    }
    const track = rhythmEngine.getTrack(project.track as TrackId);
    if (!track) {
      throw new Error(`未知赛道：${project.track}`);
    }
    const synopsis = project.sourceBundle?.synopsis?.trim();
    if (!synopsis) {
      throw new Error("请先装配内容包（source-bundle）再生成策略。");
    }

    const preferredHooks = rhythmEngine
      .recommendHooksForTrack(track.id)
      .map((hook) => hook.label)
      .join("、");

    const result = await runStructuredPrompt({
      asset: dramaStrategyPrompt,
      promptInput: {
        synopsis,
        trackLabel: track.label,
        trackDescription: track.description,
        rhythmNote: track.rhythmNote,
        taboos: track.taboos.join("；"),
        preferredHooks,
        targetEpisodes: project.targetEpisodes,
        freeEpisodes: DEFAULT_PAYWALL_STRATEGY.freeEpisodes,
        firstPaywallAt: DEFAULT_PAYWALL_STRATEGY.firstPaywallAt,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.6,
      },
    });

    const strategy = result.output;
    await prisma.dramaProject.update({
      where: { id: projectId },
      data: { strategy: JSON.stringify(strategy), status: "strategized" },
    });

    return strategy;
  }
}

export const dramaStrategyService = new DramaStrategyService();
