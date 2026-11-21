import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { candidateFieldLabel, candidateReplySchema, type CandidateProposal, type CandidateReply } from "@ai-novel/shared/types/director/candidateReview";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import type { PromptAsset } from "../../../core/promptTypes";

export interface CandidateDialogueInput {
  idea: string;
  candidate: DirectorCandidate;
  requestText: string;
  history: { author: string; assistant: string | null }[];
  priorProposal: CandidateProposal | null;
}
export const candidateDialoguePrompt: PromptAsset<CandidateDialogueInput, CandidateReply> = {
  id: "novel.director.candidate_dialogue", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: candidateReplySchema,
  render: input => [
    new SystemMessage([
      "你在开书前陪新手作者讨论眼前的一套故事方向。结合灵感、当前候选、这套方向的讨论和指定的上一份建议理解作者意图。",
      "解释、比较、澄清时用通俗中文回答，changes 为空。有明确修改意图时，给出具体到人物行动与后果的独立字段修改。",
      "每项提供完整的新值和理由，只列有实质变化的字段。尊重作者要求保留的部分。追问时以当前候选为基准，综合上一份建议与新要求。",
      "可编辑字段为 " + JSON.stringify(candidateFieldLabel) + "。书名、题材、篇幅等设置仅供参考。涉及设置时引导作者在开书页调整。",
      "replyText 说清建议或提出一个能帮助作者决定的问题。修改由作者另行采纳。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
