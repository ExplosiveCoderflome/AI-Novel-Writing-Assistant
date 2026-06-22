import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  AiChapterTaskSheetQualityAssessment,
  ChapterExecutionContractQualityCandidate,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import {
  aiChapterTaskSheetQualityAssessmentSchema,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import type { PromptAsset } from "../../../core/promptTypes";

export interface ChapterTaskSheetQualityPromptInput {
  candidate: ChapterExecutionContractQualityCandidate;
  mode: "full_book_autopilot" | "ai_copilot" | "manual";
}

function renderNullable(value: string | number | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(" | ") : "none";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value?.trim() || "none";
}

function renderCandidate(candidate: ChapterExecutionContractQualityCandidate): string {
  return [
    `novelId: ${candidate.novelId}`,
    `volumeId: ${renderNullable(candidate.volumeId)}`,
    `chapterId: ${candidate.chapterId}`,
    `chapterOrder: ${candidate.chapterOrder}`,
    `title: ${candidate.title}`,
    `summary: ${renderNullable(candidate.summary)}`,
    `purpose: ${renderNullable(candidate.purpose)}`,
    `exclusiveEvent: ${renderNullable(candidate.exclusiveEvent)}`,
    `endingState: ${renderNullable(candidate.endingState)}`,
    `nextChapterEntryState: ${renderNullable(candidate.nextChapterEntryState)}`,
    `conflictLevel: ${renderNullable(candidate.conflictLevel)}`,
    `revealLevel: ${renderNullable(candidate.revealLevel)}`,
    `targetWordCount: ${renderNullable(candidate.targetWordCount)}`,
    `mustAvoid: ${renderNullable(candidate.mustAvoid)}`,
    `payoffRefs: ${renderNullable(candidate.payoffRefs ?? [])}`,
    "",
    "taskSheet:",
    renderNullable(candidate.taskSheet),
    "",
    "sceneCards:",
    renderNullable(candidate.sceneCards),
  ].join("\n");
}

function createSystemPrompt(mode: ChapterTaskSheetQualityPromptInput["mode"]): string {
  const modeRule = mode === "full_book_autopilot"
    ? "当前是全书自动模式。你要判断系统能否自动修好并继续，不能把普通写作质量问题交给新手用户。"
    : "当前是 AI 副驾或手动模式。你要指出是否需要用户确认，避免把不可靠合同静默同步到正文执行链。";
  return [
    "你是网文章节执行合同质量评估器。",
    "你的任务是判断 purpose、章节边界、taskSheet 和 sceneCards 是否足以交给正文生成器执行。",
    modeRule,
    "只评估当前章节合同，不扩写正文，不改写任务单。",
    "可用合同必须满足：本章目标清晰、边界不越章、任务单可执行、场景卡覆盖整章推进和结尾钩子、禁止事项足以约束正文生成。",
    "必须额外检查：任务单是否把去 AI 味约束、世界观硬事实、人物状态、关系变化和伏笔债写进可执行项，而不是只写剧情概述。",
    "还要判断本章是否被塞入过多彼此争夺篇幅的必达义务；如果任务单显示当前章职责已经过载，loadRisk=overloaded，recommendedHandling=replan_window。",
    "如果 mustAvoid 或 sceneCards 缺少对模板化转场、设定说明书、解释型心理描写的约束，且正文生成容易因此跑偏，应给出 repairGuidance 补齐。",
    "必须用写手级标准检查 sceneCards：每个主要场景都要有 entryState -> exitState 的真实变化，并在 mustAdvance 中写出可见动作、对白压力、交易、失败后果、选择代价或新义务。",
    "如果场景只负责解释背景、角色闲聊、承接气氛、重复上一章或把设定讲清楚，应视为无效场景；target=scene_cards，repairGuidance 要要求重建该场景的状态变化。",
    "如果任务单语言很顺但没有场景代价、人物关系变化、信息差变化或章末压力，应视为语义不可直接执行，不要判 usable。",
    "mustPreserve 必须约束人物状态、信息边界、世界硬规则和伏笔操作；只写“保持连续性”“不要崩人设”不够具体，应要求补齐。",
    "forbiddenExpansion 必须针对本章风险写清禁止项：纯解释、说明书设定、同质化对白、段尾升华、无代价爽点、越章兑现等。",
    "如果问题仍可在本章合同内收口，recommendedHandling=repair_contract；只有合同已经足够稳时才用 use_as_is。",
    "如果存在问题，给出面向自动修复器的具体 repairGuidance。",
    "输出严格 JSON，不要 Markdown。",
  ].join("\n");
}

export const chapterTaskSheetQualityPrompt: PromptAsset<
  ChapterTaskSheetQualityPromptInput,
  AiChapterTaskSheetQualityAssessment
> = {
  id: "novel.volume.chapter_task_sheet_quality",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 4200,
  },
  outputSchema: aiChapterTaskSheetQualityAssessmentSchema,
  render: (input) => [
    new SystemMessage(createSystemPrompt(input.mode)),
    new HumanMessage([
      `mode: ${input.mode}`,
      "",
      "chapter execution contract candidate:",
      renderCandidate(input.candidate),
    ].join("\n")),
  ],
};
