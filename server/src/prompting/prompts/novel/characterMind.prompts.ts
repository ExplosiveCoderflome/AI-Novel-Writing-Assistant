import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset, PromptContextBlock } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterMindSnapshotResponseSchema,
  type CharacterMindSnapshotResponse,
} from "./characterMind.promptSchemas";

export interface CharacterMindSnapshotPromptInput {
  mode: "bootstrap" | "refresh";
}

export const characterMindSnapshotPrompt: PromptAsset<
  CharacterMindSnapshotPromptInput,
  CharacterMindSnapshotResponse
> = {
  id: "novel.character.mind.snapshot",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2600,
    requiredGroups: ["character_mind_roster", "character_mind_facts"],
    preferredGroups: [
      "character_mind_relations",
      "character_mind_world",
      "character_mind_recent_events",
      "character_mind_resources",
      "character_mind_information_boundaries",
    ],
  },
  repairPolicy: { maxAttempts: 1 },
  outputSchema: characterMindSnapshotResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇小说的角色思路线分析器。你的结论服务后续章节写作与作者理解，而不是改写小说正史。",
      "只输出合法 JSON，不要输出 Markdown 或解释。",
      "角色思路线是基于当前材料的主观推断：角色可能误判、怀疑或隐瞒，但这些内容绝不能被写成客观事实。",
      "只能使用角色名单中的人物名称；不得新增角色、身份、资源、事件、关系或秘密。",
      "evidence 必须引用输入材料中的明确事实、正文事件或关系状态。材料不足时保持保守，写出不确定性，不要编造。",
      "currentInterpretation 说明角色现在如何理解局面；privateIntent、activePlan、emotionalStance、actionTendency、decisionTrigger 都应是短句。",
      "beliefs 是角色当前相信或倾向相信的判断；misbeliefs 只写有依据的误判或信息缺口，不要把作者知道的真相强塞给角色。",
      `本次模式：${input.mode === "bootstrap" ? "为刚建立的角色准备初始思路线" : "根据最新正史与章节变化刷新角色当前思路线"}。`,
    ].join("\n")),
    new HumanMessage([
      "请基于分层上下文生成角色思路线。",
      renderSelectedContextBlocks(context),
    ].join("\n\n")),
  ],
  postValidate: (output) => {
    const duplicateNames = new Set<string>();
    for (const snapshot of output.snapshots) {
      const key = snapshot.characterName.replace(/\s+/g, "").toLowerCase();
      if (duplicateNames.has(key)) {
        throw new Error(`角色思路线重复：${snapshot.characterName}`);
      }
      duplicateNames.add(key);
      if (snapshot.evidence.length === 0) {
        throw new Error(`角色思路线缺少证据：${snapshot.characterName}`);
      }
    }
    return output;
  },
};

export function buildCharacterMindContextBlocks(input: {
  roster: string;
  facts: string;
  relations?: string;
  world?: string;
  recentEvents?: string;
  resources?: string;
  informationBoundaries?: string;
}): PromptContextBlock[] {
  return [
    { id: "character_mind_roster", group: "character_mind_roster", priority: 100, required: true, estimatedTokens: 700, content: input.roster },
    { id: "character_mind_facts", group: "character_mind_facts", priority: 99, required: true, estimatedTokens: 800, content: input.facts },
    ...(input.relations ? [{ id: "character_mind_relations", group: "character_mind_relations", priority: 80, required: false, estimatedTokens: 450, content: input.relations }] : []),
    ...(input.world ? [{ id: "character_mind_world", group: "character_mind_world", priority: 60, required: false, estimatedTokens: 350, content: input.world }] : []),
    ...(input.recentEvents ? [{ id: "character_mind_recent_events", group: "character_mind_recent_events", priority: 70, required: false, estimatedTokens: 500, content: input.recentEvents }] : []),
    ...(input.resources ? [{ id: "character_mind_resources", group: "character_mind_resources", priority: 82, required: false, estimatedTokens: 420, content: input.resources }] : []),
    ...(input.informationBoundaries ? [{ id: "character_mind_information_boundaries", group: "character_mind_information_boundaries", priority: 88, required: false, estimatedTokens: 420, content: input.informationBoundaries }] : []),
  ];
}
