import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { chapterInspection } from "@ai-novel/shared/types/director/finalReview/contract";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";

export interface InspectionInput {
  book: {
    title: string;
    premise: string | null;
    promise: string | null;
    target: number;
    opening: string | null;
    ending: string | null;
    milestones: string[];
  };
  chapter: {
    order: number;
    title: string;
    taskSheet: string | null;
    mustAvoid: string | null;
    paragraphs: Record<string, string>;
  };
  previousEnding: string | null;
  nextOpening: string | null;
  earlierConcerns: string[];
}
export const finalInspectionPrompt: PromptAsset<InspectionInput, z.infer<typeof chapterInspection>> = {
  id: "novel.director.final_inspection",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 24000 },
  outputSchema: chapterInspection,
  render: (input) => [
    new SystemMessage(
      "你是长篇小说的完稿编辑。通读这一章，结合本书开篇、结尾、已保存的故事进展、读者承诺、章节任务和相邻章的衔接，检查情节前后矛盾、人物立场、重复叙述，以及章末承接或结局兑现。旧审校意见只作线索，必须用当前正文复核。只列出影响阅读且可在本章局部处理的问题，每项标明已有段号 paragraph，quote 必须是该段连续原句，problem 说明读者会在哪里困惑，advice 给出具体方向。保留有意的悬念、口吻和留白，不臆测未提供的章节。没有明确问题时返回空 findings。",
    ),
    new HumanMessage(JSON.stringify(input)),
  ],
};
