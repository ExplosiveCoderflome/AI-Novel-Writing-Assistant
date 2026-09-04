import { randomUUID } from "node:crypto";
import type {
  DirectorAutoExecutionPlan,
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
  DirectorTaskNotice,
} from "@ai-novel/shared/types/novelDirector";
import type { DirectorRuntimeSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorIssuePolicy } from "@ai-novel/shared/types/directorIssue";
import {
  DIRECTOR_CORRECTION_PRESETS,
  DIRECTOR_MAX_TARGET_CHAPTER_COUNT,
  DIRECTOR_MIN_TARGET_CHAPTER_COUNT,
  buildFullBookAutopilotExecutionPlan,
  isDirectorAutoExecutionRunMode,
  isFullBookAutopilotRunMode,
} from "@ai-novel/shared/types/novelDirector";
import {
  buildFullDirectorAutoApprovalConfig,
  normalizeDirectorAutoApprovalConfig,
  type DirectorAutoApprovalConfig,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { titleGenerationService } from "../../../title/TitleGenerationService";
import { isNearDuplicateTitle } from "../../../title/titleGeneration.shared";
import type { NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorBookContractParsed } from "./novelDirectorSchemas";
import type { DirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import { buildDirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";

export type LLMOptions = Pick<DirectorCandidatesRequest, "provider" | "model" | "temperature">;

export type DirectorCandidateStageMode =
  | "generate"
  | "refine"
  | "patch_candidate"
  | "refine_titles";

export interface DirectorCandidateStageState {
  mode: DirectorCandidateStageMode;
  presets?: DirectorCorrectionPreset[];
  feedback?: string | null;
  batchId?: string | null;
  candidateId?: string | null;
}

export interface DirectorWorkflowSeedPayload extends Record<string, unknown> {
  productionExperience?: "simple" | "professional";
  startupPreparation?: DirectorConfirmRequest["startupPreparation"];
  completionProfile?: DirectorCompletionProfile;
  novelId?: string | null;
  provider?: DirectorLLMOptions["provider"] | null;
  model?: string | null;
  temperature?: number | null;
  runMode?: DirectorRunMode;
  issueGovernanceVersion?: 1;
  issuePolicy?: DirectorIssuePolicy;
  issuePolicySource?: "global" | "novel";
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig | null;
  batches?: DirectorCandidateBatch[];
  candidateStage?: DirectorCandidateStageState | null;
  candidate?: DirectorCandidate;
  batch?: {
    id?: string;
    round?: number;
  };
  directorInput?: DirectorConfirmRequest;
  directorSession?: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
  autoExecution?: DirectorAutoExecutionState;
  taskNotice?: DirectorTaskNotice | null;
  directorRuntime?: DirectorRuntimeSnapshot | null;
  stepReview?: {
    stepId: string;
    nodeKey: string;
    label: string;
    targetType: string;
    targetId?: string | null;
    completedAt: string;
  } | null;
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
  if (runMode === "full_book_autopilot") {
    return "full_book_autopilot";
  }
  if (runMode === "stage_review") {
    return "stage_review";
  }
  if (runMode === "auto_to_execution") {
    return "auto_to_execution";
  }
  return "auto_to_ready";
}

export function applyDirectorRunModeContract<T extends {
  runMode?: DirectorRunMode;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig;
}>(input: T): T & { runMode: DirectorRunMode } {
  const runMode = normalizeDirectorRunMode(input.runMode);
  if (!isFullBookAutopilotRunMode(runMode)) {
    return {
      ...input,
      runMode,
    };
  }
  return {
    ...input,
    runMode,
    autoExecutionPlan: input.autoExecutionPlan?.mode === "chapter_range"
      ? input.autoExecutionPlan
      : buildFullBookAutopilotExecutionPlan(),
    autoApproval: buildFullDirectorAutoApprovalConfig(),
  };
}

export function normalizeDirectorTargetChapterCount(value: number | null | undefined, fallback = 80): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(
    DIRECTOR_MIN_TARGET_CHAPTER_COUNT,
    Math.min(DIRECTOR_MAX_TARGET_CHAPTER_COUNT, Math.round(numericValue)),
  );
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
    if (input.phase === "chapter_execution") {
      if (isDirectorAutoExecutionRunMode(input.runMode)) {
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
  if (input.phase === "chapter_execution") {
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
  if (phase === "chapter_execution") {
    return "chapter";
  }
  return null;
}

export function normalizeCandidate(
  candidate: Omit<DirectorCandidate, "id"> & { id?: string },
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
    recommendedWritingPlatform: candidate.recommendedWritingPlatform,
    writingPlatformReason: candidate.writingPlatformReason?.trim(),
    toneKeywords: Array.from(
      new Set(candidate.toneKeywords.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 4),
    targetChapterCount: normalizeDirectorTargetChapterCount(candidate.targetChapterCount),
  };
}

export async function enhanceCandidateTitles(
  candidate: DirectorCandidate,
  context: CandidateGenerationContext,
  options: { excludedTitles?: string[] } = {},
): Promise<DirectorCandidate> {
  const excludedTitles = options.excludedTitles ?? [];
  const fallbackOptions = mergeTitleOptions([], candidate, excludedTitles);

  try {
    const response = await titleGenerationService.generateTitleIdeas({
      mode: "brief",
      selectionMode: "primary",
      brief: buildCandidateTitleBrief(candidate, context, excludedTitles),
      genreId: context.request.genreId ?? null,
      count: 4,
      provider: context.options.provider,
      model: context.options.model,
    });
    const mergedOptions = mergeTitleOptions(response.titles, candidate, excludedTitles);
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
  excludedTitles: string[] = [],
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
    `推荐发布平台：${candidate.recommendedWritingPlatform === "qidian_male"
      ? "起点男频"
      : candidate.recommendedWritingPlatform === "jinjiang_female"
        ? "晋江女频"
        : "番茄免费网文"}`,
    candidate.writingPlatformReason?.trim() ? `平台判断理由：${candidate.writingPlatformReason.trim()}` : "",
    context.request.readerChannelPreference === "male_oriented" ? "读者频道：男频向" : "",
    context.request.readerChannelPreference === "female_oriented" ? "读者频道：女频向" : "",
    context.request.readerChannelPreference === "general" ? "读者频道：泛读者" : "",
    context.request.targetAudience?.trim() ? `目标读者：${context.request.targetAudience.trim()}` : "",
    context.request.marketBriefPrompt?.trim() ? `开书市场简报：\n${context.request.marketBriefPrompt.trim()}` : "",
    candidate.toneKeywords.length > 0 ? `气质关键词：${candidate.toneKeywords.join("、")}` : "",
    context.request.title?.trim() ? `用户当前草拟标题：${context.request.title.trim()}` : "",
    `当前方案原始命名：${candidate.workingTitle}`,
    excludedTitles.length > 0 ? `其他方案已占用书名：${excludedTitles.join("、")}` : "",
    "请先确定一个最适合当前平台、读者与故事方向的主书名，再给出三个不同角度的备选。",
    "主书名必须保留这套故事独有的具体资产，不能只剩抽象情绪、泛化反差或一句悬念文案。",
    "不要写成策划案标题、世界观概念短语、流水线土味套壳名，也不要为了文艺感牺牲点击感。",
    excludedTitles.length > 0 ? "不得复用或近似改写其他方案已占用的书名。" : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function mergeTitleOptions(
  generatedTitles: TitleFactorySuggestion[],
  candidate: DirectorCandidate,
  excludedTitles: string[] = [],
): TitleFactorySuggestion[] {
  const merged: TitleFactorySuggestion[] = [];
  for (const option of generatedTitles) {
    const conflictsWithExcluded = excludedTitles.some((title) => isNearDuplicateTitle(title, option.title));
    if (!conflictsWithExcluded && !merged.some((existing) => isNearDuplicateTitle(existing.title, option.title))) {
      merged.push(option);
    }
  }

  const originalOption = buildFallbackTitleOption(candidate);
  const originalConflictsWithExcluded = excludedTitles.some((title) => (
    isNearDuplicateTitle(title, originalOption.title)
  ));
  if (
    !originalConflictsWithExcluded
    && !merged.some((existing) => isNearDuplicateTitle(existing.title, originalOption.title))
  ) {
    merged.push(originalOption);
  }

  return merged.slice(0, 4);
}

export function selectDistinctCandidateTitle(
  candidate: DirectorCandidate,
  excludedTitles: string[],
): DirectorCandidate | null {
  const availableOptions: TitleFactorySuggestion[] = [];
  for (const option of candidate.titleOptions ?? []) {
    const conflictsWithExcluded = excludedTitles.some((title) => isNearDuplicateTitle(title, option.title));
    if (
      !conflictsWithExcluded
      && !availableOptions.some((existing) => isNearDuplicateTitle(existing.title, option.title))
    ) {
      availableOptions.push(option);
    }
  }

  const currentTitleAvailable = !excludedTitles.some((title) => (
    isNearDuplicateTitle(title, candidate.workingTitle)
  ));
  const selectedOption = currentTitleAvailable
    ? availableOptions.find((option) => isNearDuplicateTitle(option.title, candidate.workingTitle))
      ?? buildFallbackTitleOption(candidate)
    : availableOptions[0];
  if (!selectedOption) {
    return null;
  }

  return {
    ...candidate,
    workingTitle: selectedOption.title.trim(),
    titleOptions: [
      selectedOption,
      ...availableOptions.filter((option) => !isNearDuplicateTitle(option.title, selectedOption.title)),
    ].slice(0, 4),
  };
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
    targetChapterCount: normalizeDirectorTargetChapterCount(overrideTargetChapterCount ?? candidate.targetChapterCount),
    completionProfile: buildDirectorCompletionProfile(
      normalizeDirectorTargetChapterCount(overrideTargetChapterCount ?? candidate.targetChapterCount),
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
    input.genreId?.trim() ? `题材基底：${input.genreId.trim()}` : "",
    input.primaryStoryModeId?.trim() ? `主推进模式：${input.primaryStoryModeId.trim()}` : "",
    input.secondaryStoryModeId?.trim() ? `副推进模式：${input.secondaryStoryModeId.trim()}` : "",
    `确认方案：${input.candidate.workingTitle}`,
    `作品定位：${bookSpec.positioning}`,
    `核心卖点：${bookSpec.sellingPoint}`,
    `主线冲突：${bookSpec.coreConflict}`,
    `主角路径：${bookSpec.protagonistPath}`,
    `主钩子：${bookSpec.hookStrategy}`,
    `推进循环：${bookSpec.progressionLoop}`,
    `结局方向：${bookSpec.endingDirection}`,
    input.stepCalibrationInstruction?.trim()
      ? `当前步骤校准要求：${input.stepCalibrationInstruction.trim()}`
      : "",
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
  input: DirectorProjectContextInput & Pick<DirectorLLMOptions, "provider" | "model" | "temperature" | "runMode"> & {
    idea: string;
    autoExecutionPlan?: DirectorAutoExecutionPlan;
    autoApproval?: DirectorAutoApprovalConfig;
    completionProfile?: DirectorCompletionProfile;
  },
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
    primaryStoryModeId: input.primaryStoryModeId ?? "",
    secondaryStoryModeId: input.secondaryStoryModeId ?? "",
    worldId: input.worldId ?? "",
    worldSetupMode: input.worldId ? "auto_generate" : input.worldSetupMode ?? "auto_generate",
    writingMode: input.writingMode ?? "original",
    projectMode: input.projectMode ?? "co_pilot",
    readerChannelPreference: input.readerChannelPreference ?? "ai_judge",
    writingPlatformPreference: input.writingPlatformPreference ?? "ai_recommend",
    narrativePov: input.narrativePov ?? "third_person",
    pacePreference: input.pacePreference ?? "balanced",
    styleTone: input.styleTone?.trim() || "",
    emotionIntensity: input.emotionIntensity ?? "medium",
    aiFreedom: input.aiFreedom ?? "medium",
    postGenerationStyleReviewEnabled: input.postGenerationStyleReviewEnabled ?? true,
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
    referenceBookAnalysisId: input.referenceBookAnalysisId ?? "",
    referenceBookAnalysisSections: input.referenceBookAnalysisSections ?? [],
  };
  const autoApproval = Object.prototype.hasOwnProperty.call(input, "autoApproval")
    ? normalizeDirectorAutoApprovalConfig(input.autoApproval)
    : null;
  const completionProfile = input.completionProfile
    ?? buildDirectorCompletionProfile(basicForm.estimatedChapterCount ?? 80);
  return {
    title: basicForm.title || null,
    description: basicForm.description || null,
    targetAudience: basicForm.targetAudience || null,
    bookSellingPoint: basicForm.bookSellingPoint || null,
    competingFeel: basicForm.competingFeel || null,
    first30ChapterPromise: basicForm.first30ChapterPromise || null,
    commercialTags: input.commercialTags ?? [],
    genreId: basicForm.genreId || null,
    primaryStoryModeId: basicForm.primaryStoryModeId || null,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || null,
    worldId: basicForm.worldId || null,
    worldSetupMode: basicForm.worldId ? undefined : basicForm.worldSetupMode,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    readerChannelPreference: basicForm.readerChannelPreference,
    writingPlatformPreference: basicForm.writingPlatformPreference,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    styleProfileId: input.styleProfileId?.trim() || null,
    styleIntentSummary: input.styleIntentSummary ?? null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    provider: input.provider ?? null,
    model: input.model?.trim() || null,
    temperature: typeof input.temperature === "number" ? input.temperature : null,
    runMode: input.runMode ?? "auto_to_ready",
    ...("issueGovernanceVersion" in input && input.issueGovernanceVersion === 1
      ? { issueGovernanceVersion: input.issueGovernanceVersion }
      : {}),
    ...("issuePolicy" in input && input.issuePolicy
      ? { issuePolicy: input.issuePolicy }
      : {}),
    ...("issuePolicySource" in input && (input.issuePolicySource === "global" || input.issuePolicySource === "novel")
      ? { issuePolicySource: input.issuePolicySource }
      : {}),
    ...(input.autoExecutionPlan ? { autoExecutionPlan: input.autoExecutionPlan } : {}),
    ...(autoApproval ? { autoApproval } : {}),
    estimatedChapterCount: basicForm.estimatedChapterCount,
    completionProfile,
    idea: input.idea.trim(),
    basicForm,
    ...extra,
  };
}

export function buildDirectorWorkflowSeedPayload(
  input: DirectorConfirmRequest,
  novelId: string | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const directorSessionPhase = extra?.directorSession
    && typeof extra.directorSession === "object"
    && "phase" in extra.directorSession
    ? (extra.directorSession as { phase?: unknown }).phase
    : null;
  const shouldClearCandidateStage = Boolean(novelId)
    || (
      typeof directorSessionPhase === "string"
      && directorSessionPhase !== "candidate_selection"
    );
  const nextCandidateStage = shouldClearCandidateStage
    ? null
    : (Object.prototype.hasOwnProperty.call(extra ?? {}, "candidateStage")
        ? (extra as { candidateStage?: unknown }).candidateStage
        : undefined);

  return buildWorkflowSeedPayload(input, {
    novelId,
    candidate: input.candidate,
    batch: {
      id: input.batchId,
      round: input.round,
    },
    directorInput: input,
    ...extra,
    candidateStage: nextCandidateStage,
  });
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

export function getDirectorLlmOptionsFromSeedPayload(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
): Pick<DirectorLLMOptions, "provider" | "model" | "temperature"> | null {
  if (!seedPayload) {
    return null;
  }
  const directorInput = getDirectorInputFromSeedPayload(seedPayload);
  const provider = seedPayload.provider ?? directorInput?.provider ?? undefined;
  const model = typeof seedPayload.model === "string"
    ? (seedPayload.model.trim() || undefined)
    : (directorInput?.model?.trim() || undefined);
  const temperature = typeof seedPayload.temperature === "number"
    ? seedPayload.temperature
    : directorInput?.temperature;
  if (!provider && !model && typeof temperature !== "number") {
    return null;
  }
  return {
    provider,
    model,
    temperature,
  };
}

export function applyDirectorLlmOverride(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
  llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
): DirectorWorkflowSeedPayload | null {
  if (!seedPayload) {
    return null;
  }
  const directorInput = getDirectorInputFromSeedPayload(seedPayload);
  const nextModel = llmOverride.model?.trim()
    || (typeof seedPayload.model === "string" ? seedPayload.model.trim() : directorInput?.model?.trim() || null);
  const nextTemperature = typeof llmOverride.temperature === "number"
    ? llmOverride.temperature
    : (typeof seedPayload.temperature === "number" ? seedPayload.temperature : directorInput?.temperature ?? null);
  const nextProvider = llmOverride.provider ?? seedPayload.provider ?? directorInput?.provider ?? null;
  return {
    ...seedPayload,
    provider: nextProvider,
    model: nextModel,
    temperature: nextTemperature,
    directorInput: directorInput
      ? {
        ...directorInput,
        provider: nextProvider ?? directorInput.provider,
        model: nextModel || directorInput.model,
        temperature: typeof nextTemperature === "number"
          ? nextTemperature
          : directorInput.temperature,
      }
      : undefined,
  };
}
