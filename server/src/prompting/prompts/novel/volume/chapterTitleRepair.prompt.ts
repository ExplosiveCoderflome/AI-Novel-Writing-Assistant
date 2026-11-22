import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";

const outputSchema = z.object({
  chapters: z.array(z.object({
    chapterOrder: z.number().int().positive(),
    title: z.string().trim().min(1),
  })).min(1),
});

interface ChapterTitleRepairInput {
  issue: string;
  chapters: { chapterOrder: number; title: string; summary: string }[];
  reservedTitles: string[];
}

export const chapterTitleRepairPrompt: PromptAsset<ChapterTitleRepairInput, z.infer<typeof outputSchema>> = {
  id: "novel.volume.chapter_title_repair", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 12000 },
  outputSchema,
  render: input => [
    new SystemMessage("根据每章已定的情节重拟章名，逐章保留输入的 chapterOrder。解决给出的句式重复问题，混用短句、对白、动作和意象。章名简短、互不重复，避开保留章名。每个指定章节只返回一个标题，不增减章节，不引入新剧情。"),
    new HumanMessage(JSON.stringify(input)),
  ],
};
