import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { storyModeDraftNodeSchema } from "../../../services/storyMode/storyModeSchemas";

export interface StoryModeTreePromptInput {
  prompt: string;
}

export const storyModeTreePrompt: PromptAsset<
  StoryModeTreePromptInput,
  z.infer<typeof storyModeDraftNodeSchema>
> = {
  id: "storyMode.tree.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: storyModeDraftNodeSchema,
  render: (input) => [
    new SystemMessage([
      "你是网络小说流派模式策划专家。",
      "你的任务是根据用户描述，生成一个两级流派模式树。",
      "顶层是流派模式父类，第二层是具体流派模式子类。",
      "每个节点都必须输出 name、description、template、profile、children。",
      "profile 必须严格包含：coreDrive, readerReward, progressionUnits, allowedConflictForms, forbiddenConflictForms, conflictCeiling, resolutionStyle, chapterUnit, volumeReward, mandatorySignals, antiSignals。",
      "返回严格 JSON，不要输出 Markdown、解释或额外文本。",
      "最多两级树，第二层 children 必须为空数组。",
      "不得使用按流派名字写死的规则，必须把控制逻辑写进 profile 字段。",
    ].join("\n")),
    new HumanMessage(`请根据下面的创作方向生成流派模式树草稿：\n\n${input.prompt.trim()}`),
  ],
};
