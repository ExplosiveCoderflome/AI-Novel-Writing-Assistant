import type {
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  bookAnalysisCharacterGenerateOutputSchema,
  bookAnalysisCharacterIdentifyOutputSchema,
  bookAnalysisCharacterProfileOutputSchema,
} from "../../../services/bookAnalysis/shared/bookAnalysisSchemas";

export interface BookAnalysisCharacterIdentifyPromptInput {
  characterSystemContext: string;
  notesText: string;
  existingCharacters: string[];
  limit: number;
}

export interface BookAnalysisCharacterGeneratePromptInput {
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  characterNames: string[];
  characterSystemContext: string;
  notesText: string;
}

export interface BookAnalysisCharacterProfilePromptInput {
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  character: {
    name: string;
    role: string;
    briefDescription?: string | null;
    importance?: string | null;
    occurringChapters?: string[];
  };
  characterSystemContext: string;
  notesText: string;
}

export const bookAnalysisCharacterIdentifyPrompt: PromptAsset<
  BookAnalysisCharacterIdentifyPromptInput,
  z.infer<typeof bookAnalysisCharacterIdentifyOutputSchema>
> = {
  id: "bookAnalysis.character.identify",
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
  outputSchema: bookAnalysisCharacterIdentifyOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文网文拆书角色识别助手。",
      "你的任务是用低成本方式识别值得做深度档案的角色候选，不要生成完整人物档案。",
      "只输出 JSON 对象，不要输出 Markdown 或解释。",
      "结构固定为：",
      '{ "candidates": [{ "name": "...", "roleHint": "...", "importance": "...", "briefDescription": "...", "occurringChapters": [] }] }',
      "硬规则：",
      "1. 只根据 notes 和人物系统上下文识别角色，不得补写原文外事实。",
      "2. name 使用最常见、最短、最稳定的称呼；不要把称号、同伴称呼或敬称并入姓名。",
      "3. roleHint 用一句话说明角色在作品里的功能，例如主角、核心配角、反派、导师、情感线角色。",
      "4. importance 只能是 high、medium、low 三档之一。",
      "5. briefDescription 控制在 60 字以内，说明为什么值得深挖。",
      "6. occurringChapters 只填能从上下文判断的章节或阶段标签，不能猜测。",
      `7. 最多返回 ${Math.max(1, Math.min(16, input.limit))} 个候选，按重要度排序。`,
    ].join("\n")),
    new HumanMessage([
      input.existingCharacters.length > 0 ? `已有角色：${input.existingCharacters.join("、")}` : "已有角色：暂无",
      "",
      "人物系统上下文：",
      input.characterSystemContext || "（暂无）",
      "",
      "可用 notes：",
      input.notesText,
    ].join("\n")),
  ],
};

export const bookAnalysisCharacterProfilePrompt: PromptAsset<
  BookAnalysisCharacterProfilePromptInput,
  z.infer<typeof bookAnalysisCharacterProfileOutputSchema>
> = {
  id: "bookAnalysis.character.profile",
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
  outputSchema: bookAnalysisCharacterProfileOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文网文拆书角色档案分析师。",
      "你的任务是基于拆书 notes、人物系统小节和指定角色候选，生成一个可供新手学习角色塑造的深度角色档案。",
      "只输出 JSON 对象，不要输出 Markdown 或解释。",
      "结构固定为：",
      '{ "character": { "name": "...", "role": "...", "profile": {}, "evidence": [], "arcs": [], "scenes": [] } }',
      "硬规则：",
      "1. 只分析指定角色，不要额外生成其他角色。",
      "2. 所有结论必须来自 notes 或人物系统上下文，不得补写原文外事实。",
      "3. profile 至少包含 name、role；可按所选维度包含 appearance、personality、outerGoal、innerNeed、growthTrajectory、speakingStyle 等字段。",
      "4. arcs 用于角色阶段变化；stageLabel 必须具体，chapterIndex 只有能判断章节时才填。",
      "5. scenes 用 sceneLabel 字符串描述高光场景或典型表现，不要创建正式场景实体。",
      "6. evidence.excerpt 应尽量贴近原文摘录或 notes 里的明确信息。",
    ].join("\n")),
    new HumanMessage([
      `生成深度：${input.generationDepth}`,
      `生成维度：${input.selectedDimensions.join("、") || "basic"}`,
      "",
      "指定角色候选：",
      `姓名：${input.character.name}`,
      `角色定位：${input.character.role}`,
      input.character.importance ? `重要度：${input.character.importance}` : "",
      input.character.briefDescription ? `候选说明：${input.character.briefDescription}` : "",
      input.character.occurringChapters?.length ? `已知出场位置：${input.character.occurringChapters.join("、")}` : "",
      "",
      "人物系统上下文：",
      input.characterSystemContext || "（暂无）",
      "",
      "可用 notes：",
      input.notesText,
    ].filter(Boolean).join("\n")),
  ],
};

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
