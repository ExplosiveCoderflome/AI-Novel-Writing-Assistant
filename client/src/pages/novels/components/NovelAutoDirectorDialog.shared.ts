import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type { DirectorRunMode } from "@ai-novel/shared/types/novelDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";

export const RUN_MODE_OPTIONS: Array<{
  value: DirectorRunMode;
  label: string;
  description: string;
}> = [
  {
    value: "auto_to_ready",
    label: "自动推进到可开写",
    description: "AI 会持续推进到章节执行资源准备好后再交给你。",
  },
  {
    value: "auto_to_execution",
    label: "继续自动执行章节批次",
    description: "默认执行前 10 章，也可以改成指定章节范围或按卷执行。",
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
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone.trim() || undefined,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
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
