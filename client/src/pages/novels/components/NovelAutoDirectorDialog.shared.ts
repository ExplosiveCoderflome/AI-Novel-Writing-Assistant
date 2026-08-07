import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type { DirectorRunMode, DirectorWorldSetupMode } from "@ai-novel/shared/types/novelDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";

export interface DirectorRunModeOption {
  value: DirectorRunMode;
  label: string;
  description: string;
  recommended?: boolean;
  recommendation?: string;
}

export const RUN_MODE_OPTIONS: DirectorRunModeOption[] = [
  {
    value: "auto_to_ready",
    label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    description: "The AI ​​will prepare book-level planning, roles, chapter arrangements, and chapter execution resources, and then you can choose between simple production or professional production.",
    recommended: true,
    recommendation: "The text will not be generated in advance, and the decision on how to produce the entire book will be made once preparation is complete.",
  },
];

export const DEFAULT_VISIBLE_RUN_MODE: DirectorRunMode = "auto_to_ready";

export interface AutoDirectorRequestLlmOptions {
  provider: LLMProvider;
  model: string;
  temperature?: number;
}

export function buildInitialIdea(basicForm: NovelBasicFormState): string {
  const lines = [
    basicForm.description.trim(),
    basicForm.title.trim() ? `我想写一本暂名为《${basicForm.title.trim()}》的小说。` : "",
    basicForm.styleTone.trim() ? `文风希望偏 ${basicForm.styleTone.trim()}。` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildAutoDirectorRequestPayload(
  basicForm: NovelBasicFormState,
  idea: string,
  llm: AutoDirectorRequestLlmOptions,
  runMode: DirectorRunMode,
  workflowTaskId?: string,
  options?: {
    styleProfileId?: string;
    worldSetupMode?: DirectorWorldSetupMode;
  },
) {
  const commercialTags = normalizeCommercialTags(basicForm.commercialTagsText);
  return {
    idea: idea.trim(),
    workflowTaskId: workflowTaskId || undefined,
    title: basicForm.title.trim() || undefined,
    description: basicForm.description.trim() || undefined,
    targetAudience: basicForm.targetAudience.trim() || undefined,
    bookSellingPoint: basicForm.bookSellingPoint.trim() || undefined,
    competingFeel: basicForm.competingFeel.trim() || undefined,
    first30ChapterPromise: basicForm.first30ChapterPromise.trim() || undefined,
    commercialTags: commercialTags.length > 0 ? commercialTags : undefined,
    genreId: basicForm.genreId || undefined,
    primaryStoryModeId: basicForm.primaryStoryModeId || undefined,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || undefined,
    worldId: basicForm.worldId || undefined,
    worldSetupMode: basicForm.worldId ? undefined : options?.worldSetupMode ?? "auto_generate",
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    readerChannelPreference: basicForm.readerChannelPreference,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    styleProfileId: options?.styleProfileId?.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    defaultChapterLength: basicForm.defaultChapterLength,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    projectStatus: basicForm.projectStatus,
    storylineStatus: basicForm.storylineStatus,
    outlineStatus: basicForm.outlineStatus,
    resourceReadyScore: basicForm.resourceReadyScore,
    sourceNovelId: basicForm.sourceNovelId || undefined,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId || undefined,
    continuationBookAnalysisId: basicForm.continuationBookAnalysisId || undefined,
    continuationBookAnalysisSections: basicForm.continuationBookAnalysisSections.length > 0
      ? basicForm.continuationBookAnalysisSections
      : undefined,
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
    runMode,
  };
}
