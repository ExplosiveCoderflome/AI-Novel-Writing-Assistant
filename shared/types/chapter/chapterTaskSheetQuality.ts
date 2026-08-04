import { z } from "zod";
import { parseChapterScenePlan } from "./chapterLengthControl.js";

export const CHAPTER_TASK_SHEET_QUALITY_MODES = [
  "full_book_autopilot",
  "ai_copilot",
  "manual",
] as const;

export type ChapterTaskSheetQualityMode = typeof CHAPTER_TASK_SHEET_QUALITY_MODES[number];

export const CHAPTER_TASK_SHEET_QUALITY_ISSUE_SEVERITIES = [
  "low",
  "medium",
  "high",
] as const;

export type ChapterTaskSheetQualityIssueSeverity = typeof CHAPTER_TASK_SHEET_QUALITY_ISSUE_SEVERITIES[number];

export const CHAPTER_TASK_SHEET_QUALITY_STATUS = [
  "passed",
  "repairable",
  "needs_confirmation",
  "blocked",
] as const;

export type ChapterTaskSheetQualityStatus = typeof CHAPTER_TASK_SHEET_QUALITY_STATUS[number];

export interface ChapterExecutionContractQualityCandidate {
  novelId: string;
  volumeId?: string | null;
  chapterId: string;
  chapterOrder: number;
  title: string;
  summary?: string | null;
  purpose?: string | null;
  exclusiveEvent?: string | null;
  endingState?: string | null;
  nextChapterEntryState?: string | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  targetWordCount?: number | null;
  mustAvoid?: string | null;
  payoffRefs?: string[] | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
}

export interface ChapterTaskSheetQualityIssue {
  id: string;
  severity: ChapterTaskSheetQualityIssueSeverity;
  target: "purpose" | "boundary" | "task_sheet" | "scene_cards" | "semantic";
  summary: string;
  repairHint: string;
}

export interface ChapterTaskSheetQualityGateResult {
  status: ChapterTaskSheetQualityStatus;
  canEnterExecution: boolean;
  issues: ChapterTaskSheetQualityIssue[];
  summary: string;
  repairGuidance: string[];
  confidence: number;
}

function normalizeAssessmentVerdict(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["pass", "passed", "accepted", "accept", "ok", "okay", "valid", "use_as_is"].includes(normalized)) {
    return "usable";
  }
  if (["fixable", "needs_repair", "repair", "needs_fix", "repair_contract"].includes(normalized)) {
    return "repairable";
  }
  if (["blocked", "block", "replan", "unusable", "invalid", "reject", "replan_window"].includes(normalized)) {
    return "unusable";
  }
  return normalized;
}

function normalizeAssessmentIssueTarget(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["goal", "objective", "chapter_goal", "mission"].includes(normalized)) {
    return "purpose";
  }
  if (["scope", "cross_boundary", "boundary_crossing", "chapter_boundary", "range"].includes(normalized)) {
    return "boundary";
  }
  if (["task", "task_sheet", "tasksheet", "task_list", "chapter_task_sheet"].includes(normalized)) {
    return "task_sheet";
  }
  if (["scene", "scene_card", "scene_cards", "scenes", "scene_plan"].includes(normalized)) {
    return "scene_cards";
  }
  if ([
    "plot",
    "pacing",
    "pace",
    "load",
    "overload",
    "overloaded",
    "obligation",
    "obligations",
    "repetition",
    "active_action",
    "action",
    "character_action",
    "semantic",
  ].includes(normalized)) {
    return "semantic";
  }
  return normalized;
}

function normalizeAssessmentConfidence(value: unknown): unknown {
  const numeric = typeof value === "string" && value.trim()
    ? Number(value.trim())
    : typeof value === "number"
      ? value
      : NaN;
  if (!Number.isFinite(numeric)) {
    return value;
  }
  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }
  return numeric;
}

export const chapterTaskSheetQualityIssueSchema = z.object({
  id: z.string().trim().min(1),
  severity: z.enum(CHAPTER_TASK_SHEET_QUALITY_ISSUE_SEVERITIES),
  target: z.preprocess(
    normalizeAssessmentIssueTarget,
    z.enum(["purpose", "boundary", "task_sheet", "scene_cards", "semantic"]),
  ),
  summary: z.string().trim().min(1),
  repairHint: z.string().trim().min(1),
});

export const aiChapterTaskSheetQualityAssessmentSchema = z.object({
  verdict: z.preprocess(normalizeAssessmentVerdict, z.enum(["usable", "repairable", "unusable"])),
  safeToSync: z.boolean(),
  loadRisk: z.enum(["normal", "overloaded"]).default("normal"),
  recommendedHandling: z.enum(["use_as_is", "repair_contract", "replan_window"]).default("use_as_is"),
  summary: z.string().trim().min(1),
  issues: z.array(chapterTaskSheetQualityIssueSchema).max(8).default([]),
  repairGuidance: z.array(z.string().trim().min(1)).max(8).default([]),
  confidence: z.preprocess(normalizeAssessmentConfidence, z.number().min(0).max(1)),
});

export type AiChapterTaskSheetQualityAssessment = z.infer<typeof aiChapterTaskSheetQualityAssessmentSchema>;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function createQualityIssue(
  id: string,
  target: ChapterTaskSheetQualityIssue["target"],
  summary: string,
  repairHint: string,
  severity: ChapterTaskSheetQualityIssueSeverity = "high",
): ChapterTaskSheetQualityIssue {
  return {
    id,
    target,
    severity,
    summary,
    repairHint,
  };
}

export function assessChapterExecutionContractShape(
  candidate: ChapterExecutionContractQualityCandidate,
): ChapterTaskSheetQualityGateResult {
  const issues: ChapterTaskSheetQualityIssue[] = [];

  if (!hasText(candidate.purpose)) {
    issues.push(createQualityIssue(
      "missing_purpose",
      "purpose",
      "章节目标缺失。",
      "补充本章要推进的明确叙事目标，不能只复述章节摘要。",
    ));
  }

  const boundaryMissing = [
    ["exclusiveEvent", candidate.exclusiveEvent],
    ["endingState", candidate.endingState],
    ["nextChapterEntryState", candidate.nextChapterEntryState],
    ["mustAvoid", candidate.mustAvoid],
  ].filter(([, value]) => !hasText(value as string | null | undefined));
  if (
    boundaryMissing.length > 0
    || typeof candidate.conflictLevel !== "number"
    || typeof candidate.revealLevel !== "number"
    || typeof candidate.targetWordCount !== "number"
  ) {
    issues.push(createQualityIssue(
      "incomplete_boundary",
      "boundary",
      "章节边界合同不完整。",
      "补齐独占事件、结束态、下章入口态、冲突/揭露强度、目标字数和禁止事项。",
    ));
  }

  if (!hasText(candidate.taskSheet)) {
    issues.push(createQualityIssue(
      "missing_task_sheet",
      "task_sheet",
      "章节任务单缺失。",
      "生成可交给正文写作器执行的任务单，覆盖冲突对象、推进要求、情绪基调和收尾要求。",
    ));
  }

  const scenePlan = parseChapterScenePlan(candidate.sceneCards, {
    targetWordCount: candidate.targetWordCount ?? undefined,
  });
  if (!scenePlan) {
    issues.push(createQualityIssue(
      "invalid_scene_cards",
      "scene_cards",
      "场景拆解无法作为正文执行依据。",
      "重建 3-8 个场景卡，并为每个场景补齐目标、入场状态、离场状态、必须推进和字数预算。",
    ));
  }

  if (issues.length === 0) {
    return {
      status: "passed",
      canEnterExecution: true,
      issues: [],
      summary: "章节执行合同结构完整，可进入语义可用性评估。",
      repairGuidance: [],
      confidence: 1,
    };
  }

  return {
    status: "repairable",
    canEnterExecution: false,
    issues,
    summary: "章节执行合同缺少进入正文生成链路所需的基础字段。",
    repairGuidance: issues.map((issue) => issue.repairHint),
    confidence: 1,
  };
}

export function mapSemanticAssessmentToQualityGate(
  assessment: AiChapterTaskSheetQualityAssessment,
  mode: ChapterTaskSheetQualityMode,
): ChapterTaskSheetQualityGateResult {
  const issues = assessment.recommendedHandling === "replan_window"
    && !assessment.issues.some((issue) => issue.id === "contract_overloaded")
    ? assessment.issues.concat({
      id: "contract_overloaded",
      severity: "high",
      target: "semantic",
      summary: "当前章节职责过载，继续执行会提高遗漏关键义务的概率。",
      repairHint: "先重排附近章节职责，再进入正文生成。",
    })
    : assessment.issues;
  if (assessment.verdict === "usable" && assessment.safeToSync) {
    return {
      status: "passed",
      canEnterExecution: true,
      issues,
      summary: assessment.summary,
      repairGuidance: assessment.repairGuidance,
      confidence: assessment.confidence,
    };
  }

  const status: ChapterTaskSheetQualityStatus = mode === "full_book_autopilot"
    ? "repairable"
    : assessment.verdict === "unusable"
      ? "blocked"
      : "needs_confirmation";

  return {
    status,
    canEnterExecution: false,
    issues,
    summary: assessment.summary,
    repairGuidance: assessment.repairGuidance,
    confidence: assessment.confidence,
  };
}

export function formatChapterTaskSheetQualityFailure(result: ChapterTaskSheetQualityGateResult): string {
  const issueText = result.issues
    .slice(0, 4)
    .map((issue) => `${issue.summary}${issue.repairHint ? ` 修复建议：${issue.repairHint}` : ""}`)
    .join(" ");
  const guidanceText = result.repairGuidance.length > 0
    ? ` 需要调整：${result.repairGuidance.slice(0, 4).join("；")}`
    : "";
  return `${result.summary}${issueText ? ` ${issueText}` : ""}${guidanceText}`;
}
