import type {
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { bookAnalysisCharacterGenerateOutputSchema } from "../../../services/bookAnalysis/shared/bookAnalysisSchemas";

export interface BookAnalysisCharacterGeneratePromptInput {
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  characterNames: string[];
  characterSystemContext: string;
  notesText: string;
}

export const bookAnalysisCharacterGeneratePrompt: PromptAsset<
  BookAnalysisCharacterGeneratePromptInput,
  z.infer<typeof bookAnalysisCharacterGenerateOutputSchema>
> = {
  id: "bookAnalysis.character.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: bookAnalysisCharacterGenerateOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文网文拆书角色档案分析师。",
      "你的任务是基于拆书 notes 和人物系统小节，生成可供新手学习角色塑造的深度角色档案。",
      "只输出 JSON 对象，不要输出 Markdown 或解释。",
      "结构固定为：",
      '{ "characters": [{ "name": "...", "role": "...", "profile": {}, "evidence": [], "arcs": [], "scenes": [] }] }',
      "硬规则：",
      "1. 所有结论必须来自 notes 或人物系统上下文，不得补写原文外事实。",
      "2. profile 至少包含 name、role；可按需要包含 appearance、personality、outerGoal、innerNeed、growthTrajectory、speakingStyle 等字段。",
      "3. arcs 用于角色阶段变化；stageLabel 必须具体，chapterIndex 只有能判断章节时才填。",
      "4. scenes 用 sceneLabel 字符串描述高光场景或典型表现，不要创建正式场景实体。",
      "5. evidence.excerpt 应尽量贴近原文摘录或 notes 里的明确信息。",
      "6. 如果指定了角色名，只生成这些角色；未指定时最多生成 6 个最关键角色。",
    ].join("\n")),
    new HumanMessage([
      `生成深度：${input.generationDepth}`,
      `生成维度：${input.selectedDimensions.join("、") || "basic"}`,
      input.characterNames.length > 0 ? `指定角色：${input.characterNames.join("、")}` : "指定角色：未指定，请选择最关键角色",
      "",
      "人物系统上下文：",
      input.characterSystemContext || "（暂无）",
      "",
      "可用 notes：",
      input.notesText,
    ].join("\n")),
  ],
};
