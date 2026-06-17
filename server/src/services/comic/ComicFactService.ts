import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import type { PromptAsset } from "../../prompting/core/promptTypes";

// ─── Schema ───────────────────────────────────────────────────────────────────

const factExtractionOutputSchema = z.object({
  facts: z.array(
    z.object({
      text: z.string().trim().min(1).max(200),
      category: z.enum(["completed", "revealed", "state_changed"]).default("completed"),
    }),
  ).max(10),
});

type FactExtractionOutput = z.infer<typeof factExtractionOutputSchema>;

interface FactExtractionInput {
  projectTitle: string;
  episodeOrder: number;
  episodeTitle: string;
  panelSummary: string;
  existingFacts: string;
}

const factExtractionPrompt: PromptAsset<FactExtractionInput, FactExtractionOutput> = {
  id: "comic.factExtraction",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: factExtractionOutputSchema,
  render(input) {
    return [
      new SystemMessage(
        `你是漫画连载项目的视觉一致性管理员。
你的任务是从本话分格脚本中提取需要跨话保持一致的关键视觉事实。
只提取对未来话数图像生成有约束意义的事实，忽略无关紧要的细节。
类别说明：
- completed：已发生的重要事件（道具损坏/关系确立/场景变化）
- revealed：首次出现的角色/地点/道具视觉描述
- state_changed：角色状态改变（受伤/换装/情感状态）`,
      ),
      new HumanMessage(
        `漫画项目：${input.projectTitle}
本话：第 ${input.episodeOrder} 话《${input.episodeTitle}》

## 本话分格摘要
${input.panelSummary}

${input.existingFacts ? `## 已记录的跨话事实（不要重复）\n${input.existingFacts}\n` : ""}
## 任务
从本话中提取需要在未来各话图像生成中保持一致的视觉事实，返回 facts 数组。
每条事实 ≤200字，语言简洁，直接描述视觉约束（如：「林落羽右臂有刀疤，从第3话起始终存在」）。
不要重复已有事实。若本话无新增视觉事实，返回空数组。`,
      ),
    ];
  },
};

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
        asset: factExtractionPrompt,
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
