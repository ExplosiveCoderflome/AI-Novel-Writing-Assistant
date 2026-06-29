import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicPanelScriptPrompt } from "../../prompting/prompts/comic/comic.prompts";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";
import { comicFactService } from "./ComicFactService";

export interface GeneratePanelScriptInput {
  targetPanelCount?: number;
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
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
            characterAssets: {
              orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
            },
            scenes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
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

    const stylePresetRaw = project.stylePreset
      ? (JSON.parse(project.stylePreset) as { style?: string; promptKeywords?: string; format?: string })
      : undefined;
    const stylePreset = stylePresetRaw?.style;
    const stylePromptKeywords = stylePresetRaw?.promptKeywords;
    const comicFormat = stylePresetRaw?.format;
    const densityMode = input.densityMode ?? "balanced";
    const targetPanelCount =
      input.targetPanelCount
      ?? (comicFormat === "4koma"
        ? densityMode === "relaxed" ? 10 : densityMode === "compact" ? 16 : 12
        : densityMode === "relaxed" ? 30 : densityMode === "compact" ? 65 : 45);

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
        characterAssets: project.characterAssets
          .map((a) => {
            const charName = project.characters.find((c) => c.id === a.characterId)?.name;
            if (!charName) return null;
            return {
              characterName: charName,
              assetType: a.assetType,
              name: a.name,
              description: a.description ?? undefined,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null),
        existingScenes: project.scenes.map((s) => {
          let summary = "";
          try {
            const bible = s.bible ? (JSON.parse(s.bible) as { keyElements?: string }) : null;
            summary = bible?.keyElements ?? "";
          } catch { /* ignore */ }
          return { name: s.name, sceneType: s.sceneType, summary: summary || undefined };
        }),
        stylePreset,
        stylePromptKeywords,
        comicFormat,
        factDigest,
        densityMode,
        scriptPromptInstruction: input.scriptPromptInstruction,
        targetPanelCount,
      },
      options: { temperature: 0.55, provider },
    });

    const panels = result.output.panels;
    const scenes = result.output.scenes ?? [];
    const scriptConfig = {
      densityMode,
      targetPanelCount,
      comicFormat: comicFormat ?? "webtoon",
      stylePreset,
      stylePromptKeywords,
      scriptPromptInstruction: input.scriptPromptInstruction,
      promptAssetId: comicPanelScriptPrompt.id,
      promptAssetVersion: comicPanelScriptPrompt.version,
      provider,
      generatedAt: new Date().toISOString(),
    };

    // 已存在的场景名集合（跨话/用户编辑过的不覆盖）
    const existingSceneNames = new Set(project.scenes.map((s) => s.name));

    // 事务：upsert 场景（仅新增）+ 清空旧格子重建 + 更新话状态
    await prisma.$transaction(async (tx) => {
      // 仅创建尚不存在的场景草案，保留用户编辑过的 bible 与跨话场景
      const newScenes = scenes.filter((s) => !existingSceneNames.has(s.name));
      if (newScenes.length > 0) {
        await tx.comicScene.createMany({
          data: newScenes.map((s, i) => ({
            projectId: project.id,
            name: s.name,
            sceneType: s.sceneType,
            bible: JSON.stringify({
              palette: s.palette,
              keyElements: s.keyElements,
              materials: s.materials ?? "",
              ambiance: s.ambiance ?? "",
              layout: s.layout ?? "",
            }),
            sortOrder: project.scenes.length + i,
          })),
        });
      }

      await tx.comicPanel.deleteMany({ where: { episodeId } });
      await tx.comicPanel.createMany({
        data: panels.map((panel) => ({
          episodeId,
          order: panel.order,
          panelType: panel.panelType,
          densityLevel: panel.densityLevel,
          focus: panel.focus,
          action: panel.action,
          sceneRef: panel.sceneRef?.trim() || null,
          dialogues: panel.dialogues.length > 0 ? JSON.stringify(panel.dialogues) : null,
          characterRefs:
            panel.characterRefs.length > 0 ? JSON.stringify(panel.characterRefs) : null,
          visualPrompt: panel.visualPrompt,
          layoutData: panel.layoutData ? JSON.stringify(panel.layoutData) : null,
        })),
      });
      await tx.comicEpisode.update({
        where: { id: episodeId },
        data: { status: "scripted", scriptConfig: JSON.stringify(scriptConfig) },
      });
    });

    // 异步提取跨话事实，不阻塞响应
    void comicFactService.extractAndSave(episodeId, provider);

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
