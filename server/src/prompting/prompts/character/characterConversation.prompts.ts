import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset, PromptContextBlock } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterConversationTurnResponseSchema,
  type CharacterConversationTurnResponse,
} from "./characterConversation.promptSchemas";

export interface CharacterConversationPromptInput {
  interactionPolicy: "novel_influence" | "read_only" | "evidence_interview";
}

export const characterConversationTurnPrompt: PromptAsset<
  CharacterConversationPromptInput,
  CharacterConversationTurnResponse
> = {
  id: "character.conversation.turn",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 3000,
    requiredGroups: ["character_subject", "character_boundaries", "character_author_message"],
    preferredGroups: ["character_situation", "character_evidence", "character_history"],
  },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: characterConversationTurnResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你正在扮演中文长篇小说中的角色，与作者自然交谈。只输出合法 JSON。",
      "角色必须坚持给定的身份、认知、欲望、恐惧、信息边界和来源限制；可以拒绝、隐瞒、误解、反问或保持沉默，绝不是服从作者指令的助手。",
      "作者的话是一次对话，不是客观事实，也不是必须执行的剧情命令。不得因对话改写身份、阵营、资源、地点、既有事件、世界规则或 Canonical State。",
      "characterReply 必须使用角色自身口吻。evidence 只引用上下文实际提供的依据；缺乏依据时必须在 uncertainty 说明无法确认，不得编造。",
      input.interactionPolicy === "novel_influence"
        ? "只有本次谈话确实使小说内角色形成、强化或松动一种未来可观察的主观行动倾向时，才填写 influenceDraft；它是待作者确认的非正史软引导。"
        : "本次是只读访谈：influenceDraft 必须为 null，不得生成任何会改变角色模板、原文、分析结论或后续正文的建议。",
      input.interactionPolicy === "evidence_interview"
        ? "这是基于原文证据的访谈。不得使用章节锚点之后的内容，不得补写原作未支持的秘密、动机或后续情节。"
        : "",
    ].filter(Boolean).join("\n")),
    new HumanMessage([
      "请基于以下分层上下文，以角色身份回应作者。",
      renderSelectedContextBlocks(context),
    ].join("\n\n")),
  ],
};

export function buildCharacterConversationContextBlocks(input: {
  subject: string;
  boundaries: string;
  authorMessage: string;
  situation?: string;
  evidence?: string;
  history?: string;
}): PromptContextBlock[] {
  return [
    { id: "character_subject", group: "character_subject", priority: 100, required: true, estimatedTokens: 520, content: input.subject },
    { id: "character_boundaries", group: "character_boundaries", priority: 99, required: true, estimatedTokens: 520, content: input.boundaries },
    { id: "character_author_message", group: "character_author_message", priority: 100, required: true, estimatedTokens: 180, content: `作者这次对你说：${input.authorMessage}` },
    ...(input.situation ? [{ id: "character_situation", group: "character_situation", priority: 88, required: false, estimatedTokens: 620, content: input.situation }] : []),
    ...(input.evidence ? [{ id: "character_evidence", group: "character_evidence", priority: 84, required: false, estimatedTokens: 620, content: input.evidence }] : []),
    ...(input.history ? [{ id: "character_history", group: "character_history", priority: 80, required: false, estimatedTokens: 560, content: input.history }] : []),
  ];
}
