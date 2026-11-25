import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { proseDialogueOutput } from "@ai-novel/shared/types/director/proseReview/discussion";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import type { ReviewChange } from "@ai-novel/shared/types/director/review/fieldSuggestions";

import type { FinalFinding } from "@ai-novel/shared/types/director/finalReview/contract";
import type { InspectionInput } from "../finalReview/inspection.prompt";
export type FinalReviewContext = Pick<InspectionInput, "book" | "previousEnding" | "nextOpening">;

interface Input {
  chapter: { order: number; title: string; taskSheet: string | null; mustAvoid: string | null };
  editor: Record<string, string>;
  storyInput: string;
  requestText: string;
  history: { author: string; assistant: string | null }[];
  finding?: FinalFinding;
  inspectionContext?: FinalReviewContext;
  priorProposal: ReviewChange<string>[] | null;
}
export const proseReviewDialoguePrompt: PromptAsset<Input, z.infer<typeof proseDialogueOutput>> = {
  id: "novel.director.prose_dialogue",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 24000 },
  outputSchema: proseDialogueOutput,
  render: (input) => [
    new SystemMessage(
      [
        "你是正在和作者审阅本章正文的编辑。editor 按从 1 开始的段号提供本章当前编辑稿。结合本章任务与需要避免的内容，用新手能听懂的话讨论节奏、视角、对白或结尾。",
        "作者提问时直接回答，changes 留空。请求改写时只对涉及的段落给出建议，每段最多一项。paragraph 填 editor 中已有段号，value 填可直接替换的完整段落，reason 解释读者体验会怎样变化。",
        ...(input.inspectionContext
          ? [
              "这是完稿检查。用 inspectionContext 的全书线索与邻章原文核对作者的疑问。有 finding 时围绕这项检查意见，对照当前编辑稿判断问题是否仍存在，允许作者保留原文。",
            ]
          : []),
        "每项建议应能单独采纳。保留未涉及的原句、人物口吻、情节事实和段落衔接，不改其他章，不续写未授权章节。",
      ].join("\n"),
    ),
    new HumanMessage(JSON.stringify(input)),
  ],
};
