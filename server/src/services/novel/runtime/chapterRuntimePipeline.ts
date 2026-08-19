import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { ContentProvenance } from "@ai-novel/shared/types/canonicalState";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { detectForbiddenStyleEntities } from "../../styleEngine/styleGenerationSanitizer";
import {
  assertChapterContentNotEmpty,
  isChapterEmptyContentError,
  type ChapterEmptyContentError,
} from "./chapterEmptyContentError";
import { runChapterRepairText } from "./repair/chapterRepairRuntime";
import { AegisEvolutionService } from "../../../services/aegis/AegisEvolutionService";

export interface PipelineRuntimeHooks {
  onCheckCancelled?: () => Promise<void>;
  onStageChange?: (stage: "generating_chapters" | "reviewing" | "repairing") => Promise<void>;
  onEmptyContent?: (event: PipelineEmptyContentEvent) => Promise<void>;
}

export interface PipelineEmptyContentEvent {
  attempt: number;
  willRetry: boolean;
  error: ChapterEmptyContentError;
  contentLength: number;
  rawContentLength: number;
}

export interface PipelineRuntimeInput extends ChapterRuntimeRequestInput {
  maxRetries?: number;
  autoReview?: boolean;
  autoRepair?: boolean;
  auditMode?: "light" | "full" | "repair_only";
  qualityThreshold?: number;
  repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
}

/**
 * 质量债务根因归因数据，在章节以 defer_and_continue 结束时收集。
 * 用于 analyze_quality_debt_attribution 工具聚合根因占比。
 */
export interface QualityDebtAttribution {
  /** 首次验收失败的 issue code 列表（来自 runtimePackage.audit.openIssues） */
  firstFailureIssueCodes: string[];
  /** 二次验收失败的 issue code 列表（修复后再次失败时才有值） */
  secondFailureIssueCodes: string[];
  /** 首次失败的 failureClassification.code（判定根因 D） */
  firstFailureClassificationCode: string | null;
  /** patch 锚点失配，升级到 heavy_repair（判定根因 B） */
  patchAnchorFailed: boolean;
  /** 首次与二次的 openIssue codes 完全一致（判定根因 A：义务未传达给修复器） */
  sameObligationRepeated: boolean;
  /** firstFailureClassificationCode === "draft_obligation_unmet" → 义务不可达（判定根因 D） */
  planMisaligned: boolean;
  /** 首次为 length 类 issue、二次为 content 类（判定根因 E：签名漂移） */
  lengthVsContentDrift: boolean;
  /** 首次失败缺失的义务种类（来自 obligationCoverage.missing[].kind） */
  missingObligationKinds: string[];
  /** 已消耗的 Director 预算操作（由外层 Director 写入） */
  budgetActionsConsumed?: Array<"patch_repair" | "chapter_rewrite" | "window_replan">;
  /** 章节质量债务导致的提案降级路由，用于后续复核入口聚合。 */
  degradedProposalRouting?: {
    contentProvenance: "debt";
    routedToPendingReview: true;
    proposalTypes: Array<"character_state_update" | "character_resource_update">;
    fields: Array<"currentState" | "currentGoal" | "characterResource">;
  };
}

export interface PipelineRuntimeResult {
  reviewExecuted: boolean;
  pass: boolean;
  score: QualityScore;
  issues: ReviewIssue[];
  runtimePackage: ChapterRuntimePackage | null;
  retryCountUsed: number;
  recoverableRepairFailure?: PipelineRecoverableRepairFailure | null;
  /** 仅在章节最终未通过时填充，供 defer_and_continue 路径记录根因 */
  qualityDebtAttribution?: QualityDebtAttribution | null;
}

export interface FinalizedRuntimeResult {
  finalContent: string;
  runtimePackage: ChapterRuntimePackage;
}

export interface PipelineRecoverableRepairFailure {
  chapterId: string;
  message: string;
  repairMode: NonNullable<PipelineRuntimeInput["repairMode"]>;
  failureTypes: string[];
  occurredAt: string;
}

export interface AssembledRuntimeChapter {
  novel: { id: string; title: string };
  chapter: { id: string; title: string; order: number; content: string | null; expectation: string | null };
  contextPackage: GenerationContextPackage;
}

interface RunPipelineChapterDeps {
  validateRequest: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
  ensureNovelCharacters: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  assemble: (novelId: string, chapterId: string, request: ChapterRuntimeRequestInput) => Promise<AssembledRuntimeChapter>;
  generateDraftFromWriter: (input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    assembled: AssembledRuntimeChapter;
  }) => Promise<{
    content: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    artifactsAlreadySynced?: boolean;
  }>;
  saveDraftAndArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
    options?: { scheduleBackgroundSync: boolean; artifactSyncMode?: PipelineRuntimeInput["artifactSyncMode"]; syncArtifacts?: boolean },
  ) => Promise<void>;
  syncFinalChapterArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    options?: {
      artifactSyncMode?: PipelineRuntimeInput["artifactSyncMode"];
      contentProvenance?: ContentProvenance;
    },
  ) => Promise<void>;
  finalizeChapterContent: (input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    runId: string | null;
    startMs: number | null;
  }) => Promise<FinalizedRuntimeResult>;
  finalizeChapterTimeline?: (input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
    mode: "stable" | "degraded";
    reason: string;
    qualityDebt?: boolean;
  }) => Promise<void>;
  markChapterGenerationState: (
    chapterId: string,
    generationState: "reviewed" | "approved",
  ) => Promise<void>;
  markChapterNeedsRepair: (chapterId: string) => Promise<void>;
}

const QUALITY_THRESHOLD = { coherence: 80, repetition: 75, engagement: 75 };
const EMPTY_CONTENT_GENERATION_RETRY_LIMIT = 1;
const NON_PATCHABLE_REVIEW_ISSUE_CODES = new Set(["acceptance_gate_unavailable"]);

const AUDIT_CATEGORY_MAP: Record<"continuity" | "character" | "plot" | "mode_fit", ReviewIssue["category"]> = {
  continuity: "coherence",
  character: "logic",
  plot: "pacing",
  mode_fit: "coherence",
};

export async function runPipelineChapterWithRuntime(
  deps: RunPipelineChapterDeps,
  novelId: string,
  chapterId: string,
  options: PipelineRuntimeInput = {},
  hooks: PipelineRuntimeHooks = {},
): Promise<PipelineRuntimeResult> {
  const {
    maxRetries = 1,
    autoReview = true,
    autoRepair = true,
    qualityThreshold = 75,
    repairMode = "light_repair",
    artifactSyncMode = "adaptive",
    ...requestInput
  } = options;
  const effectiveMaxRetries = Math.max(0, Math.min(maxRetries, 1));
  const request = deps.validateRequest(requestInput);
  await deps.ensureNovelCharacters(novelId, "run chapter pipeline");

  const assembled = await deps.assemble(novelId, chapterId, request);
  let content = assembled.chapter.content?.trim() ? assembled.chapter.content : "";
  let retryCountUsed = 0;
  let latestResult: FinalizedRuntimeResult | null = null;
  let latestIssues: ReviewIssue[] = [];
  let pass = false;
  let latestLengthControl: ChapterRuntimePackage["lengthControl"] | undefined;
  let recoverableRepairFailure: PipelineRecoverableRepairFailure | null = null;

  // 归因追踪变量
  let firstFailureIssueCodes: string[] = [];
  let firstFailureClassificationCode: string | null = null;
  let firstMissingObligationKinds: string[] = [];
  let repairEscalatedFromPatch = false;
  let secondFailureIssueCodes: string[] = [];

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt += 1) {
    await hooks.onCheckCancelled?.();
    if (!content.trim()) {
      const generatedDraft = await generateNonEmptyDraftFromWriter({
        deps,
        novelId,
        chapterId,
        request,
        assembled,
        hooks,
      });
      content = generatedDraft.content;
      latestLengthControl = generatedDraft.lengthControl;
      if (!generatedDraft.artifactsAlreadySynced) {
        await deps.saveDraftAndArtifacts(novelId, chapterId, content, "drafted", {
          scheduleBackgroundSync: false,
          artifactSyncMode,
          syncArtifacts: false,
        });
      }
    }

    if (!autoReview) {
      await syncFinalRetainedChapterArtifacts(deps, novelId, chapterId, content, artifactSyncMode, "confirmed");
      if (deps.finalizeChapterTimeline) {
        await deps.finalizeChapterTimeline({
          novelId,
          chapterId,
          request,
          contextPackage: assembled.contextPackage,
          content,
          mode: "stable",
          reason: "auto_review_disabled_final_content",
        });
      }
      await deps.markChapterGenerationState(chapterId, "approved");
      return {
        reviewExecuted: false,
        pass: true,
        score: {
          coherence: 100,
          pacing: 100,
          repetition: 100,
          engagement: 100,
          voice: 100,
          overall: 100,
        },
        issues: [],
        runtimePackage: null,
        retryCountUsed,
        recoverableRepairFailure: null,
      };
    }

    await hooks.onStageChange?.("reviewing");
    latestResult = await deps.finalizeChapterContent({
      novelId,
      chapterId,
      request,
      contextPackage: assembled.contextPackage,
      content,
      lengthControl: latestLengthControl,
      runId: null,
      startMs: null,
    });
    const styleLeakageIssues = detectStyleReferenceLeakageIssues(content, latestResult.runtimePackage);
    latestIssues = [
      ...toReviewIssues(latestResult.runtimePackage),
      ...toAcceptanceDirectiveIssues(latestResult.runtimePackage),
      ...styleLeakageIssues,
    ];
    content = latestResult.finalContent;
    await deps.markChapterGenerationState(chapterId, "reviewed");

    const acceptanceStatus = latestResult.runtimePackage.meta?.acceptanceStatus;
    const continuePolicy = latestResult.runtimePackage.meta?.continuePolicy;
    const shouldPauseForAcceptance = continuePolicy === "pause" || acceptanceStatus === "needs_manual_review";
    const shouldRepairFromAcceptance = continuePolicy === "repair_once" || acceptanceStatus === "repairable";
    pass = !shouldPauseForAcceptance
      && !shouldRepairFromAcceptance
      && !latestResult.runtimePackage.audit.hasBlockingIssues
      && latestResult.runtimePackage.timelineCheck?.status !== "failed"
      && isQualityPass(latestResult.runtimePackage.audit.score, qualityThreshold)
      && styleLeakageIssues.length === 0;
    if (pass) {
      await deps.markChapterGenerationState(chapterId, "approved");
      break;
    }

    // 收集首次失败的归因信息（只在第一次失败时记录）
    if (attempt === 0) {
      firstFailureIssueCodes = extractIssueCodes(latestResult.runtimePackage);
      firstFailureClassificationCode = latestResult.runtimePackage.failureClassification?.code ?? null;
      firstMissingObligationKinds = (latestResult.runtimePackage.obligationCoverage?.missing ?? [])
        .map((m) => String(m.kind))
        .filter((kind) => kind.trim().length > 0);
    }

    if (shouldPauseForAcceptance || !autoRepair || repairMode === "detect_only" || attempt >= effectiveMaxRetries) {
      // 若是 attempt >= effectiveMaxRetries，这是第二次失败，记录二次 codes
      if (attempt > 0) {
        secondFailureIssueCodes = extractIssueCodes(latestResult.runtimePackage);
      }
      break;
    }

    await hooks.onStageChange?.("repairing");
    const repairResult = await repairDraftContent({
      novelTitle: assembled.novel.title,
      chapterTitle: assembled.chapter.title,
      content,
      issues: latestIssues,
      runtimePackage: latestResult.runtimePackage,
      options: {
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        repairMode,
      },
      forceFullRewrite: styleLeakageIssues.length > 0,
    });
    if (repairResult.recoverableFailure) {
      recoverableRepairFailure = repairResult.recoverableFailure;
      repairEscalatedFromPatch = repairResult.escalatedFromPatch;
      await deps.markChapterNeedsRepair(chapterId);
      break;
    }
    repairEscalatedFromPatch = repairResult.escalatedFromPatch;
    content = repairResult.content;
    retryCountUsed += 1;
    await deps.saveDraftAndArtifacts(novelId, chapterId, content, "repaired", {
      scheduleBackgroundSync: false,
      artifactSyncMode,
      syncArtifacts: false,
    });
  }

  if (!latestResult) {
    throw new Error("Pipeline chapter runtime did not produce a result.");
  }

  const contentProvenance: ContentProvenance = pass ? "confirmed" : "debt";
  await syncFinalRetainedChapterArtifacts(
    deps,
    novelId,
    chapterId,
    latestResult.finalContent,
    artifactSyncMode,
    contentProvenance,
  );
  
  if (!pass && shouldFinalizeDegradedForDeferredQualityDebt(latestResult.runtimePackage)) {
    if (deps.finalizeChapterTimeline) {
      await deps.finalizeChapterTimeline({
        novelId,
        chapterId,
        request,
        contextPackage: assembled.contextPackage,
        content: latestResult.finalContent,
        mode: "degraded",
        reason: "max_repair_attempts_exhausted",
        qualityDebt: true,
      });
    }
  }

  // 章节未通过时构建归因对象
  const qualityDebtAttribution: QualityDebtAttribution | null = (!pass && firstFailureIssueCodes.length > 0)
    ? buildQualityDebtAttribution({
        firstFailureIssueCodes,
        secondFailureIssueCodes,
        firstFailureClassificationCode,
        firstMissingObligationKinds,
        patchAnchorFailed: repairEscalatedFromPatch,
      })
    : null;

  // Trigger Aegis Loop 1 prompt self-healing asynchronously in background on failure
  if (!pass) {
    try {
      AegisEvolutionService.triggerEvolution(null, chapterId, "chapter_writer_system.md");
    } catch (err) {
      console.error("[Aegis] Failed to trigger prompt self-healing:", err);
    }
  }

  return {
    reviewExecuted: true,
    pass,
    score: latestResult.runtimePackage.audit.score,
    issues: latestIssues,
    runtimePackage: latestResult.runtimePackage,
    retryCountUsed,
    recoverableRepairFailure,
    qualityDebtAttribution,
  };
}

async function generateNonEmptyDraftFromWriter(input: {
  deps: RunPipelineChapterDeps;
  novelId: string;
  chapterId: string;
  request: ChapterRuntimeRequestInput;
  assembled: AssembledRuntimeChapter;
  hooks: PipelineRuntimeHooks;
}): Promise<{
  content: string;
  lengthControl?: ChapterRuntimePackage["lengthControl"];
  artifactsAlreadySynced?: boolean;
}> {
  let emptyAttempt = 0;
  while (true) {
    await input.hooks.onCheckCancelled?.();
    await input.hooks.onStageChange?.("generating_chapters");
    try {
      const generatedDraft = await input.deps.generateDraftFromWriter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        request: input.request,
        assembled: input.assembled,
      });
      const content = assertChapterContentNotEmpty(generatedDraft.content, {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.assembled.chapter.order,
        source: "pipeline_chapter_writer",
        attempt: emptyAttempt + 1,
        maxEmptyRetries: EMPTY_CONTENT_GENERATION_RETRY_LIMIT,
      });
      return {
        ...generatedDraft,
        content,
      };
    } catch (error) {
      if (!isChapterEmptyContentError(error)) {
        throw error;
      }
      emptyAttempt += 1;
      const willRetry = emptyAttempt <= EMPTY_CONTENT_GENERATION_RETRY_LIMIT;
      await input.hooks.onEmptyContent?.({
        attempt: emptyAttempt,
        willRetry,
        error,
        contentLength: error.details.trimmedLength,
        rawContentLength: error.details.rawLength,
      });
      if (willRetry) {
        continue;
      }
      throw error;
    }
  }
}

async function syncFinalRetainedChapterArtifacts(
  deps: RunPipelineChapterDeps,
  novelId: string,
  chapterId: string,
  content: string,
  artifactSyncMode: PipelineRuntimeInput["artifactSyncMode"],
  contentProvenance: ContentProvenance,
): Promise<void> {
  if (!content.trim()) {
    return;
  }
  await deps.syncFinalChapterArtifacts(novelId, chapterId, content, {
    artifactSyncMode,
    contentProvenance,
  });
}

function isQualityPass(score: QualityScore, qualityThreshold: number): boolean {
  return score.coherence >= QUALITY_THRESHOLD.coherence
    && score.repetition >= QUALITY_THRESHOLD.repetition
    && score.engagement >= QUALITY_THRESHOLD.engagement
    && score.overall >= qualityThreshold;
}

function toReviewIssues(runtimePackage: ChapterRuntimePackage): ReviewIssue[] {
  const issues = runtimePackage.audit.openIssues.map((issue) => ({
    severity: issue.severity,
    category: AUDIT_CATEGORY_MAP[issue.auditType],
    evidence: issue.evidence,
    fixSuggestion: issue.fixSuggestion,
  }));
  return issues.length > 0
    ? issues
    : runtimePackage.audit.reports.flatMap((report) => report.issues.map((issue) => ({
      severity: issue.severity,
      category: AUDIT_CATEGORY_MAP[report.auditType],
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
    })));
}

function toAcceptanceDirectiveIssues(runtimePackage: ChapterRuntimePackage): ReviewIssue[] {
  const directives = runtimePackage.meta?.repairDirectives ?? [];
  return directives.map((directive) => ({
    severity: directive.mode === "manual" || directive.mode === "rewrite" ? "high" : "medium",
    category: directive.target === "character"
      ? "logic"
      : directive.target === "plot" || directive.target === "ending"
        ? "pacing"
        : directive.target === "voice"
          ? "voice"
          : "coherence",
    evidence: `acceptance_directive:${directive.target}`,
    fixSuggestion: directive.instruction,
  }));
}

function detectStyleReferenceLeakageIssues(
  content: string,
  runtimePackage: ChapterRuntimePackage,
): ReviewIssue[] {
  const leakedEntities = detectForbiddenStyleEntities(
    content,
    runtimePackage.context.styleContext,
  );
  if (leakedEntities.length === 0) {
    return [];
  }
  return [{
    severity: "critical",
    category: "voice",
    evidence: "Generated chapter contains source-reference entities from the bound style profile.",
    fixSuggestion: "Rewrite the chapter with transferable style guidance only; remove source-work names, places, titles, catchphrases, and iconic plot references.",
  }];
}

async function repairDraftContent(input: {
  novelTitle: string;
  chapterTitle: string;
  content: string;
  issues: ReviewIssue[];
  runtimePackage: ChapterRuntimePackage;
  forceFullRewrite?: boolean;
  options: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
  };
}): Promise<{
  content: string;
  escalatedFromPatch: boolean;
  recoverableFailure?: PipelineRecoverableRepairFailure | null;
}> {
  if (!input.forceFullRewrite && shouldDeferNonPatchableReviewRisk(input.runtimePackage, input.issues)) {
    return {
      content: input.content,
      escalatedFromPatch: false,
      recoverableFailure: {
        chapterId: input.runtimePackage.chapterId,
        message: "章节接收判断暂时不可用，正文已保留，后续需要重新审校或人工复查。",
        repairMode: input.options.repairMode ?? "light_repair",
        failureTypes: ["review_gate_unavailable"],
        occurredAt: new Date().toISOString(),
      },
    };
  }
  const repaired = await runChapterRepairText({
    novelId: input.runtimePackage.novelId,
    chapterId: input.runtimePackage.chapterId,
    novelTitle: input.novelTitle,
    chapterTitle: input.chapterTitle,
    content: input.content,
    issues: input.issues,
    runtimePackage: input.runtimePackage,
    forceFullRewrite: input.forceFullRewrite,
    options: {
      provider: input.options.provider,
      model: input.options.model,
      temperature: input.options.temperature,
      repairMode: input.options.repairMode,
    },
  });
  return {
    content: repaired.content.trim() || input.content,
    escalatedFromPatch: repaired.escalatedFromPatch,
    recoverableFailure: null,
  };
}

function shouldDeferNonPatchableReviewRisk(
  runtimePackage: ChapterRuntimePackage,
  issues: ReviewIssue[],
): boolean {
  const openIssues = runtimePackage.audit.openIssues ?? [];
  if (openIssues.length > 0) {
    return openIssues.every((issue) => typeof issue.code === "string"
      && NON_PATCHABLE_REVIEW_ISSUE_CODES.has(issue.code));
  }
  return issues.length > 0 && issues.every(issueLooksLikeNonPatchableReviewRisk);
}

function issueLooksLikeNonPatchableReviewRisk(issue: ReviewIssue): boolean {
  const evidence = issue.evidence.toLowerCase();
  const fixSuggestion = issue.fixSuggestion.toLowerCase();
  const combined = `${evidence}\n${fixSuggestion}`;
  return combined.includes("acceptance_gate_unavailable")
    || combined.includes("接收闸门未返回可用结构化结果")
    || combined.includes("章节接收判断不可用")
    || combined.includes("结构化判断缺失");
}

/** 从 runtimePackage 提取 openIssues 的 code 列表（过滤空值） */
function extractIssueCodes(runtimePackage: ChapterRuntimePackage): string[] {
  return (runtimePackage.audit.openIssues ?? [])
    .map((issue) => issue.code)
    .filter((code): code is string => typeof code === "string" && code.trim().length > 0);
}

const LENGTH_ISSUE_CODE_PREFIXES = ["LENGTH_", "length_"];

function isLengthIssueCode(code: string): boolean {
  return LENGTH_ISSUE_CODE_PREFIXES.some((prefix) => code.startsWith(prefix));
}

/** 根据收集到的埋点数据构建结构化归因 */
function buildQualityDebtAttribution(input: {
  firstFailureIssueCodes: string[];
  secondFailureIssueCodes: string[];
  firstFailureClassificationCode: string | null;
  firstMissingObligationKinds: string[];
  patchAnchorFailed: boolean;
}): QualityDebtAttribution {
  const {
    firstFailureIssueCodes,
    secondFailureIssueCodes,
    firstFailureClassificationCode,
    firstMissingObligationKinds,
    patchAnchorFailed,
  } = input;

  // 根因 A：首次和二次 codes 完全一致（修复未解决义务问题）
  const hasBothFailures = secondFailureIssueCodes.length > 0;
  const firstSet = new Set(firstFailureIssueCodes);
  const secondSet = new Set(secondFailureIssueCodes);
  const sameObligationRepeated = hasBothFailures
    && firstSet.size > 0
    && firstSet.size === secondSet.size
    && [...firstSet].every((code) => secondSet.has(code));

  // 根因 D：义务分类 = 义务不可达
  const planMisaligned = firstFailureClassificationCode === "draft_obligation_unmet"
    || firstFailureClassificationCode === "replan_required";

  // 根因 E：首次 length 类、二次 content 类（签名漂移）
  const firstHasLengthOnly = firstFailureIssueCodes.length > 0
    && firstFailureIssueCodes.every(isLengthIssueCode);
  const secondHasContentIssue = secondFailureIssueCodes.some((code) => !isLengthIssueCode(code));
  const lengthVsContentDrift = hasBothFailures && firstHasLengthOnly && secondHasContentIssue;

  return {
    firstFailureIssueCodes,
    secondFailureIssueCodes,
    firstFailureClassificationCode,
    patchAnchorFailed,
    sameObligationRepeated,
    planMisaligned,
    lengthVsContentDrift,
    missingObligationKinds: firstMissingObligationKinds,
    degradedProposalRouting: {
      contentProvenance: "debt",
      routedToPendingReview: true,
      proposalTypes: ["character_state_update", "character_resource_update"],
      fields: ["currentState", "currentGoal", "characterResource"],
    },
  };
}

function shouldFinalizeDegradedForDeferredQualityDebt(runtimePackage: ChapterRuntimePackage): boolean {
  if (runtimePackage.replanRecommendation?.action === "stop_for_replan") {
    return false;
  }
  if (runtimePackage.failureClassification?.code === "replan_required") {
    return false;
  }
  if ((runtimePackage.failureClassification?.blockingObligations ?? []).length > 0) {
    return false;
  }
  const acceptanceStatus = runtimePackage.meta?.acceptanceStatus;
  const continuePolicy = runtimePackage.meta?.continuePolicy;
  if (acceptanceStatus === "needs_manual_review" || continuePolicy === "pause") {
    return false;
  }
  return true;
}
