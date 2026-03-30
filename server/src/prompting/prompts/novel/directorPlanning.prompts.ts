import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
  type DirectorProjectContextInput,
} from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  buildDirectorBookContractContextBlocks,
  buildDirectorBlueprintContextBlocks,
  buildDirectorCandidateContextBlocks,
  formatProjectContext,
} from "./planningContextBlocks";
import {
  directorBookContractSchema,
  directorCandidateResponseSchema,
  directorPlanBlueprintSchema,
} from "../../../services/novel/director/novelDirectorSchemas";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface DirectorCandidatePromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
}

export interface DirectorBlueprintPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}

export interface DirectorBookContractPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan | null;
  targetChapterCount: number;
}

function formatPresetHints(presets: DirectorCorrectionPreset[]): string {
  if (presets.length === 0) {
    return "none";
  }
  return presets
    .map((preset) => {
      const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
      return meta ? `${meta.label}: ${meta.promptHint}` : preset;
    })
    .join("\n");
}

function formatCandidateDigest(candidate: DirectorCandidate, index: number): string {
  return [
    `option ${index + 1}: ${candidate.workingTitle}`,
    `logline: ${candidate.logline}`,
    `positioning: ${candidate.positioning}`,
    `selling point: ${candidate.sellingPoint}`,
    `core conflict: ${candidate.coreConflict}`,
    `protagonist path: ${candidate.protagonistPath}`,
    `hook strategy: ${candidate.hookStrategy}`,
    `progression loop: ${candidate.progressionLoop}`,
    `ending direction: ${candidate.endingDirection}`,
  ].join("\n");
}

function formatLatestBatchDigest(batches: DirectorCandidateBatch[]): string {
  const latestBatch = batches.at(-1);
  if (!latestBatch) {
    return "No previous batch.";
  }
  return [
    `${latestBatch.roundLabel}: ${latestBatch.refinementSummary?.trim() || "latest candidate round"}`,
    ...latestBatch.candidates.map((candidate, index) => formatCandidateDigest(candidate, index)),
  ].join("\n\n");
}

export const directorCandidatePrompt: PromptAsset<DirectorCandidatePromptInput, typeof directorCandidateResponseSchema._output> = {
  id: "novel.director.candidates",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorCandidates,
    requiredGroups: ["idea_seed"],
    preferredGroups: ["project_context", "preset_hints", "freeform_feedback"],
    dropOrder: ["latest_batch"],
  },
  outputSchema: directorCandidateResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇小说自动导演，服务对象是不懂写作流程的新手用户。",
      "当前任务只生成书级候选卡片，不展开大纲、不进入章节或场景细节。",
      "",
      `必须精准输出 ${input.count} 套候选，且只输出严格 JSON。`,
      "每个候选必须包含：workingTitle、logline、positioning、sellingPoint、coreConflict、protagonistPath、endingDirection、hookStrategy、progressionLoop、whyItFits、toneKeywords、targetChapterCount。",
      "workingTitle 必须是可读的暂定书名，适合封面展示，不要写成策划案口号、世界观概念短语或陈旧土味套壳名。",
      "候选之间必须有明显方向差异，不能只是换词或改名。",
      "每个候选都必须是“现在就能继续规划整本书”的方向，而不是模糊概念。",
    ].join("\n")),
    new HumanMessage([
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "项目上下文补充：",
      formatProjectContext(input.context) || "none",
      "",
      "上一轮候选：",
      formatLatestBatchDigest(input.batches),
      "",
      "预设修正：",
      formatPresetHints(input.presets),
      "",
      "自由修正意见：",
      input.feedback?.trim() || "none",
    ].join("\n")),
  ],
};

export const directorBlueprintPrompt: PromptAsset<DirectorBlueprintPromptInput, typeof directorPlanBlueprintSchema._output> = {
  id: "novel.director.blueprint",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorBlueprint,
    requiredGroups: ["book_contract", "idea_seed", "macro_constraints"],
    preferredGroups: ["project_context"],
  },
  outputSchema: directorPlanBlueprintSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇小说总规划导演，负责把确认后的书级方向展开成可执行蓝图。",
      "本阶段只生成 book -> arc -> chapter shell，不进入 scene 级细化。",
      "",
      "输出必须是严格 JSON，结构只能是 {\"bookPlan\":{...},\"arcs\":[...]}。",
      "每个 chapter 必须包含：title、objective、expectation、planRole、hookTarget、participants、reveals、riskNotes、mustAdvance、mustPreserve、scenes。",
      "其中 scenes 必须返回空数组，不允许在本阶段展开场景细节。",
      "planRole 只能是 setup、progress、pressure、turn、payoff、cooldown。",
      "",
      "规划要求：",
      "1. 整体结构要支持长篇连载，不要过早把后半本细化到场景。",
      "2. 每个 arc 都要说明自己的阶段功能，避免同质化。",
      "3. 每个 chapter shell 都要让新手用户知道这一章必须推进什么、必须保留什么、结尾要留下什么。",
      "4. mustAdvance 和 mustPreserve 必须具体、短促、可执行。",
      "5. 不得生成新的核心设定块、人物小传或世界观百科。",
    ].join("\n")),
    new HumanMessage([
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "目标章节总数：",
      String(input.targetChapterCount),
    ].join("\n")),
  ],
};

export const directorBookContractPrompt: PromptAsset<
  DirectorBookContractPromptInput,
  typeof directorBookContractSchema._output
> = {
  id: "novel.director.book_contract",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.directorBookContract,
    requiredGroups: ["book_contract", "idea_seed"],
    preferredGroups: ["project_context", "macro_constraints"],
  },
  outputSchema: directorBookContractSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇网文总导演，负责把已确认的书级方向收束成一本书的 Book Contract。",
      "服务对象是不懂写作流程的新手用户。",
      "只输出严格 JSON，不要输出解释文本。",
      "必须输出字段：readingPromise、protagonistFantasy、coreSellingPoint、chapter3Payoff、chapter10Payoff、chapter30Payoff、escalationLadder、relationshipMainline、absoluteRedLines。",
      "chapter3Payoff、chapter10Payoff、chapter30Payoff 必须体现连载兑现节奏，而不是泛泛总结。",
      "absoluteRedLines 必须是明确禁区，避免故事写歪。",
    ].join("\n")),
    new HumanMessage([
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "目标章节总数：",
      String(input.targetChapterCount),
    ].join("\n")),
  ],
};

export {
  buildDirectorBookContractContextBlocks,
  buildDirectorBlueprintContextBlocks,
  buildDirectorCandidateContextBlocks,
};
