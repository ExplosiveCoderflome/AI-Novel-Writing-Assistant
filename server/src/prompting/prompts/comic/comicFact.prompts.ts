import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export const comicFactExtractionOutputSchema = z.object({
  facts: z.array(
    z.object({
      text: z.string().trim().min(1).max(200),
      category: z.enum(["completed", "revealed", "state_changed"]).default("completed"),
    }),
  ).max(10),
});

export type ComicFactExtractionOutput = z.infer<typeof comicFactExtractionOutputSchema>;

export interface ComicFactExtractionInput {
  projectTitle: string;
  episodeOrder: number;
  episodeTitle: string;
  panelSummary: string;
  existingFacts: string;
}

export const comicFactExtractionPrompt: PromptAsset<
  ComicFactExtractionInput,
  ComicFactExtractionOutput
> = {
  id: "comic.factExtraction",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 3000 },
  outputSchema: comicFactExtractionOutputSchema,
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
