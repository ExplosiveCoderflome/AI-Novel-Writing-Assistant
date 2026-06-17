/**
 * 漫画分话规划服务
 *
 * 复用 drama 已验证的 rhythmEngine + paywallPlanPolicy，
 * 生成每话大纲（hookType / cliffhanger / 卡点）并落库 ComicEpisode。
 */
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicEpisodeOutlinePrompt } from "../../prompting/prompts/comic/comic.prompts";
// rhythmEngine 是纯领域知识（零外部依赖），可直接 import
import { rhythmEngine, type TrackId } from "../drama/engine/rhythmEngine";
import {
  describeDramaPaywallPlan,
  resolveDramaPaywallPlan,
} from "../drama/engine/paywallPlanPolicy";

export interface GenerateComicOutlineInput {
  startOrder?: number;
  count?: number;
}

export class ComicEpisodePlanService {
  async generateOutline(
    projectId: string,
    input: GenerateComicOutlineInput = {},
    provider?: LLMProvider,
  ) {
    const project = await prisma.comicProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true },
    });
    if (!project) throw new Error(`未找到漫画项目：${projectId}`);
    if (!project.sourceBundle) {
      throw new Error("请先导入内容源（importSourceBundle）再生成分话大纲。");
    }

    const bundle = JSON.parse(project.sourceBundle.bundleJson);
    const synopsis: string = bundle.synopsis ?? "";
    const beats: Array<{ order: number; summary: string }> = bundle.beats ?? [];

    const trackId = project.trackId as TrackId | undefined;
    const track = trackId ? rhythmEngine.getTrack(trackId) : null;

    // 目标集数：参考节拍数折算，默认 20 话
    const targetEpisodes = Math.max(10, Math.min(100, Math.ceil(beats.length / 3)));

    const startOrder = Math.max(1, input.startOrder ?? 1);
    const count = Math.min(40, Math.max(1, input.count ?? 12));
    const endOrder = Math.min(targetEpisodes, startOrder + count - 1);

    const beatsDigest = beats
      .slice(0, 60)
      .map((beat) => `${beat.order}：${beat.summary}`)
      .join("\n") || "（无结构化节拍，按梗概自由分话）";

    // 付费卡点（有赛道策略时才计算）
    const paywallOrders: number[] = [];
    if (track) {
      const paywallPlan = resolveDramaPaywallPlan(
        JSON.stringify({ paywallDensity: "medium" }),
        targetEpisodes,
      );
      for (let order = startOrder; order <= endOrder; order += 1) {
        if (rhythmEngine.isPaywallEpisode(order, targetEpisodes, paywallPlan)) {
          paywallOrders.push(order);
        }
      }
    }

    const hookLibrary = rhythmEngine
      .listHooks()
      .map((hook) => `${hook.id}：${hook.label} — ${hook.description}`)
      .join("\n");

    const result = await runStructuredPrompt({
      asset: comicEpisodeOutlinePrompt,
      promptInput: {
        title: project.title,
        synopsis,
        beatsDigest,
        startOrder,
        endOrder,
        paywallOrders,
        hookLibrary,
        stylePreset: project.stylePreset
          ? JSON.parse(project.stylePreset).style
          : undefined,
      },
      options: { temperature: 0.6, provider },
    });

    const episodes = result.output.episodes;

    // 事务：落库 ComicEpisode（幂等，order 已存在则更新）
    await prisma.$transaction(async (tx) => {
      for (const ep of episodes) {
        await tx.comicEpisode.upsert({
          where: { projectId_order: { projectId, order: ep.order } },
          create: {
            projectId,
            order: ep.order,
            title: ep.title,
            outline: ep.synopsis,
            hookType: ep.hookType ?? null,
            cliffhanger: ep.cliffhanger ?? null,
            isPaywalled: ep.isPaywalled,
            status: "draft",
          },
          update: {
            title: ep.title,
            outline: ep.synopsis,
            hookType: ep.hookType ?? null,
            cliffhanger: ep.cliffhanger ?? null,
            isPaywalled: ep.isPaywalled,
          },
        });
      }
      await tx.comicProject.update({
        where: { id: projectId },
        data: { status: "outlined" },
      });
    });

    return prisma.comicEpisode.findMany({
      where: { projectId, order: { gte: startOrder, lte: endOrder } },
      orderBy: { order: "asc" },
    });
  }

  async listEpisodes(projectId: string) {
    return prisma.comicEpisode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: { _count: { select: { panels: true } } },
    });
  }

  async getEpisode(episodeId: string) {
    return prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: { panels: { orderBy: { order: "asc" } } },
    });
  }

  async updateEpisodeSourceText(episodeId: string, sourceText: string) {
    return prisma.comicEpisode.update({
      where: { id: episodeId },
      data: { sourceText },
    });
  }

  async updateEpisode(
    episodeId: string,
    patch: { title?: string; outline?: string; cliffhanger?: string; isPaywalled?: boolean },
  ) {
    const data: Record<string, unknown> = {};
    if (patch.title !== undefined) data.title = patch.title.trim() || null;
    if (patch.outline !== undefined) data.outline = patch.outline.trim() || null;
    if (patch.cliffhanger !== undefined) data.cliffhanger = patch.cliffhanger.trim() || null;
    if (patch.isPaywalled !== undefined) data.isPaywalled = patch.isPaywalled;
    return prisma.comicEpisode.update({
      where: { id: episodeId },
      data,
      include: { _count: { select: { panels: true } } },
    });
  }
}
