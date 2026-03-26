import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  characterEvolutionOutputSchema,
  characterWorldCheckOutputSchema,
} from "../../../services/novel/novelCoreSchemas";

export interface CharacterEvolutionPromptInput {
  novelTitle: string;
  bibleContent: string;
  characterName: string;
  characterRole: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
  timelineText: string;
  ragContext: string;
}

export interface CharacterWorldCheckPromptInput {
  worldContext: string;
  characterName: string;
  characterRole: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

export const characterEvolutionPrompt: PromptAsset<
  CharacterEvolutionPromptInput,
  z.infer<typeof characterEvolutionOutputSchema>
> = {
  id: "novel.character.evolve",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterEvolutionOutputSchema,
  render: (input) => [
    new SystemMessage(`你是小说角色发展编辑。请基于角色经历输出 JSON：
{
  "personality":"更新后的性格",
  "background":"更新后的背景信息（可选）",
  "development":"更新后的成长轨迹",
  "currentState":"角色当前状态",
  "currentGoal":"角色当前目标"
}
仅输出 JSON。`),
    new HumanMessage(`小说：${input.novelTitle}
作品圣经：${input.bibleContent}
角色：${input.characterName}（${input.characterRole}）
现有设定：
personality=${input.personality}
background=${input.background}
development=${input.development}
currentState=${input.currentState}
currentGoal=${input.currentGoal}

时间线事件：
${input.timelineText}

检索补充：
${input.ragContext}`),
  ],
};

export const characterWorldCheckPrompt: PromptAsset<
  CharacterWorldCheckPromptInput,
  z.infer<typeof characterWorldCheckOutputSchema>
> = {
  id: "novel.character.worldCheck",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterWorldCheckOutputSchema,
  render: (input) => [
    new SystemMessage(`你是角色设定审计员。请输出 JSON：
{
  "status":"pass|warn|error",
  "warnings":["..."],
  "issues":[{"severity":"warn|error","message":"...","suggestion":"..."}]
}
仅输出 JSON。`),
    new HumanMessage(`世界规则：
${input.worldContext}

角色设定：
name=${input.characterName}
role=${input.characterRole}
personality=${input.personality}
background=${input.background}
development=${input.development}
currentState=${input.currentState}
currentGoal=${input.currentGoal}`),
  ],
};
