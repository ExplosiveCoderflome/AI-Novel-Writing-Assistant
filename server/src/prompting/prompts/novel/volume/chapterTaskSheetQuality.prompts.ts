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
    "你的任务是判断 purpose、章节边界、taskSheet、readerExperience 和 sceneCards 是否足以交给正文生成器执行。",
    modeRule,
    "只评估当前章节合同，不扩写正文，不改写任务单。",
    "可用合同必须满足：本章目标清晰、边界不越章、任务单可执行、读者体验合同明确本章问题、可见回报、主角欲望、主要阻力、关键转折、净变化和钩子责任，场景卡覆盖整章推进并为每场提供阻力、转折、情绪位移和读者价值。",
    "还要判断本章是否被塞入过多彼此争夺篇幅的必达义务；如果任务单显示当前章职责已经过载，loadRisk=overloaded，recommendedHandling=replan_window。",
    "如果问题仍可在本章合同内收口，recommendedHandling=repair_contract；只有合同已经足够稳时才用 use_as_is。",
    "如果存在问题，给出面向自动修复器的具体 repairGuidance。",
    "",
    "输出严格 JSON，不要 Markdown、注释、解释或额外字段。",
    "顶层只能输出 verdict、safeToSync、loadRisk、recommendedHandling、summary、issues、repairGuidance、confidence。",
    "verdict 只能使用 usable、repairable、unusable。",
    "loadRisk 只能使用 normal、overloaded。",
    "recommendedHandling 只能使用 use_as_is、repair_contract、replan_window。",
    "issues 每项只能包含 id、severity、target、summary、repairHint。",
    "issues.severity 只能使用 low、medium、high。",
    "issues.target 只能使用 purpose、boundary、task_sheet、scene_cards、semantic；节奏、重复、职责过载、主动性不足、义务冲突都归入 semantic。",
    "confidence 必须是 0 到 1 之间的小数，不要输出百分制数字。",
    "不得输出 pass、accepted、ok、blocked、pacing、plot、load 等自定义枚举值。",
    "",
    "JSON 形状示例：",
    "{",
    "  \"verdict\": \"repairable\",",
    "  \"safeToSync\": false,",
    "  \"loadRisk\": \"normal\",",
    "  \"recommendedHandling\": \"repair_contract\",",
    "  \"summary\": \"章节合同目标清楚，但场景卡缺少结尾钩子。\",",
    "  \"issues\": [",
    "    {",
    "      \"id\": \"scene_cards_missing_hook\",",
    "      \"severity\": \"medium\",",
    "      \"target\": \"scene_cards\",",
    "      \"summary\": \"场景卡没有覆盖章末阅读牵引。\",",
    "      \"repairHint\": \"补充最后一个场景的离场状态和下一章入口压力。\"",
    "    }",
    "  ],",
    "  \"repairGuidance\": [\"补齐最后一个场景的钩子和离场状态。\"],",
    "  \"confidence\": 0.82",
    "}",
  ].join("\n");
}

export const chapterTaskSheetQualityPrompt: PromptAsset<
  ChapterTaskSheetQualityPromptInput,
  AiChapterTaskSheetQualityAssessment
> = {
  id: "novel.volume.chapter_task_sheet_quality",
  version: "v2",
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
