import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { runTextPrompt } from "../../../prompting/core/promptRunner";
import { buildChapterRepairContextBlocks } from "../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterRepairPrompt } from "../../../prompting/prompts/novel/review.prompts";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";

export interface PipelineRuntimeHooks {
  onCheckCancelled?: () => Promise<void>;
  onStageChange?: (stage: "generating_chapters" | "reviewing" | "repairing") => Promise<void>;
}

export interface PipelineRuntimeInput extends ChapterRuntimeRequestInput {
  maxRetries?: number;
  autoRepair?: boolean;
  qualityThreshold?: number;
  repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
}

export interface PipelineRuntimeResult {
  pass: boolean;
  score: QualityScore;
  issues: ReviewIssue[];
  runtimePackage: ChapterRuntimePackage;
  retryCountUsed: number;
}

export interface FinalizedRuntimeResult {
  finalContent: string;
  runtimePackage: ChapterRuntimePackage;
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
  }) => Promise<string>;
  saveDraftAndArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
  ) => Promise<void>;
  finalizeChapterContent: (input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
    runId: string | null;
    startMs: number | null;
  }) => Promise<FinalizedRuntimeResult>;
  markChapterGenerationState: (
    chapterId: string,
    generationState: "reviewed" | "approved",
  ) => Promise<void>;
}

const QUALITY_THRESHOLD = { coherence: 80, repetition: 20, engagement: 75 };

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
    maxRetries = 2,
    autoRepair = true,
    qualityThreshold = 75,
    repairMode = "light_repair",
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

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await hooks.onCheckCancelled?.();
    if (!content.trim()) {
      await hooks.onStageChange?.("generating_chapters");
      content = await deps.generateDraftFromWriter({
        novelId,
        chapterId,
        request,
        assembled,
      });
    } else if (attempt === 0) {
      await deps.saveDraftAndArtifacts(novelId, chapterId, content, "drafted");
    }

    await hooks.onStageChange?.("reviewing");
    latestResult = await deps.finalizeChapterContent({
      novelId,
      chapterId,
      request,
      contextPackage: assembled.contextPackage,
      content,
      runId: null,
      startMs: null,
    });
    latestIssues = toReviewIssues(latestResult.runtimePackage);
    content = latestResult.finalContent;
    await deps.markChapterGenerationState(chapterId, "reviewed");

    pass = isQualityPass(latestResult.runtimePackage.audit.score, qualityThreshold);
    if (pass) {
      await deps.markChapterGenerationState(chapterId, "approved");
      break;
    }

    if (!autoRepair || repairMode === "detect_only" || attempt >= maxRetries) {
      break;
    }

    await hooks.onStageChange?.("repairing");
    content = await repairDraftContent({
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
    });
    retryCountUsed += 1;
    await deps.saveDraftAndArtifacts(novelId, chapterId, content, "repaired");
  }

  if (!latestResult) {
    throw new Error("Pipeline chapter runtime did not produce a result.");
  }

  return {
    pass,
    score: latestResult.runtimePackage.audit.score,
    issues: latestIssues,
    runtimePackage: latestResult.runtimePackage,
    retryCountUsed,
  };
}

function isQualityPass(score: QualityScore, qualityThreshold: number): boolean {
  return score.coherence >= QUALITY_THRESHOLD.coherence
    && score.repetition <= QUALITY_THRESHOLD.repetition
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

async function repairDraftContent(input: {
  novelTitle: string;
  chapterTitle: string;
  content: string;
  issues: ReviewIssue[];
  runtimePackage: ChapterRuntimePackage;
  options: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
  };
}): Promise<string> {
  const issues = input.issues.length > 0
    ? input.issues
    : [{
        severity: "medium" as const,
        category: "coherence" as const,
        evidence: "Pipeline quality threshold not met.",
        fixSuggestion: "Tighten continuity, sharpen conflict progression, and improve readability.",
      }];
  const modeHint = getRepairModeHint(input.options.repairMode);
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
    },
  });
  const nextContent = repaired.output.trim();
  return nextContent || input.content;
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
): string {
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
