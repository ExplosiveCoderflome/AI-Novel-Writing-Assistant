import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicFactExtractionPrompt } from "../../prompting/prompts/comic/comic.prompts";

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicFactService {
  /**
   * 从已生成的分格脚本中提取跨话事实，异步写入 ComicFact。
   * 设计为 fire-and-forget，不阻塞脚本生成响应。
   */
  async extractAndSave(
    episodeId: string,
    provider?: LLMProvider,
  ): Promise<void> {
    try {
      const episode = await prisma.comicEpisode.findUnique({
        where: { id: episodeId },
        include: {
          panels: { orderBy: { order: "asc" } },
          project: {
            include: { facts: { orderBy: { episodeOrder: "asc" } } },
          },
        },
      });
      if (!episode || episode.panels.length === 0) return;

      // 构建本话分格摘要（action + 首条对白），控制在 2000 字内
      const panelSummary = episode.panels
        .map((p) => {
          let line = `格${p.order}[${p.panelType}]: ${p.action}`;
          if (p.characterRefs) {
            try {
              const refs = JSON.parse(p.characterRefs) as Array<{ name?: string; costume?: string; expression?: string } | string>;
              const names = refs
                .map((r) => (typeof r === "string" ? r : r.name))
                .filter(Boolean)
                .join("、");
              if (names) line += ` (${names})`;
            } catch { /* ignore */ }
          }
          return line;
        })
        .join("\n")
        .slice(0, 2000);

      const existingFacts = episode.project.facts
        .map((f) => `[${f.category}] ${f.text}`)
        .join("\n");

      const result = await runStructuredPrompt({
        asset: comicFactExtractionPrompt,
        promptInput: {
          projectTitle: episode.project.title,
          episodeOrder: episode.order,
          episodeTitle: episode.title ?? `第 ${episode.order} 话`,
          panelSummary,
          existingFacts,
        },
        options: { temperature: 0.3, provider },
      });

      const newFacts = result.output.facts;
      if (newFacts.length === 0) return;

      await prisma.comicFact.createMany({
        data: newFacts.map((f) => ({
          projectId: episode.projectId,
          episodeOrder: episode.order,
          text: f.text,
          category: f.category,
        })),
      });

      console.log(`[comic.fact] extracted ${newFacts.length} facts for episode=${episodeId} order=${episode.order}`);
    } catch (err) {
      // 事实提取失败不影响主流程
      console.warn(`[comic.fact] extraction failed for episode=${episodeId}:`, err);
    }
  }

  async listFacts(projectId: string) {
    return prisma.comicFact.findMany({
      where: { projectId },
      orderBy: [{ episodeOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async deleteFact(factId: string) {
    return prisma.comicFact.delete({ where: { id: factId } });
  }
}

export const comicFactService = new ComicFactService();
