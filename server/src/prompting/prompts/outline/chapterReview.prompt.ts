import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { PromptAsset } from "../../core/promptTypes";

const field = z.enum(["title", "summary", "purpose", "conflict", "emotionalBeat", "endingHook"]);
const output = z.object({
  replyText: z.string().trim().min(1),
  changes: z.array(z.object({ field, value: z.string().trim().min(1), reason: z.string().trim().min(1) }).strict()),
}).strict();
interface Input {
  chapter: OutlineDocument["chapters"][number];
  document: OutlineDocument;
  requestText: string;
  baseVersion: number;
  history: { author: string; assistant: string | null }[];
  priorProposal: unknown;
}
export const outlineChapterReviewPrompt: PromptAsset<Input, z.infer<typeof output>> = {
  id: "outline.chapter_review", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: output,
  render: input => [
    new SystemMessage([
      "你协助作者调整选中的章纲。根据本章、已保存大纲、该章此前讨论和选中的建议理解要求。保持人物与前后章节连贯。",
      "可分别修改的字段：title 章节名，summary 章纲梗概，purpose 章节目的，conflict 主要冲突，emotionalBeat 情绪与信息推进，endingHook 章末悬念或结尾钩子。",
      "即使当前章没有某个可选字段，也可以为它给出新值。作者只要求调整某一项时，只返回该字段；要求保留的已有字段不应列入 changes。例如仅补章末悬念时返回 endingHook，保留 summary。",
      "需要修改时，每个有变化的字段给一个完整的新值和理由。其他章节及出场人物仅供参考。要求涉及全书时可说明如何从大纲助手继续讨论。",
      "解释或澄清时返回空 changes。追问已有提案时，结合作者最新要求，相对当前保存稿给出完整的修改建议。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
