import { createHash } from "node:crypto";
import type {
  ChapterExecutionMissingObligation,
  ChapterRuntimePackage,
  GenerationContextPackage,
  RuntimeAuditIssue,
  RuntimeAuditReport,
} from "@ai-novel/shared/types/chapterRuntime";
import type { TimelineCheckResult, TimelineContextForChapter, TimelineIssue } from "@ai-novel/shared/types/timeline";
import type { ChapterAcceptanceAssessmentOutput } from "../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { withChapterRepairContext } from "../../../prompting/prompts/novel/chapterLayeredContext";
import { buildSyntheticPayoffIssues } from "../../payoff/payoffLedgerShared";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import type { StyleReviewResult } from "./PostGenerationStyleReviewRunner";
import type { ChapterTimelineGateResult } from "./ChapterTimelineFinalizationService";

export type TimelineGateResult = ChapterTimelineGateResult;

export interface ChapterRuntimePlannerPort {
  buildReplanRecommendation?: (input: {
    auditReports: RuntimeAuditReport[];
    ledgerSummary: GenerationContextPackage["ledgerSummary"] | null;
    contextPackage: GenerationContextPackage;
    targetChapterOrder: number;
    blockingLedgerKeys: string[];
    forceRecommended: boolean;
    reason: string | null;
    triggerType?: string;
  }) => ChapterRuntimePackage["replanRecommendation"];
  shouldTriggerReplanFromAudit: (
    auditReports: RuntimeAuditReport[],
    ledgerSummary: GenerationContextPackage["ledgerSummary"] | null,
  ) => boolean;
}

export interface OpenConflictRuntimeRow {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceSnapshotId: string | null;
  sourceIssueId: string | null;
  sourceType: GenerationContextPackage["openConflicts"][number]["sourceType"];
  conflictType: GenerationContextPackage["openConflicts"][number]["conflictType"];
  conflictKey: string;
  title: string;
  summary: string;
  severity: GenerationContextPackage["openConflicts"][number]["severity"];
  status: GenerationContextPackage["openConflicts"][number]["status"];
  evidenceJson: string | null;
  affectedCharacterIdsJson: string | null;
  resolutionHint: string | null;
  lastSeenChapterOrder: number | null;
  chapter?: { order: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildRuntimePackageInput {
  novelId: string;
  chapterId: string;
  request: ChapterRuntimeRequestInput;
  contextPackage: GenerationContextPackage;
  finalContent: string;
  lengthControl?: ChapterRuntimePackage["lengthControl"];
  auditResult: {
    score: ChapterRuntimePackage["audit"]["score"];
    auditReports: RuntimeAuditReport[];
  };
  activeOpenConflicts: OpenConflictRuntimeRow[];
  styleReview: StyleReviewResult;
  acceptance: ChapterAcceptanceAssessmentOutput;
  timelineCheck: TimelineCheckResult;
  runId: string | null;
  plannerService: ChapterRuntimePlannerPort;
}

export function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

export function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

export function rememberCacheValue<T>(cache: Map<string, Promise<T> | T>, key: string, value: Promise<T> | T): void {
  const maxEntries = 80;
  if (!cache.has(key) && cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

export function buildObligationCoverage(input: {
  missingObligations: ChapterExecutionMissingObligation[];
  hasBlockingIssues: boolean;
}): ChapterRuntimePackage["obligationCoverage"] {
  if (input.missingObligations.length === 0) {
    return {
      status: "satisfied",
      missing: [],
      summary: "章节义务已满足。",
    };
  }
  return {
    status: input.hasBlockingIssues ? "unmet" : "partial",
    missing: input.missingObligations,
    summary: input.hasBlockingIssues
      ? `仍有 ${input.missingObligations.length} 项章节义务未满足。`
      : `仍有 ${input.missingObligations.length} 项章节义务需要后续回收。`,
  };
}

export function buildFailureClassification(input: {
  acceptance: ChapterAcceptanceAssessmentOutput;
  hasBlockingIssues: boolean;
  replanRecommended: boolean;
  missingObligations: ChapterExecutionMissingObligation[];
}): ChapterRuntimePackage["failureClassification"] {
  if (input.replanRecommended || input.acceptance.repairability === "plan_misalignment") {
    return {
      code: "replan_required",
      summary: "当前章节目标与计划窗口已失配，需要先调整附近章节职责。",
      decisionReason: input.acceptance.decisionReason,
      blockingObligations: input.missingObligations,
    };
  }
  if (input.missingObligations.length > 0) {
    return {
      code: "draft_obligation_unmet",
      summary: "正文已生成，但仍有本章必达义务没有兑现。",
      decisionReason: input.acceptance.decisionReason,
      blockingObligations: input.missingObligations,
    };
  }
  if (input.hasBlockingIssues) {
    return {
      code: "draft_repair_exhausted",
      summary: "正文已生成，但仍有阻塞性问题需要继续修复。",
      decisionReason: input.acceptance.decisionReason,
      blockingObligations: [],
    };
  }
  return {
    code: "none",
    summary: "正文已生成，可继续推进。",
    decisionReason: input.acceptance.decisionReason,
    blockingObligations: [],
  };
}

export function timelineIssueSeverityToAuditSeverity(severity: TimelineIssue["severity"]): RuntimeAuditIssue["severity"] {
  if (severity === "blocking") return "critical";
  if (severity === "error") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

export function timelineIssuesToRuntimeIssues(input: {
  novelId: string;
  chapterId: string;
  issues: TimelineIssue[];
}): RuntimeAuditIssue[] {
  const now = new Date().toISOString();
  return input.issues.map((issue, index) => ({
    id: `timeline:${input.chapterId}:${issue.type}:${index}`,
    reportId: `timeline:${input.novelId}:${input.chapterId}`,
    auditType: "continuity",
    severity: timelineIssueSeverityToAuditSeverity(issue.severity),
    code: `timeline_${issue.type}`,
    description: issue.message,
    evidence: issue.evidence ?? issue.message,
    fixSuggestion: issue.suggestedFix ?? issue.message,
    status: "open",
    createdAt: now,
    updatedAt: now,
    ragFacts: [],
  }));
}

export function normalizeTimelineGateResult(
  value: TimelineGateResult | TimelineCheckResult,
  timelineContext: TimelineContextForChapter | null | undefined,
): TimelineGateResult {
  if ("result" in value) {
    const extractedEvents = value.extractedEvents ?? [];
    const extractedHooks = value.extractedHooks ?? [];
    return {
      ...value,
      extractedEvents,
      extractedHooks,
      timeAnchor: value.timeAnchor ?? null,
      addressedHookIds: value.addressedHookIds ?? [],
      resolvedHookIds: value.resolvedHookIds ?? [],
      extractorSucceeded: value.extractorSucceeded ?? (extractedEvents.length > 0 || extractedHooks.length > 0),
      extractorError: value.extractorError ?? null,
      timelineContext: value.timelineContext ?? timelineContext ?? null,
    };
  }
  return {
    result: value,
    extractedEvents: [],
    extractedHooks: [],
    timeAnchor: null,
    addressedHookIds: [],
    resolvedHookIds: [],
    extractorSucceeded: false,
    extractorError: null,
    timelineContext: timelineContext ?? null,
  };
}

export function shouldEscalateToFullAudit(input: {
  content: string;
  contextPackage: GenerationContextPackage;
  lightAssessment: { shouldRunFullAudit: boolean };
}): boolean {
  void input.content;
  void input.contextPackage;
  return input.lightAssessment.shouldRunFullAudit;
}

function normalizeBoundaryProbe(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function boundaryProbeCandidates(value: string, splitInstructionPrefix: boolean): string[] {
  const trimmed = value.trim();
  const afterColon = splitInstructionPrefix && trimmed.includes("：") ? trimmed.split("：").slice(1).join("：").trim() : "";
  return [trimmed, afterColon]
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

export function buildBoundaryLeakageIssues(input: {
  novelId: string;
  chapterId: string;
  content: string;
  contextPackage: GenerationContextPackage;
}): GenerationContextPackage["openAuditIssues"] {
  const boundary = input.contextPackage.chapterWriteContext?.chapterBoundary;
  if (!boundary) {
    return [];
  }
  const contentProbe = normalizeBoundaryProbe(input.content);
  if (!contentProbe) {
    return [];
  }
  const candidates = [
    ...boundary.protectedReveals.map((item) => ({ type: "protected_reveal", text: item, severity: "critical" as const })),
    ...boundary.doNotCross.map((item) => ({ type: "do_not_cross", text: item, severity: "high" as const })),
  ];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  return candidates.flatMap((candidate) => {
    const leaked = boundaryProbeCandidates(candidate.text, candidate.type === "protected_reveal")
      .find((probe) => contentProbe.includes(normalizeBoundaryProbe(probe)));
    if (!leaked || seen.has(`${candidate.type}:${leaked}`)) {
      return [];
    }
    seen.add(`${candidate.type}:${leaked}`);
    return [{
      id: `chapter-boundary:${input.chapterId}:${candidate.type}:${seen.size}`,
      reportId: `chapter-boundary:${input.novelId}:${input.chapterId}`,
      auditType: "plot" as const,
      severity: candidate.severity,
      code: candidate.type,
      description: candidate.type === "protected_reveal"
        ? "章节正文疑似提前泄露受保护信息。"
        : "章节正文疑似越过本章边界。重写或修复时必须回到当前章节合同内。",
      evidence: leaked,
      fixSuggestion: candidate.type === "protected_reveal"
        ? "删除或改写提前揭露的信息，只保留铺垫、压力或预兆。"
        : "删除越章内容，停在本章 endingState 或当前场景 exitState。",
      status: "open" as const,
      createdAt: now,
      updatedAt: now,
    }];
  });
}

export function mapOpenConflictForRuntime(
  conflict: OpenConflictRuntimeRow,
): GenerationContextPackage["openConflicts"][number] {
  return {
    id: conflict.id,
    novelId: conflict.novelId,
    chapterId: conflict.chapterId ?? null,
    sourceSnapshotId: conflict.sourceSnapshotId ?? null,
    sourceIssueId: conflict.sourceIssueId ?? null,
    sourceType: conflict.sourceType,
    conflictType: conflict.conflictType,
    conflictKey: conflict.conflictKey,
    title: conflict.title,
    summary: conflict.summary,
    severity: conflict.severity,
    status: conflict.status,
    evidence: parseStringArray(conflict.evidenceJson),
    affectedCharacterIds: parseStringArray(conflict.affectedCharacterIdsJson),
    resolutionHint: conflict.resolutionHint ?? null,
    lastSeenChapterOrder: conflict.lastSeenChapterOrder ?? conflict.chapter?.order ?? null,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

export function buildRuntimePackage(input: BuildRuntimePackageInput): ChapterRuntimePackage {
  const ledgerPendingItems = input.contextPackage.ledgerPendingItems ?? [];
  const ledgerOverdueItems = input.contextPackage.ledgerOverdueItems ?? [];
  const syntheticPayoffIssues = buildSyntheticPayoffIssues(
    [
      ...ledgerPendingItems,
      ...ledgerOverdueItems.filter((item) => !ledgerPendingItems.some((pending) => pending.ledgerKey === item.ledgerKey)),
    ],
    input.contextPackage.chapter.order,
  );
  const boundaryLeakageIssues = buildBoundaryLeakageIssues({
    novelId: input.novelId,
    chapterId: input.chapterId,
    content: input.finalContent,
    contextPackage: input.contextPackage,
  });
  const openIssues = input.auditResult.auditReports
    .flatMap((report) => report.issues)
    .filter((issue) => issue.status === "open")
    .map((issue) => ({
      id: issue.id,
      reportId: issue.reportId,
      auditType: issue.auditType,
      severity: issue.severity,
      code: issue.code,
      description: issue.description,
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
      status: issue.status,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }))
    .concat(syntheticPayoffIssues.map((issue) => ({
      id: `payoff-ledger:${issue.ledgerKey}:${issue.code}`,
      reportId: `payoff-ledger:${input.novelId}:${input.chapterId}`,
      auditType: "plot" as const,
      severity: issue.severity,
      code: issue.code,
      description: issue.description,
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
      status: "open" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })))
    .concat(boundaryLeakageIssues);
  openIssues.push(...timelineIssuesToRuntimeIssues({
    novelId: input.novelId,
    chapterId: input.chapterId,
    issues: input.timelineCheck.issues,
  }));

  const blockingIssueIds = openIssues
    .filter((issue) => issue.severity === "high" || issue.severity === "critical")
    .map((issue) => issue.id);
  const blockingLedgerKeys = Array.from(new Set(
    syntheticPayoffIssues
      .filter((issue) => issue.severity === "high" || issue.severity === "critical")
      .map((issue) => issue.ledgerKey),
  ));
  const hasBlockingIssues = blockingIssueIds.length > 0 || input.acceptance.status === "needs_manual_review";
  const repairContextPackage = withChapterRepairContext(
    input.contextPackage,
    openIssues.map((issue) => ({
      severity: issue.severity,
      category: issue.auditType === "continuity"
        ? "coherence"
        : issue.auditType === "character"
          ? "logic"
          : issue.auditType === "plot"
            ? "pacing"
            : "coherence",
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
    })),
  );

  const replanRecommendation = input.plannerService.buildReplanRecommendation
    ? input.plannerService.buildReplanRecommendation({
      auditReports: input.auditResult.auditReports,
      ledgerSummary: input.contextPackage.ledgerSummary ?? null,
      contextPackage: input.contextPackage,
      targetChapterOrder: input.contextPackage.chapter.order,
      blockingLedgerKeys,
      forceRecommended: input.acceptance.repairability === "plan_misalignment",
      reason: input.acceptance.decisionReason,
      triggerType: input.acceptance.repairability === "plan_misalignment"
        ? "acceptance_plan_misalignment"
        : undefined,
    })
    : {
      recommended: hasBlockingIssues || input.plannerService.shouldTriggerReplanFromAudit(
        input.auditResult.auditReports,
        input.contextPackage.ledgerSummary ?? null,
      ),
      action: hasBlockingIssues ? "local_patch_plan" as const : "continue_with_warning" as const,
      reason: input.contextPackage.ledgerSummary?.overdueCount
        ? "Overdue payoff ledger items require replan or explicit payoff handling."
        : hasBlockingIssues
          ? "Blocking audit issues remain open after generation."
          : "No blocking audit issues were detected.",
      blockingIssueIds,
      blockingLedgerKeys,
      affectedChapterOrders: [],
    };

  const obligationCoverage = buildObligationCoverage({
    missingObligations: input.acceptance.missingObligations,
    hasBlockingIssues,
  });
  const failureClassification = buildFailureClassification({
    acceptance: input.acceptance,
    hasBlockingIssues,
    replanRecommended: replanRecommendation.action === "stop_for_replan",
    missingObligations: input.acceptance.missingObligations,
  });

  return {
    novelId: input.novelId,
    chapterId: input.chapterId,
    context: {
      ...repairContextPackage,
      openConflicts: input.activeOpenConflicts.map((item) => mapOpenConflictForRuntime(item)),
    },
    draft: {
      content: input.finalContent,
      wordCount: countChapterCharacters(input.finalContent),
      generationState: input.styleReview.autoRewritten ? "repaired" : "drafted",
    },
    audit: {
      score: input.auditResult.score,
      reports: input.auditResult.auditReports.map((report) => ({
        id: report.id,
        novelId: report.novelId,
        chapterId: report.chapterId,
        auditType: report.auditType,
        overallScore: report.overallScore ?? null,
        summary: report.summary ?? null,
        legacyScoreJson: report.legacyScoreJson ?? null,
        issues: report.issues.map((issue) => ({
          id: issue.id,
          reportId: issue.reportId,
          auditType: issue.auditType,
          severity: issue.severity,
          code: issue.code,
          description: issue.description,
          evidence: issue.evidence,
          fixSuggestion: issue.fixSuggestion,
          status: issue.status,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        })),
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      })),
      openIssues,
      hasBlockingIssues,
    },
    obligationContract: input.contextPackage.chapterWriteContext?.obligationContract ?? {
      mustHitNow: [],
      mustPreserve: [],
      requiredPayoffTouches: [],
      requiredCharacterAppearances: [],
      requiredGoalChanges: [],
      canDefer: [],
      forbiddenCrossings: [],
    },
    obligationCoverage,
    failureClassification,
    replanRecommendation,
    lengthControl: input.lengthControl,
    styleReview: {
      report: input.styleReview.report,
      autoRewritten: input.styleReview.autoRewritten,
      originalContent: input.styleReview.originalContent,
    },
    timelineCheck: input.timelineCheck,
    meta: {
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
      runId: input.runId ?? undefined,
      generatedAt: new Date().toISOString(),
      nextAction: input.contextPackage.nextAction,
      stateGoalSummary: input.contextPackage.chapterStateGoal?.summary,
      pendingReviewProposalCount: input.contextPackage.pendingReviewProposalCount,
      acceptanceStatus: input.acceptance.status,
      continuePolicy: input.acceptance.continuePolicy,
      riskTags: input.acceptance.riskTags,
      repairDirectives: input.acceptance.repairDirectives,
      assetSyncRecommendation: input.acceptance.assetSyncRecommendation,
    },
  };
}
