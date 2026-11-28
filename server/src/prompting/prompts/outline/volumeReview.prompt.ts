import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { PromptAsset } from "../../core/promptTypes";

const outputSchema = z.object({
  replyText: z.string().trim().min(1),
  changes: z.array(z.object({
    field: z.enum(["title", "summary", "promise", "pressure", "protagonistChange", "climax", "endingHook"]),
    value: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  }).strict()),
}).strict();

interface Input {
  volume: OutlineDocument["volumes"][number];
  document: OutlineDocument;
  requestText: string;
  baseVersion: number;
  history: { author: string; assistant: string | null }[];
  priorProposal: unknown;
}

export const outlineVolumeReviewPrompt: PromptAsset<Input, z.infer<typeof outputSchema>> = {
  id: "outline.volume_review", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema,
  render: input => [
    new SystemMessage([
      "你与作者一起修改选中的卷纲。依据作者的本轮要求、当前保存稿、本卷讨论和所引用的建议，核对本卷已有章纲与前后卷的衔接。",
      "可以调整 title 卷名、summary 卷梗概、promise 本卷承诺、pressure 核心压力、protagonistChange 主角变化、climax 卷高潮、endingHook 卷末悬念。",
      "相对本卷当前保存稿，只为需要改变的字段给出完整的新值和理由，每个字段最多出现一次。作者要求保留的内容沿用原稿。讨论或需要澄清时，在 replyText 回复并返回空 changes。",
      "场景落在本卷既有的情节和人物上。若需要重排节奏段或修改某章的章纲，在回复中指出可以使用的卷节奏或章节入口。追问已有建议时，结合本轮要求给出可独立采纳的修改。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
