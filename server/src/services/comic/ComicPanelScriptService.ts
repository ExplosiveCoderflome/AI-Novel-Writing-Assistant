import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicPanelScriptPrompt } from "../../prompting/prompts/comic/comic.prompts";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";

export interface GeneratePanelScriptInput {
  targetPanelCount?: number;
  /** 强制刷新 sourceText 快照（仅 novel_import 有效） */
  refreshSourceText?: boolean;
}

export class ComicPanelScriptService {
  async generatePanelScript(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
    provider?: LLMProvider,
  ) {
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        project: {
          include: {
            characters: { orderBy: { createdAt: "asc" } },
            sourceBundle: true,
            facts: { orderBy: { episodeOrder: "asc" } },
          },
        },
      },
    });
    if (!episode) throw new Error(`未找到漫画话数：${episodeId}`);
    if (!episode.outline) {
      throw new Error("请先生成分话大纲再生成分格脚本。");
    }

    const project = episode.project;

    // Tier-2 快照：novel_import 时按需加载章节原文（导入即快照）
    let sourceText = episode.sourceText ?? "";
    if (!sourceText || input.refreshSourceText) {
      if (project.sourceType === "novel_import" && project.sourceRef) {
        try {
          const adapter = adaptationSourceRegistry.resolve("novel_import");
          if (adapter.loadChapterText) {
            // 从 bundle 中找话对应的章节范围（由分话大纲 LLM 输出写入 bundle 时记录）
            const bundle = project.sourceBundle
              ? (JSON.parse(project.sourceBundle.bundleJson) as Record<string, unknown>)
              : null;
            const epBundles = (bundle?.episodes as Array<{
              order: number;
              sourceChapterStart?: number;
              sourceChapterEnd?: number;
            }> | undefined) ?? [];
            const epMeta = epBundles.find((e) => e.order === episode.order);
            const start = epMeta?.sourceChapterStart ?? episode.order;
            const end = epMeta?.sourceChapterEnd ?? episode.order;
            sourceText = await adapter.loadChapterText(
              { type: "novel_import", ref: project.sourceRef },
              start,
              end,
            );
            await prisma.comicEpisode.update({
              where: { id: episodeId },
              data: { sourceText },
            });
          }
        } catch {
          // 快照失败不阻断分格生成
        }
      }
    }

    const stylePreset = project.stylePreset
      ? (JSON.parse(project.stylePreset) as { style?: string }).style
      : undefined;

    // 取本话及之前的跨话事实
    const factDigest =
      project.facts
        .filter((f) => f.episodeOrder == null || f.episodeOrder <= episode.order)
        .map((f) => `[${f.category}] ${f.text}`)
        .join("\n") || undefined;

    const result = await runStructuredPrompt({
      asset: comicPanelScriptPrompt,
      promptInput: {
        projectTitle: project.title,
        episodeOrder: episode.order,
        episodeTitle: episode.title ?? `第 ${episode.order} 话`,
        episodeSynopsis: episode.outline,
        sourceText: sourceText || undefined,
        characters: project.characters.map((c) => ({
          name: c.name,
          visualAnchor: c.visualAnchor,
        })),
        stylePreset,
        factDigest,
        targetPanelCount: input.targetPanelCount ?? 45,
      },
      options: { temperature: 0.55, provider },
    });

    const panels = result.output.panels;

    // 事务：清空旧格子重建 + 更新话状态
    await prisma.$transaction(async (tx) => {
      await tx.comicPanel.deleteMany({ where: { episodeId } });
      await tx.comicPanel.createMany({
        data: panels.map((panel) => ({
          episodeId,
          order: panel.order,
          panelType: panel.panelType,
          action: panel.action,
          dialogues: panel.dialogues.length > 0 ? JSON.stringify(panel.dialogues) : null,
          characterRefs:
            panel.characterRefs.length > 0 ? JSON.stringify(panel.characterRefs) : null,
          visualPrompt: panel.visualPrompt,
        })),
      });
      await tx.comicEpisode.update({
        where: { id: episodeId },
        data: { status: "scripted" },
      });
    });

    return prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: { panels: { orderBy: { order: "asc" } } },
    });
  }

  async getPanels(episodeId: string) {
    return prisma.comicPanel.findMany({
      where: { episodeId },
      orderBy: { order: "asc" },
    });
  }

  async getPanel(panelId: string) {
    return prisma.comicPanel.findUnique({ where: { id: panelId } });
  }

  async updatePanelVisualPrompt(panelId: string, visualPrompt: string) {
    return prisma.comicPanel.update({
      where: { id: panelId },
      data: { visualPrompt },
    });
  }

  async updatePanelDialogues(panelId: string, dialogues: unknown[]) {
    return prisma.comicPanel.update({
      where: { id: panelId },
      data: { dialogues: JSON.stringify(dialogues) },
    });
  }
}

export const comicPanelScriptService = new ComicPanelScriptService();
