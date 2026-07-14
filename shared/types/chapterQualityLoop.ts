import type { ChapterRuntimePackage } from "./chapterRuntime.js";
import type { QualityScore, ReviewIssue } from "./novel.js";
import type {
  ChapterExecutionMissingObligation,
  ChapterFailureClassification,
} from "./chapterRuntime.js";

export const CHAPTER_QUALITY_LOOP_ARTIFACT_TYPES = [
  "chapter_retention_contract",
  "continuity_state",
  "rolling_window_review",
  "prose_quality",
] as const;

export type ChapterQualityLoopArtifactType = typeof CHAPTER_QUALITY_LOOP_ARTIFACT_TYPES[number];
export type ChapterQualityLoopSignalStatus = "valid" | "risk" | "invalid" | "missing";
export type ChapterQualityLoopAction = "continue" | "patch_repair" | "replan" | "manual_gate";
export type ChapterQualityLoopBudgetAction = "patch_repair" | "rewrite_chapter" | "replan_window" | "hard_stop";
export type ChapterQualityLoopRiskClassification = "none" | "blocking" | "non_blocking_quality_debt";

export interface ChapterQualityLoopBudget {
  signature: string;
  attempt: number;
  maxAttempts: number;
  nextAction: ChapterQualityLoopBudgetAction;
  exhausted: boolean;
  reason: string;
}

export interface ChapterQualityLoopSignal {
  artifactType: ChapterQualityLoopArtifactType;
  status: ChapterQualityLoopSignalStatus;
  reason: string;
  issueCodes: string[];
}

export interface ChapterQualityLoopAssessment {
  chapterId: string;
  chapterOrder?: number | null;
  evaluatedAt: string;
  overallStatus: ChapterQualityLoopSignalStatus;
  recommendedAction: ChapterQualityLoopAction;
  patchFirstRequired: boolean;
  recheckRequired: boolean;
  pauseReason?: string | null;
  rootCauseCode?: ChapterFailureClassification["code"] | null;
  blockingObligations?: ChapterExecutionMissingObligation[];
  budget?: ChapterQualityLoopBudget | null;
  signals: ChapterQualityLoopSignal[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseRiskFlagsObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasBlockingObligations(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function classifyChapterQualityLoopRisk(
  qualityLoop: unknown,
): ChapterQualityLoopRiskClassification {
  if (!isRecord(qualityLoop)) {
    return "none";
  }
  const rootCauseCode = qualityLoop.rootCauseCode;
  const recommendedAction = qualityLoop.recommendedAction;
  if (
    rootCauseCode === "replan_required"
    || recommendedAction === "replan"
  ) {
    return "blocking";
  }
  if (qualityLoop.terminalAction === "defer_and_continue") {
    return "non_blocking_quality_debt";
  }
  if (recommendedAction === "manual_gate") {
    return "blocking";
  }
  if (hasBlockingObligations(qualityLoop.blockingObligations)) {
    return "blocking";
  }
  if (qualityLoop.overallStatus === "valid" && recommendedAction === "continue") {
    return "none";
  }
  if (qualityLoop.overallStatus === "risk" || qualityLoop.overallStatus === "invalid") {
    return "blocking";
  }
  return "none";
}

export function classifyChapterQualityLoopRiskFlags(
  riskFlags: string | null | undefined,
): ChapterQualityLoopRiskClassification {
  return classifyChapterQualityLoopRisk(parseRiskFlagsObject(riskFlags)?.qualityLoop);
}

export function hasContinuableChapterQualityLoopRiskFlags(riskFlags: string | null | undefined): boolean {
  const parsed = parseRiskFlagsObject(riskFlags);
  const qualityLoop = parsed?.qualityLoop;
  if (!isRecord(qualityLoop)) {
    return false;
  }
  const classification = classifyChapterQualityLoopRisk(qualityLoop);
  return classification === "non_blocking_quality_debt"
    || (
      classification === "none"
      && qualityLoop.overallStatus === "valid"
      && qualityLoop.recommendedAction === "continue"
    );
}

export interface ChapterQualityLoopAssessmentInput {
  chapterId: string;
  chapterOrder?: number | null;
  score: QualityScore;
  issues: ReviewIssue[];
  runtimePackage?: ChapterRuntimePackage | null;
  evaluatedAt?: string | Date;
  previousRepairHistory?: string | null;
}

const SEVERITY_RANK: Record<ReviewIssue["severity"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function normalizeEvaluatedAt(value: string | Date | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  return value instanceof Date ? value.toISOString() : value;
}

function issueCode(issue: ReviewIssue, index: number): string {
  const evidence = issue.evidence.trim().slice(0, 24);
  return `${issue.category}:${issue.severity}:${evidence || index + 1}`;
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function normalizeSignaturePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function buildLoopSignature(action: ChapterQualityLoopAction, signals: ChapterQualityLoopSignal[]): string {
  const failedSignals = signals.filter((signal) => signal.status !== "valid");
  const signatureSignals = failedSignals.length > 0 ? failedSignals : signals;
  const signatureSource = [
    action,
    ...signatureSignals.map((signal) => [
      signal.artifactType,
      signal.status,
      normalizeSignaturePart(signal.reason),
      signal.issueCodes.map(normalizeSignaturePart).sort().slice(0, 6).join("|"),
    ].join(":")),
  ].join("||");
  return `ql:${stableHash(signatureSource)}`;
}

function countPreviousLoopAttempts(previousRepairHistory: string | null | undefined, signature: string): number {
  if (!previousRepairHistory?.trim()) {
    return 0;
  }
  return previousRepairHistory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(`signature=${signature}`))
    .length;
}

function resolveBudgetAction(attempt: number): ChapterQualityLoopBudgetAction {
  if (attempt <= 1) {
    return "patch_repair";
  }
  if (attempt === 2) {
    return "rewrite_chapter";
  }
  if (attempt === 3) {
    return "replan_window";
  }
  return "hard_stop";
}

function buildLoopBudget(input: {
  recommendedAction: ChapterQualityLoopAction;
  signals: ChapterQualityLoopSignal[];
  previousRepairHistory?: string | null;
}): ChapterQualityLoopBudget | null {
  if (input.recommendedAction === "continue") {
    return null;
  }
  const signature = buildLoopSignature(input.recommendedAction, input.signals);
  const attempt = countPreviousLoopAttempts(input.previousRepairHistory, signature) + 1;
  const nextAction = resolveBudgetAction(attempt);
  return {
    signature,
    attempt,
    maxAttempts: 3,
    nextAction,
    exhausted: nextAction === "hard_stop",
    reason: nextAction === "hard_stop"
      ? "quality loop budget exhausted for the same failure signature"
      : "quality loop budget selected the next escalation step",
  };
}

function maxSeverity(issues: ReviewIssue[]): number {
  return issues.reduce((max, issue) => Math.max(max, SEVERITY_RANK[issue.severity] ?? 0), 0);
}

function scoreStatus(value: number, hardFloor: number, softFloor: number): ChapterQualityLoopSignalStatus {
  if (value < hardFloor) {
    return "invalid";
  }
  if (value < softFloor) {
    return "risk";
  }
  return "valid";
}

function worseStatus(
  left: ChapterQualityLoopSignalStatus,
  right: ChapterQualityLoopSignalStatus,
): ChapterQualityLoopSignalStatus {
  const rank: Record<ChapterQualityLoopSignalStatus, number> = {
    valid: 0,
    risk: 1,
    missing: 2,
    invalid: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

function buildRetentionSignal(input: ChapterQualityLoopAssessmentInput): ChapterQualityLoopSignal {
  const retentionIssues = input.issues.filter((issue) => (
    issue.category === "pacing"
    || issue.category === "coherence"
    || issue.category === "logic"
  ));
  const scoreDrivenStatus = worseStatus(
    worseStatus(
      scoreStatus(input.score.engagement, 65, 75),
      scoreStatus(input.score.repetition, 65, 75),
    ),
    scoreStatus(input.score.overall, 68, 78),
  );
  const severityDrivenStatus = maxSeverity(retentionIssues) >= SEVERITY_RANK.critical
    ? "invalid"
    : maxSeverity(retentionIssues) >= SEVERITY_RANK.high
      ? "risk"
      : "valid";
  const status = worseStatus(scoreDrivenStatus, severityDrivenStatus);
  return {
    artifactType: "chapter_retention_contract",
    status,
    reason: status === "valid"
      ? "章节留存信号满足继续推进要求。"
      : "章节留存信号不足，需要优先用局部补丁修复推进目标、读者期待或结尾拉力。",
    issueCodes: retentionIssues.map(issueCode).slice(0, 6),
  };
}

function buildContinuitySignal(input: ChapterQualityLoopAssessmentInput): ChapterQualityLoopSignal {
  const runtimeIssues = input.runtimePackage?.audit.openIssues ?? [];
  const continuityIssues = input.issues.filter((issue) => (
    issue.category === "coherence" || issue.category === "logic"
  ));
  const runtimeContinuityIssues = runtimeIssues.filter((issue) => (
    issue.auditType === "continuity" || issue.auditType === "character"
  ));
  const worstSeverity = Math.max(
    maxSeverity(continuityIssues),
    runtimeContinuityIssues.some((issue) => issue.severity === "critical")
      ? SEVERITY_RANK.critical
      : runtimeContinuityIssues.some((issue) => issue.severity === "high")
        ? SEVERITY_RANK.high
        : runtimeContinuityIssues.some((issue) => issue.severity === "medium")
          ? SEVERITY_RANK.medium
          : 0,
  );
  const status = worstSeverity >= SEVERITY_RANK.critical
    ? "invalid"
    : worstSeverity >= SEVERITY_RANK.high || input.score.coherence < 75
      ? "risk"
      : "valid";
  return {
    artifactType: "continuity_state",
    status,
    reason: status === "valid"
      ? "章节连续性状态可以继续使用。"
      : "章节连续性或人物状态存在风险，需要局部修复后重新评估。",
    issueCodes: [
      ...continuityIssues.map(issueCode),
      ...runtimeContinuityIssues.map((issue) => issue.code),
    ].slice(0, 8),
  };
}

function buildProseQualitySignal(input: ChapterQualityLoopAssessmentInput): ChapterQualityLoopSignal {
  const proseIssues = input.runtimePackage?.audit.openIssues.filter((issue) => (
    typeof issue.code === "string" && issue.code.startsWith("prose_")
  )) ?? [];
  if (proseIssues.length === 0) {
    return {
      artifactType: "prose_quality",
      status: "valid",
      reason: "正文自然度/退化检测未发现需要处理的问题。",
      issueCodes: [],
    };
  }

  const worstSeverity = proseIssues.reduce((max, issue) => {
    const rank = SEVERITY_RANK[issue.severity] ?? 0;
    return Math.max(max, rank);
  }, 0);
  const status: ChapterQualityLoopSignalStatus = worstSeverity >= SEVERITY_RANK.high
    ? "risk"
    : "valid";

  return {
    artifactType: "prose_quality",
    status,
    reason: status === "valid"
      ? "正文存在自然度或节奏提示，可作为后续局部优化参考。"
      : "正文存在明显 AI 句式、退化或工程词泄漏，需要优先做本章局部修复。",
    issueCodes: proseIssues.map((issue) => issue.code).slice(0, 8),
  };
}

function buildRollingWindowSignal(input: ChapterQualityLoopAssessmentInput): ChapterQualityLoopSignal {
  const replanRecommendation = input.runtimePackage?.replanRecommendation ?? null;
  if (replanRecommendation?.recommended && replanRecommendation.action === "stop_for_replan") {
    return {
      artifactType: "rolling_window_review",
      status: "invalid",
      reason: replanRecommendation.triggerReason || replanRecommendation.reason,
      issueCodes: replanRecommendation.blockingIssueIds.slice(0, 8),
    };
  }
  const reportIssues = input.runtimePackage?.audit.reports.flatMap((report) => report.issues) ?? [];
  const blockingReportIssues = reportIssues.filter((issue) => (
    issue.severity === "high" || issue.severity === "critical"
  ));
  const status = input.score.overall < 72 || blockingReportIssues.length > 0
    ? "risk"
    : "valid";
  return {
    artifactType: "rolling_window_review",
    status,
    reason: status === "valid"
      ? "近期章节复盘未发现必须打断后续批次的问题。"
      : "近期章节复盘存在质量风险，需要修复后再继续扩大范围。",
    issueCodes: blockingReportIssues.map((issue) => issue.code).slice(0, 8),
  };
}

function resolveAction(overallStatus: ChapterQualityLoopSignalStatus, signals: ChapterQualityLoopSignal[]): ChapterQualityLoopAction {
  const rollingWindow = signals.find((signal) => signal.artifactType === "rolling_window_review");
  if (rollingWindow?.status === "invalid") {
    return "replan";
  }
  if (overallStatus === "risk" || overallStatus === "invalid") {
    return "patch_repair";
  }
  return "continue";
}

export function buildChapterQualityLoopAssessment(
  input: ChapterQualityLoopAssessmentInput,
): ChapterQualityLoopAssessment {
  const signals = [
    buildRetentionSignal(input),
    buildContinuitySignal(input),
    buildProseQualitySignal(input),
    buildRollingWindowSignal(input),
  ];
  const overallStatus = signals.reduce<ChapterQualityLoopSignalStatus>(
    (status, signal) => worseStatus(status, signal.status),
    "valid",
  );
  const recommendedAction = resolveAction(overallStatus, signals);
  const budget = buildLoopBudget({
    recommendedAction,
    signals,
    previousRepairHistory: input.previousRepairHistory,
  });
  const effectiveAction = budget?.nextAction === "hard_stop" ? "manual_gate" : recommendedAction;
  return {
    chapterId: input.chapterId,
    chapterOrder: input.chapterOrder ?? input.runtimePackage?.context.chapter.order ?? null,
    evaluatedAt: normalizeEvaluatedAt(input.evaluatedAt),
    overallStatus,
    recommendedAction: effectiveAction,
    patchFirstRequired: budget?.nextAction === "patch_repair" || effectiveAction === "patch_repair",
    recheckRequired: effectiveAction !== "continue",
    pauseReason: effectiveAction === "manual_gate"
      ? "章节质量存在不可自动放行的问题，需要确认修复边界。"
      : null,
    rootCauseCode: input.runtimePackage?.failureClassification.code ?? null,
    blockingObligations: input.runtimePackage?.failureClassification.blockingObligations ?? [],
    budget,
    signals,
  };
}
