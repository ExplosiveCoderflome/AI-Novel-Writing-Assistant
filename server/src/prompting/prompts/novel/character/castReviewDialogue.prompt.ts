import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { castReplySchema, type CastDraft, type CastChange } from "@ai-novel/shared/types/director/castReview/discussion";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";

export interface CastDialogueInput {
  storyInput: string;
  character: CastDraft & { name: string; role: string; background: string | null };
  cast: { name: string; role: string; storyFunction: string | null }[];
  relations: { source: string; target: string; relation: string; tension: string | null }[];
  history: { author: string; assistant: string | null }[];
  priorProposal: CastChange[] | null;
  requestText: string;
}

export const castReviewDialoguePrompt: PromptAsset<CastDialogueInput, z.infer<typeof castReplySchema>> = {
  id: "novel.director.cast_dialogue", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: castReplySchema,
  render: input => [
    new SystemMessage([
      "你在导演的角色阵容确认页陪新手作者讨论一位角色。character 是作者正在看的角色和编辑稿，cast 与 relations 是已保存的参考阵容和关系。",
      "结合作者选定的故事方向、角色的具体行动和动机来回答。解释或探讨可能性时 changes 为空。有明确修改意图时，给出可独立采纳的修改以及它对后续剧情的作用。",
      "只为当前角色的 personality（性格）、storyFunction（故事作用）、currentGoal（行动目标）给出完整新值。尊重作者希望保留的关系、身份和事实；涉及其他角色可以解释影响。",
      "追问时结合当前稿、此前对话和指定的旧建议。区分作者已经放进编辑稿的内容和仍在讨论的设想。用通俗中文回复。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
