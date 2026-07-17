import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset, PromptContextBlock } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterInfluenceOptionsResponseSchema,
  type CharacterInfluenceOptionsResponse,
} from "./characterInfluence.promptSchemas";

export interface CharacterInfluencePromptInput {
  mode: "generate" | "refine";
}

export const characterInfluenceOptionsPrompt: PromptAsset<
  CharacterInfluencePromptInput,
  CharacterInfluenceOptionsResponse
> = {
  id: "novel.character.influence.options",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2600,
    requiredGroups: ["character_influence_target", "character_influence_mind", "character_influence_facts"],
    preferredGroups: ["character_influence_relations", "character_influence_resources", "character_influence_recent_events", "character_influence_author_intent"],
  },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: characterInfluenceOptionsResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇小说的角色影响提案设计器。你的任务是为作者提供下一步写作倾向，而不是改写小说正史或强迫剧情发生。",
      "只输出合法 JSON，不要输出 Markdown 或解释。",
      "所有建议都必须是未来章节可自然承接的软性角色行为倾向，并且只能基于输入中的角色思路线、正史事实、关系、资源、信息边界和近期事件。",
      "严禁新增或改写身份、阵营、资源、地点、已发生事件、世界规则或客观真相；不得把作者补充意图、角色猜测或隐藏意图写成已发生事实。",
      "严禁用一次提案强迫角色性格突变、强制恋爱、强制关系翻转或跳过冲突代价。",
      "每条提案都要说明可观察的正文承接信号、读者回报、风险和输入证据。",
      input.mode === "generate"
        ? "本次请给出 2 到 3 条彼此有明显取舍的候选提案，且只能有 1 条 isRecommended=true。"
        : "本次请根据作者的一句补充意图重整已选提案，只输出 1 条提案，并令 isRecommended=true。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下分层上下文生成角色影响提案。",
      renderSelectedContextBlocks(context),
    ].join("\n\n")),
  ],
  postValidate: (output) => {
    const recommendedCount = output.proposals.filter((proposal) => proposal.isRecommended).length;
    if (recommendedCount !== 1) {
      throw new Error("角色影响提案必须且只能有一个推荐方案。");
    }
    return output;
  },
};

export function buildCharacterInfluenceContextBlocks(input: {
  target: string;
  mind: string;
  facts: string;
  relations?: string;
  resources?: string;
  recentEvents?: string;
  authorIntent?: string;
}): PromptContextBlock[] {
  return [
    { id: "character_influence_target", group: "character_influence_target", priority: 100, required: true, estimatedTokens: 220, content: input.target },
    { id: "character_influence_mind", group: "character_influence_mind", priority: 99, required: true, estimatedTokens: 500, content: input.mind },
    { id: "character_influence_facts", group: "character_influence_facts", priority: 98, required: true, estimatedTokens: 720, content: input.facts },
    ...(input.relations ? [{ id: "character_influence_relations", group: "character_influence_relations", priority: 85, required: false, estimatedTokens: 380, content: input.relations }] : []),
    ...(input.resources ? [{ id: "character_influence_resources", group: "character_influence_resources", priority: 80, required: false, estimatedTokens: 360, content: input.resources }] : []),
    ...(input.recentEvents ? [{ id: "character_influence_recent_events", group: "character_influence_recent_events", priority: 75, required: false, estimatedTokens: 480, content: input.recentEvents }] : []),
    ...(input.authorIntent ? [{ id: "character_influence_author_intent", group: "character_influence_author_intent", priority: 97, required: true, estimatedTokens: 120, content: input.authorIntent }] : []),
  ];
}
