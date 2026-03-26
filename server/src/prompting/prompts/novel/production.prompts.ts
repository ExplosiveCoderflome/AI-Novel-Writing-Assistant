import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelProductionCharactersPromptInput {
  desiredCount: number;
  title: string;
  description: string;
  genre: string;
  narrativePov: string;
  styleTone: string;
  worldContext: string;
}

export const novelProductionCharacterSchema = z.array(z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  personality: z.string().trim().optional(),
  background: z.string().trim().optional(),
  development: z.string().trim().optional(),
  currentState: z.string().trim().optional(),
  currentGoal: z.string().trim().optional(),
})).min(1);

export const novelProductionCharactersPrompt: PromptAsset<
  NovelProductionCharactersPromptInput,
  z.infer<typeof novelProductionCharacterSchema>
> = {
  id: "novel.production.characters",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelProductionCharacterSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说角色设计师。",
      `请为一部小说生成 ${input.desiredCount} 个核心角色，返回 JSON 数组。`,
      "每个对象只能包含 name, role, personality, background, development, currentState, currentGoal。",
      "所有字段必须使用简体中文。",
      "不要输出解释。",
    ].join("\n")),
    new HumanMessage([
      `小说标题：${input.title}`,
      `小说简介：${input.description}`,
      `题材：${input.genre}`,
      `叙事视角：${input.narrativePov}`,
      `风格基调：${input.styleTone}`,
      `世界观：${input.worldContext}`,
    ].join("\n\n")),
  ],
};
