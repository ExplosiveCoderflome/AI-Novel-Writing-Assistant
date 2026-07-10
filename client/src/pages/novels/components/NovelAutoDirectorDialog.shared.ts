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
    value: "stage_review",
    label: "逐步协作",
    description: "每完成一个导演步骤就暂停，检查或完善后再继续下一步。",
    recommended: true,
    recommendation: "适合希望逐步确认故事方向和章节规划的写作方式。",
  },
  {
    value: "full_book_autopilot",
    label: "全书自动成书",
    description: "你只在开始选择方向，系统会按整本书目标完成规划、写作、审校和修复。",
  },
  {
    value: "auto_to_ready",
    label: "先准备到可开写（推荐）",
    description: "AI 会先准备书级规划、卷章安排和章节执行资源，停在可开写阶段交给你确认。",
    recommended: true,
    recommendation: "推荐先查看规划是否符合想法，再开始大量章节产出。",
  },
  {
    value: "auto_to_execution",
    label: "按范围执行",
    description: "可选择全书、前 N 章或前 1 卷，让 AI 直接准备并执行目标范围。",
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
