import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { runTextPrompt } from "../../../prompting/core/promptRunner";
import { buildChapterRepairContextBlocks } from "../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterRepairPrompt } from "../../../prompting/prompts/novel/review.prompts";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import {
  ChapterPatchRepairFailedError,
  ChapterPatchRepairService,
} from "../chapterPatchRepairService";
import { detectForbiddenStyleEntities } from "../../styleEngine/styleGenerationSanitizer";
import {
  assertChapterContentNotEmpty,
  isChapterEmptyContentError,
  type ChapterEmptyContentError,
} from "./chapterEmptyContentError";

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
    options?: { scheduleBackgroundSync?: boolean; artifactSyncMode?: PipelineRuntimeInput["artifactSyncMode"] },
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

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
        });
      }
    } else if (attempt === 0) {
      await deps.saveDraftAndArtifacts(novelId, chapterId, content, "drafted", {
        scheduleBackgroundSync: false,
        artifactSyncMode,
      });
    }

    if (!autoReview) {
      await deps.markChapterGenerationState(chapterId, "approved");
      await syncFinalRetainedChapterArtifacts(deps, novelId, chapterId, content, artifactSyncMode);
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

    const acceptanceStatus = latestResult.runtimePackage.meta.acceptanceStatus;
    const continuePolicy = latestResult.runtimePackage.meta.continuePolicy;
    const shouldPauseForAcceptance = continuePolicy === "pause" || acceptanceStatus === "needs_manual_review";
    const shouldRepairFromAcceptance = continuePolicy === "repair_once" || acceptanceStatus === "repairable";
    pass = !shouldPauseForAcceptance
      && !shouldRepairFromAcceptance
      && isQualityPass(latestResult.runtimePackage.audit.score, qualityThreshold)
      && styleLeakageIssues.length === 0;
    if (pass) {
      await deps.markChapterGenerationState(chapterId, "approved");
      break;
    }

    if (shouldPauseForAcceptance || !autoRepair || repairMode === "detect_only" || attempt >= maxRetries) {
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
    });
  }

  if (!latestResult) {
    throw new Error("Pipeline chapter runtime did not produce a result.");
  }

  await syncFinalRetainedChapterArtifacts(deps, novelId, chapterId, latestResult.finalContent, artifactSyncMode);

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
  const directives = runtimePackage.meta.repairDirectives ?? [];
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
  const issues = input.issues.length > 0
    ? input.issues
    : [{
        severity: "medium" as const,
        category: "coherence" as const,
        evidence: "Pipeline quality threshold not met.",
        fixSuggestion: "Tighten continuity, sharpen conflict progression, and improve readability.",
      }];
  let activeRepairMode = input.options.repairMode ?? "light_repair";
  let modeHint = getRepairModeHint(
    activeRepairMode,
    input.runtimePackage.audit.openIssues.map((issue) => issue.code),
  );
  if (input.forceFullRewrite && activeRepairMode !== "heavy_repair") {
    activeRepairMode = "heavy_repair";
    modeHint = getRepairModeHint(
      activeRepairMode,
      input.runtimePackage.audit.openIssues.map((issue) => issue.code),
    );
  }
  if (!input.forceFullRewrite) {
    const patchRepairService = new ChapterPatchRepairService();
    try {
      const patched = await patchRepairService.repair({
        novelId: input.runtimePackage.novelId,
        chapterId: input.runtimePackage.chapterId,
        novelTitle: input.novelTitle,
        chapterTitle: input.chapterTitle,
        content: input.content,
        issues,
        runtimePackage: input.runtimePackage,
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature,
          repairMode: activeRepairMode,
          modeHint,
        });
      return {
        content: patched.content,
        recoverableFailure: null,
      };
    } catch (error) {
      if (!(error instanceof ChapterPatchRepairFailedError)) {
        throw error;
      }
      if (activeRepairMode !== "heavy_repair") {
        activeRepairMode = "heavy_repair";
        modeHint = getRepairModeHint(
          activeRepairMode,
          input.runtimePackage.audit.openIssues.map((issue) => issue.code),
        );
      }
    }
  }

  const repairContextBlocks = input.runtimePackage.context.chapterRepairContext
    ? buildChapterRepairContextBlocks(input.runtimePackage.context.chapterRepairContext)
    : undefined;
  const repaired = await runTextPrompt({
    asset: chapterRepairPrompt,
    promptInput: {
      novelTitle: input.novelTitle,
      bibleContent: buildRepairBibleFallback(input.runtimePackage),
      chapterTitle: input.chapterTitle,
      chapterContent: input.content,
      issuesJson: JSON.stringify(issues, null, 2),
      ragContext: "",
      modeHint,
    },
    contextBlocks: repairContextBlocks,
    options: {
      provider: input.options.provider,
      model: input.options.model,
      temperature: Math.min(input.options.temperature ?? 0.55, 0.65),
      novelId: input.runtimePackage.novelId,
      chapterId: input.runtimePackage.chapterId,
      stage: "chapter_repair",
      triggerReason: activeRepairMode,
    },
  });
  const nextContent = repaired.output.trim();
  return {
    content: nextContent || input.content,
    recoverableFailure: null,
  };
}

function buildRepairBibleFallback(runtimePackage: ChapterRuntimePackage): string {
  const context = runtimePackage.context;
  const fragments = [
    context.bookContract?.sellingPoint ? `核心卖点：${context.bookContract.sellingPoint}` : "",
    context.bookContract?.first30ChapterPromise ? `前30章承诺：${context.bookContract.first30ChapterPromise}` : "",
    context.macroConstraints?.coreConflict ? `核心冲突：${context.macroConstraints.coreConflict}` : "",
    context.macroConstraints?.progressionLoop ? `推进回路：${context.macroConstraints.progressionLoop}` : "",
    context.volumeWindow?.missionSummary ? `当前卷使命：${context.volumeWindow.missionSummary}` : "",
  ].filter(Boolean);
  return fragments.join("\n") || "none";
}

function getRepairModeHint(
  repairMode: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only" | undefined,
  issueCodes: string[] = [],
): string {
  if (issueCodes.includes("LENGTH_OVER_HARD_MAX")) {
    return "compress_chapter_for_length：整章压缩重复表达、解释段和无效回合，保留核心推进与结尾压力。";
  }
  if (issueCodes.includes("LENGTH_OVER_SOFT_MAX")) {
    return "compress_tail_for_length：优先回收尾段冗余展开，保留结尾 hook 和关键冲突。";
  }
  if (issueCodes.includes("LENGTH_UNDER_SOFT_MIN")) {
    return "extend_for_length：只补最后的义务场景或结尾 hook，增加有效推进，不要回顾性凑字数。";
  }
  switch (repairMode) {
    case "continuity_only":
      return "优先修连续性、时间线和事件承接，不做大幅风格重写。";
    case "character_only":
      return "优先修人物言行一致性、动机和关系表现，不改变主线任务。";
    case "ending_only":
      return "优先修章节收束、钩子和结尾决断感，让章节尾部更有拉力。";
    case "heavy_repair":
      return "允许较大幅度重写句段，只要剧情方向不变即可。";
    case "light_repair":
    default:
      return "以轻修为主，优先保持原有内容框架和事件顺序。";
  }
}
