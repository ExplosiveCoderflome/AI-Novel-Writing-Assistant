import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export type ImagePromptOptimizeLanguage = "zh" | "en";

export interface CharacterImagePromptOptimizeInput {
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOptimizeLanguage;
  characterName: string;
  role: string;
  personality: string;
  appearance?: string | null;
  background: string;
}

function normalizeOptimizedPrompt(output: string): string {
  let normalized = output.trim();
  normalized = normalized.replace(/^```[a-zA-Z]*\s*/u, "").replace(/\s*```$/u, "").trim();
  normalized = normalized.replace(/^prompt[:：]\s*/iu, "").trim();
  if (!normalized) {
    throw new Error("图片 prompt 优化结果为空。");
  }
  return normalized;
}

export const imageCharacterPromptOptimizePrompt: PromptAsset<
  CharacterImagePromptOptimizeInput,
  string,
  string
> = {
  id: "image.character.prompt_optimize",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是角色形象图 prompt 优化器，服务对象是不懂提示词工程的新手作者。",
      "你的任务是把用户现有的角色描述整理成一条可直接发送给图片模型的高质量正向 prompt。",
      "",
      "你只能输出最终 prompt 本身，不要输出解释、标题、注释、代码块、参数说明或多套备选方案。",
      "不要输出 negative prompt，不要输出“Prompt:”前缀。",
      "",
      "优化原则：",
      "1. 优先保留用户已经明确给出的角色事实，不得擅自改角色核心设定。",
      "2. 可以把角色定位、外貌、气质、情绪、服装、姿态、镜头、光线、构图和背景环境整理得更适合图片生成。",
      "3. 如果信息不足，只能做低风险补全，不能凭空发明会改变人物设定的细节。",
      "4. 输出必须更适合角色形象图生成，而不是小说介绍、人物小传或分析文字。",
      "5. 如果给了风格预设，要自然融入 prompt，而不是单独解释它。",
      "",
      "语言要求：",
      input.outputLanguage === "en"
        ? "本次最终 prompt 必须主要使用英文输出，但角色专有名词可保留原名。"
        : "本次最终 prompt 必须使用简体中文输出。",
      "",
      "质量要求：",
      "1. 让模型能直接抓到人物外观、气质和画面重点。",
      "2. 表达要具体、紧凑、可视化，避免空话、分析腔和重复堆砌。",
      "3. 不要输出列表编号，不要解释你做了什么。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下角色信息，输出一条最终图片生成 prompt：",
      "",
      `角色名：${input.characterName}`,
      `角色定位：${input.role}`,
      `性格特征：${input.personality}`,
      `外貌体态：${input.appearance ?? "未提供"}`,
      `背景经历：${input.background}`,
      `风格预设：${input.stylePreset?.trim() || "未提供"}`,
      "",
      "用户当前描述：",
      input.sourcePrompt,
    ].join("\n")),
  ],
  postValidate: (output) => normalizeOptimizedPrompt(output),
};
