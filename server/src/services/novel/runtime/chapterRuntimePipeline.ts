import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
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

export interface PipelineRuntimeResult {
  reviewExecuted: boolean;
  pass: boolean;
  score: QualityScore;
  issues: ReviewIssue[];
  runtimePackage: ChapterRuntimePackage | null;
  retryCountUsed: number;
  recoverableRepairFailure?: PipelineRecoverableRepairFailure | null;
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
    options?: { scheduleBackgroundSync?: boolean; artifactSyncMode?: PipelineRuntimeInput["artifactSyncMode"]; syncArtifacts?: boolean },
  ) => Promise<void>;
  syncFinalChapterArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    options?: { artifactSyncMode?: PipelineRuntimeInput["artifactSyncMode"] },
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
      await syncFinalRetainedChapterArtifacts(deps, novelId, chapterId, content, artifactSyncMode);
      await deps.finalizeChapterTimeline?.({
        novelId,
        chapterId,
        request,
        contextPackage: assembled.contextPackage,
        content,
        mode: "stable",
        reason: "auto_review_disabled_final_content",
      });
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

    if (shouldPauseForAcceptance || !autoRepair || repairMode === "detect_only" || attempt >= effectiveMaxRetries) {
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
      await deps.markChapterNeedsRepair(chapterId);
      break;
    }
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

  await syncFinalRetainedChapterArtifacts(deps, novelId, chapterId, latestResult.finalContent, artifactSyncMode);
  if (!pass && shouldFinalizeDegradedForDeferredQualityDebt(latestResult.runtimePackage)) {
    await deps.finalizeChapterTimeline?.({
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

  return {
    reviewExecuted: true,
    pass,
    score: latestResult.runtimePackage.audit.score,
    issues: latestIssues,
    runtimePackage: latestResult.runtimePackage,
    retryCountUsed,
    recoverableRepairFailure,
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
): Promise<void> {
  if (!content.trim()) {
    return;
  }
  await deps.syncFinalChapterArtifacts(novelId, chapterId, content, { artifactSyncMode });
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
  recoverableFailure?: PipelineRecoverableRepairFailure | null;
}> {
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
    recoverableFailure: null,
  };
}

function shouldFinalizeDegradedForDeferredQualityDebt(runtimePackage: ChapterRuntimePackage): boolean {
  if (runtimePackage.replanRecommendation?.recommended) {
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
