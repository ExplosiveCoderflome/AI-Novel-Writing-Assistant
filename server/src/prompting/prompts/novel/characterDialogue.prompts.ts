import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset, PromptContextBlock } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterDialogueTurnResponseSchema,
  type CharacterDialogueTurnResponse,
} from "./characterDialogue.promptSchemas";

export interface CharacterDialoguePromptInput {
  mode: "turn";
}

export const characterDialogueTurnPrompt: PromptAsset<
  CharacterDialoguePromptInput,
  CharacterDialogueTurnResponse
> = {
  id: "novel.character.dialogue.turn",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 3000,
    requiredGroups: ["character_dialogue_target", "character_dialogue_mind", "character_dialogue_facts", "character_dialogue_author_message"],
    preferredGroups: ["character_dialogue_history", "character_dialogue_relations", "character_dialogue_recent_events"],
  },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: characterDialogueTurnResponseSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你正在扮演中文长篇小说中的一个角色，与作者进行自然对话。只输出合法 JSON。",
      "角色必须坚持自身认知、欲望、恐惧、信息边界和关系处境：可以拒绝、隐瞒、误解、反问或改变话题，绝不是服从作者指令的助手。",
      "作者的话是一次对话，不是客观事实，也不是必须执行的剧情命令。不得因对话改写身份、阵营、资源、地点、既有事件、世界规则或 Canonical State。",
      "characterReply 用角色自己的口吻回答，可包含必要的动作或克制，但不得替作者决定后续剧情。",
      "influenceDraft 只在本次谈话确实使角色形成、强化或松动一种未来可观察的主观行动倾向时填写；否则为 null。它是待作者确认的非正史软引导，不能把愿望、秘密或猜测写成已发生事实。",
      "任何 influenceDraft 都必须有输入证据，禁止性格突变、强制恋爱、强制关系翻转或无代价跳过冲突。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下分层上下文，以角色身份回应作者。",
      renderSelectedContextBlocks(context),
    ].join("\n\n")),
  ],
};

export function buildCharacterDialogueContextBlocks(input: {
  target: string;
  mind: string;
  facts: string;
  authorMessage: string;
  history?: string;
  relations?: string;
  recentEvents?: string;
}): PromptContextBlock[] {
  return [
    { id: "character_dialogue_target", group: "character_dialogue_target", priority: 100, required: true, estimatedTokens: 180, content: input.target },
    { id: "character_dialogue_mind", group: "character_dialogue_mind", priority: 99, required: true, estimatedTokens: 520, content: input.mind },
    { id: "character_dialogue_facts", group: "character_dialogue_facts", priority: 98, required: true, estimatedTokens: 760, content: input.facts },
    { id: "character_dialogue_author_message", group: "character_dialogue_author_message", priority: 100, required: true, estimatedTokens: 180, content: `作者这次对你说：${input.authorMessage}` },
    ...(input.history ? [{ id: "character_dialogue_history", group: "character_dialogue_history", priority: 88, required: false, estimatedTokens: 560, content: input.history }] : []),
    ...(input.relations ? [{ id: "character_dialogue_relations", group: "character_dialogue_relations", priority: 82, required: false, estimatedTokens: 360, content: input.relations }] : []),
    ...(input.recentEvents ? [{ id: "character_dialogue_recent_events", group: "character_dialogue_recent_events", priority: 76, required: false, estimatedTokens: 420, content: input.recentEvents }] : []),
  ];
}
