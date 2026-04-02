import { randomUUID } from "node:crypto";
import type {
  DirectorAutoExecutionState,
  BookSpec,
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCandidatesRequest,
  DirectorConfirmRequest,
  DirectorCorrectionPreset,
  DirectorLLMOptions,
  DirectorLockScope,
  DirectorProjectContextInput,
  DirectorRunMode,
  DirectorSessionState,
} from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_CORRECTION_PRESETS } from "@ai-novel/shared/types/novelDirector";
import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { titleGenerationService } from "../../title/TitleGenerationService";
import { isNearDuplicateTitle } from "../../title/titleGeneration.shared";
import type { NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import type {
  DirectorBookContractParsed,
  DirectorCandidateResponse,
} from "./novelDirectorSchemas";

export type LLMOptions = Pick<DirectorCandidatesRequest, "provider" | "model" | "temperature">;

export interface DirectorWorkflowSeedPayload extends Record<string, unknown> {
  novelId?: string | null;
  candidate?: DirectorCandidate;
  batch?: {
    id?: string;
    round?: number;
  };
  directorInput?: DirectorConfirmRequest;
  directorSession?: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
  autoExecution?: DirectorAutoExecutionState;
}

export interface CandidateGenerationContext {
  idea: string;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
  request: DirectorProjectContextInput;
  options: LLMOptions;
}

const DIRECTOR_ALL_MUTATING_SCOPES: DirectorLockScope[] = [
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
];

export function normalizeDirectorRunMode(runMode: DirectorRunMode | undefined): DirectorRunMode {
  if (runMode === "stage_review") {
    return "stage_review";
  }
  if (runMode === "auto_to_execution") {
    return "auto_to_execution";
  }
  return "auto_to_ready";
}

export function buildDirectorSessionState(input: {
  runMode?: DirectorRunMode;
  phase: DirectorSessionState["phase"];
  isBackgroundRunning: boolean;
}): DirectorSessionState {
  const runMode = normalizeDirectorRunMode(input.runMode);
  const lockedScopes = resolveDirectorLockedScopes({
    runMode,
    phase: input.phase,
    isBackgroundRunning: input.isBackgroundRunning,
  });
  return {
    runMode,
    phase: input.phase,
    isBackgroundRunning: input.isBackgroundRunning,
    lockedScopes,
    reviewScope: input.isBackgroundRunning ? null : resolveDirectorReviewScope(input.phase),
  };
}

function resolveDirectorLockedScopes(input: {
  runMode: DirectorRunMode;
  phase: DirectorSessionState["phase"];
  isBackgroundRunning: boolean;
}): DirectorLockScope[] {
  if (input.isBackgroundRunning) {
    if (input.phase === "candidate_selection") {
      return ["basic"];
    }
    if (
      input.phase === "story_macro"
      || input.phase === "character_setup"
      || input.phase === "volume_strategy"
      || input.phase === "structured_outline"
    ) {
      return DIRECTOR_ALL_MUTATING_SCOPES;
    }
    if (input.phase === "front10_ready") {
      if (input.runMode === "auto_to_execution") {
        return ["chapter", "pipeline"];
      }
      return [];
    }
    return DIRECTOR_ALL_MUTATING_SCOPES;
  }

  if (input.runMode === "auto_to_ready") {
    return [];
  }

  if (input.phase === "character_setup") {
    return ["outline", "structured", "chapter", "pipeline"];
  }
  if (input.phase === "volume_strategy") {
    return ["structured", "chapter", "pipeline"];
  }
  if (input.phase === "front10_ready") {
    return [];
  }
  if (input.phase === "story_macro") {
    return ["character", "outline", "structured", "chapter"];
  }
  return [];
}

function resolveDirectorReviewScope(phase: DirectorSessionState["phase"]): DirectorLockScope | null {
  if (phase === "story_macro") {
    return "story_macro";
  }
  if (phase === "character_setup") {
    return "character";
  }
  if (phase === "volume_strategy") {
    return "outline";
  }
  if (phase === "front10_ready") {
    return "chapter";
  }
  return null;
}

export function normalizeCandidate(
  candidate: DirectorCandidateResponse["candidates"][number],
  index: number,
): DirectorCandidate {
  return {
    id: randomUUID(),
    workingTitle: candidate.workingTitle.trim() || `方案 ${index + 1}`,
    titleOptions: [],
    logline: candidate.logline.trim(),
    positioning: candidate.positioning.trim(),
    sellingPoint: candidate.sellingPoint.trim(),
    coreConflict: candidate.coreConflict.trim(),
    protagonistPath: candidate.protagonistPath.trim(),
    endingDirection: candidate.endingDirection.trim(),
    hookStrategy: candidate.hookStrategy.trim(),
    progressionLoop: candidate.progressionLoop.trim(),
    whyItFits: candidate.whyItFits.trim(),
    toneKeywords: Array.from(
      new Set(candidate.toneKeywords.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 4),
    targetChapterCount: Math.max(12, Math.min(120, Math.round(candidate.targetChapterCount))),
  };
}

export async function enhanceCandidateTitles(
  candidate: DirectorCandidate,
  context: CandidateGenerationContext,
): Promise<DirectorCandidate> {
  const fallbackOptions = [buildFallbackTitleOption(candidate)];

  try {
    const response = await titleGenerationService.generateTitleIdeas({
      mode: "brief",
      brief: buildCandidateTitleBrief(candidate, context),
      genreId: context.request.genreId ?? null,
      count: 4,
      provider: context.options.provider,
      model: context.options.model,
    });
    const mergedOptions = mergeTitleOptions(response.titles, candidate);
    const primaryTitle = mergedOptions[0]?.title?.trim();
    return {
      ...candidate,
      workingTitle: primaryTitle || candidate.workingTitle,
      titleOptions: mergedOptions,
    };
  } catch {
    return {
      ...candidate,
      titleOptions: fallbackOptions,
    };
  }
}

function buildCandidateTitleBrief(
  candidate: DirectorCandidate,
  context: CandidateGenerationContext,
): string {
  const lines = [
    `故事灵感：${context.idea.trim()}`,
    `方案定位：${candidate.positioning}`,
    `核心卖点：${candidate.sellingPoint}`,
    `主线冲突：${candidate.coreConflict}`,
    `主角路径：${candidate.protagonistPath}`,
    `开篇钩子：${candidate.hookStrategy}`,
    `推进循环：${candidate.progressionLoop}`,
    `结局方向：${candidate.endingDirection}`,
    candidate.toneKeywords.length > 0 ? `气质关键词：${candidate.toneKeywords.join("、")}` : "",
    context.request.title?.trim() ? `用户当前草拟标题：${context.request.title.trim()}` : "",
    `当前方案原始命名：${candidate.workingTitle}`,
    "请生成更适合中文网文封面展示和点击测试的书名，突出卖点、反差、异常规则、主角优势或追更钩子。",
    "不要写成策划案标题、世界观概念短语、流水线土味套壳名，也不要为了文艺感牺牲点击感。",
  ].filter(Boolean);
  return lines.join("\n");
}

function mergeTitleOptions(
  generatedTitles: TitleFactorySuggestion[],
  candidate: DirectorCandidate,
): TitleFactorySuggestion[] {
  const merged: TitleFactorySuggestion[] = [];
  for (const option of generatedTitles) {
    if (!merged.some((existing) => isNearDuplicateTitle(existing.title, option.title))) {
      merged.push(option);
    }
  }

  const originalOption = buildFallbackTitleOption(candidate);
  if (!merged.some((existing) => isNearDuplicateTitle(existing.title, originalOption.title))) {
    merged.push(originalOption);
  }

  return merged.slice(0, 4);
}

function buildFallbackTitleOption(candidate: DirectorCandidate): TitleFactorySuggestion {
  return {
    title: candidate.workingTitle,
    clickRate: 60,
    style: "high_concept",
    angle: "原始方案书名",
    reason: "沿用导演候选原始命名。",
  };
}

export function toBookSpec(
  candidate: DirectorCandidate,
  idea: string,
  overrideTargetChapterCount?: number,
): BookSpec {
  return {
    storyInput: idea.trim(),
    positioning: candidate.positioning.trim(),
    sellingPoint: candidate.sellingPoint.trim(),
    coreConflict: candidate.coreConflict.trim(),
    protagonistPath: candidate.protagonistPath.trim(),
    endingDirection: candidate.endingDirection.trim(),
    hookStrategy: candidate.hookStrategy.trim(),
    progressionLoop: candidate.progressionLoop.trim(),
    targetChapterCount: Math.max(
      12,
      Math.min(120, Math.round(overrideTargetChapterCount ?? candidate.targetChapterCount)),
    ),
  };
}

export function buildRefinementSummary(
  presets: DirectorCorrectionPreset[],
  feedback: string | undefined,
  round: number,
): string | null {
  if (round === 1 && presets.length === 0 && !feedback?.trim()) {
    return null;
  }

  const presetSummary = presets.map((preset) => (
    DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset)?.label ?? preset
  ));
  const fragments = [
    presetSummary.length > 0 ? `预设修正：${presetSummary.join("、")}` : "",
    feedback?.trim() ? `补充说明：${feedback.trim()}` : "",
  ].filter(Boolean);
  return fragments.join("；") || "按上一轮意见重新生成";
}

export function buildStoryInput(input: DirectorConfirmRequest, bookSpec: BookSpec): string {
  const lines = [
    input.idea.trim(),
    input.description?.trim() ? `补充概述：${input.description.trim()}` : "",
    input.targetAudience?.trim() ? `目标读者：${input.targetAudience.trim()}` : "",
    input.bookSellingPoint?.trim() ? `书级卖点：${input.bookSellingPoint.trim()}` : "",
    input.competingFeel?.trim() ? `对标气质：${input.competingFeel.trim()}` : "",
    input.first30ChapterPromise?.trim() ? `前30章承诺：${input.first30ChapterPromise.trim()}` : "",
    input.commercialTags && input.commercialTags.length > 0 ? `商业标签：${input.commercialTags.join("、")}` : "",
    `确认方案：${input.candidate.workingTitle}`,
    `作品定位：${bookSpec.positioning}`,
    `核心卖点：${bookSpec.sellingPoint}`,
    `主线冲突：${bookSpec.coreConflict}`,
    `主角路径：${bookSpec.protagonistPath}`,
    `主钩子：${bookSpec.hookStrategy}`,
    `推进循环：${bookSpec.progressionLoop}`,
    `结局方向：${bookSpec.endingDirection}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function normalizeBookContract(parsed: DirectorBookContractParsed): BookContractDraft {
  return {
    readingPromise: parsed.readingPromise.trim(),
    protagonistFantasy: parsed.protagonistFantasy.trim(),
    coreSellingPoint: parsed.coreSellingPoint.trim(),
    chapter3Payoff: parsed.chapter3Payoff.trim(),
    chapter10Payoff: parsed.chapter10Payoff.trim(),
    chapter30Payoff: parsed.chapter30Payoff.trim(),
    escalationLadder: parsed.escalationLadder.trim(),
    relationshipMainline: parsed.relationshipMainline.trim(),
    absoluteRedLines: Array.from(
      new Set(parsed.absoluteRedLines.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 6),
  };
}

export function buildWorkflowSeedPayload(
  input: DirectorProjectContextInput & Pick<DirectorLLMOptions, "runMode"> & { idea: string },
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const basicForm = {
    title: input.title?.trim() || "",
    description: input.description?.trim() || "",
    targetAudience: input.targetAudience?.trim() || "",
    bookSellingPoint: input.bookSellingPoint?.trim() || "",
    competingFeel: input.competingFeel?.trim() || "",
    first30ChapterPromise: input.first30ChapterPromise?.trim() || "",
    commercialTagsText: input.commercialTags?.join("，") || "",
    genreId: input.genreId ?? "",
    worldId: input.worldId ?? "",
    writingMode: input.writingMode ?? "original",
    projectMode: input.projectMode ?? "co_pilot",
    narrativePov: input.narrativePov ?? "third_person",
    pacePreference: input.pacePreference ?? "balanced",
    styleTone: input.styleTone?.trim() || "",
    emotionIntensity: input.emotionIntensity ?? "medium",
    aiFreedom: input.aiFreedom ?? "medium",
    defaultChapterLength: input.defaultChapterLength ?? 2800,
    estimatedChapterCount: input.estimatedChapterCount ?? null,
    projectStatus: input.projectStatus ?? "not_started",
    storylineStatus: input.storylineStatus ?? "not_started",
    outlineStatus: input.outlineStatus ?? "not_started",
    resourceReadyScore: input.resourceReadyScore ?? 0,
    sourceNovelId: input.sourceNovelId ?? "",
    sourceKnowledgeDocumentId: input.sourceKnowledgeDocumentId ?? "",
    continuationBookAnalysisId: input.continuationBookAnalysisId ?? "",
    continuationBookAnalysisSections: input.continuationBookAnalysisSections ?? [],
  };
  return {
    title: basicForm.title || null,
    description: basicForm.description || null,
    targetAudience: basicForm.targetAudience || null,
    bookSellingPoint: basicForm.bookSellingPoint || null,
    competingFeel: basicForm.competingFeel || null,
    first30ChapterPromise: basicForm.first30ChapterPromise || null,
    commercialTags: input.commercialTags ?? [],
    genreId: basicForm.genreId || null,
    worldId: basicForm.worldId || null,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    runMode: input.runMode ?? "auto_to_ready",
    estimatedChapterCount: basicForm.estimatedChapterCount,
    idea: input.idea.trim(),
    basicForm,
    ...extra,
  };
}

export function getDirectorInputFromSeedPayload(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
): DirectorConfirmRequest | null {
  const directorInput = seedPayload?.directorInput;
  if (!directorInput || typeof directorInput !== "object") {
    return null;
  }
  return directorInput as DirectorConfirmRequest;
}

export function applyDirectorLlmOverride(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
  llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
): DirectorWorkflowSeedPayload | null {
  if (!seedPayload) {
    return null;
  }
  const directorInput = getDirectorInputFromSeedPayload(seedPayload);
  if (!directorInput) {
    return null;
  }
  return {
    ...seedPayload,
    directorInput: {
      ...directorInput,
      provider: llmOverride.provider ?? directorInput.provider,
      model: llmOverride.model?.trim() || directorInput.model,
      temperature: typeof llmOverride.temperature === "number"
        ? llmOverride.temperature
        : directorInput.temperature,
    },
  };
}
