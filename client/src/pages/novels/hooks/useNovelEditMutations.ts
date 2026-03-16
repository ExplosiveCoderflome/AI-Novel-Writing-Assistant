import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { PipelineRepairMode, PipelineRunMode, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import {
  createNovelChapter,
  deleteNovelChapter,
  generateChapterHook,
  optimizeNovelOutlinePreview,
  optimizeNovelStructuredOutlinePreview,
  reviewNovelChapter,
  runNovelPipeline,
  updateNovelChapter,
  updateNovel,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { buildStructuredOutlineSyncPlan, buildTaskSheetFromStructuredChapter, type OutlineSyncChapter, type StructuredSyncOptions, type StructuredVolume } from "../novelEdit.utils";

interface BasicFormState {
  title: string;
  description: string;
  worldId: string;
  status: "draft" | "published";
  writingMode: "original" | "continuation";
  projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  narrativePov: "first_person" | "third_person" | "mixed";
  pacePreference: "slow" | "balanced" | "fast";
  styleTone: string;
  emotionIntensity: "low" | "medium" | "high";
  aiFreedom: "low" | "medium" | "high";
  defaultChapterLength: number;
  projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  storylineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  outlineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  resourceReadyScore: number;
  continuationSourceType: "novel" | "knowledge_document";
  sourceNovelId: string;
  sourceKnowledgeDocumentId: string;
  continuationBookAnalysisId: string;
  continuationBookAnalysisSections: BookAnalysisSectionKey[];
}

interface LlmSettings {
  provider?: "deepseek" | "siliconflow" | "openai" | "anthropic" | "grok";
  model?: string;
  temperature?: number;
}

interface PipelineFormState {
  startOrder: number;
  endOrder: number;
  maxRetries: number;
  runMode: PipelineRunMode;
  autoReview: boolean;
  autoRepair: boolean;
  skipCompleted: boolean;
  qualityThreshold: number;
  repairMode: PipelineRepairMode;
}

interface UseNovelEditMutationsArgs {
  id: string;
  basicForm: BasicFormState;
  hasCharacters: boolean;
  outlineText: string;
  outlineOptimizeInstruction: string;
  setOutlineOptimizePreview: (value: string) => void;
  setOutlineOptimizeMode: (value: "full" | "selection") => void;
  setOutlineOptimizeSourceText: (value: string) => void;
  structuredDraftText: string;
  structuredOptimizeInstruction: string;
  setStructuredOptimizePreview: (value: string) => void;
  setStructuredOptimizeMode: (value: "full" | "selection") => void;
  setStructuredOptimizeSourceText: (value: string) => void;
  structuredVolumes: StructuredVolume[];
  chapters: OutlineSyncChapter[];
  llm: LlmSettings;
  pipelineForm: PipelineFormState;
  selectedChapterId: string;
  chapterCount: number;
  setActiveTab: (value: string) => void;
  setSelectedChapterId: (value: string) => void;
  setCurrentJobId: (value: string) => void;
  setPipelineMessage: (value: string) => void;
  setStructuredMessage: (value: string) => void;
  setReviewResult: (value: { score: QualityScore; issues: ReviewIssue[]; auditReports?: import("@ai-novel/shared/types/novel").AuditReport[] } | null) => void;
  queryClient: QueryClient;
  invalidateNovelDetail: () => Promise<void>;
}

export function useNovelEditMutations({
  id,
  basicForm,
  hasCharacters,
  outlineText,
  outlineOptimizeInstruction,
  setOutlineOptimizePreview,
  setOutlineOptimizeMode,
  setOutlineOptimizeSourceText,
  structuredDraftText,
  structuredOptimizeInstruction,
  setStructuredOptimizePreview,
  setStructuredOptimizeMode,
  setStructuredOptimizeSourceText,
  structuredVolumes,
  chapters,
  llm,
  pipelineForm,
  selectedChapterId,
  chapterCount,
  setActiveTab,
  setSelectedChapterId,
  setCurrentJobId,
  setPipelineMessage,
  setStructuredMessage,
  setReviewResult,
  queryClient,
  invalidateNovelDetail,
}: UseNovelEditMutationsArgs) {
  const saveBasicMutation = useMutation({
    mutationFn: () =>
      updateNovel(id, {
        title: basicForm.title,
        description: basicForm.description,
        worldId: basicForm.worldId || null,
        status: basicForm.status,
        writingMode: basicForm.writingMode,
        projectMode: basicForm.projectMode,
        narrativePov: basicForm.narrativePov,
        pacePreference: basicForm.pacePreference,
        styleTone: basicForm.styleTone || null,
        emotionIntensity: basicForm.emotionIntensity,
        aiFreedom: basicForm.aiFreedom,
        defaultChapterLength: basicForm.defaultChapterLength,
        projectStatus: basicForm.projectStatus,
        storylineStatus: basicForm.storylineStatus,
        outlineStatus: basicForm.outlineStatus,
        resourceReadyScore: basicForm.resourceReadyScore,
        sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
          ? (basicForm.sourceNovelId || null)
          : null,
        sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
          ? (basicForm.sourceKnowledgeDocumentId || null)
          : null,
        continuationBookAnalysisId: basicForm.writingMode === "continuation"
          && (
            (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
            || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
          )
          ? (basicForm.continuationBookAnalysisId || null)
          : null,
        continuationBookAnalysisSections:
          basicForm.writingMode === "continuation"
            && (
              (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
              || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
            )
            && basicForm.continuationBookAnalysisId
            ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : null)
            : null,
      }),
    onSuccess: async () => {
      await invalidateNovelDetail();
      if (!hasCharacters) {
        setActiveTab("character");
      }
    },
  });

  const saveOutlineMutation = useMutation({
    mutationFn: () => updateNovel(id, { outline: outlineText }),
    onSuccess: invalidateNovelDetail,
  });

  const saveStructuredMutation = useMutation({
    mutationFn: () => updateNovel(id, { structuredOutline: structuredDraftText }),
    onSuccess: invalidateNovelDetail,
  });

  const optimizeOutlineMutation = useMutation({
    mutationFn: (payload: { mode: "full" | "selection"; selectedText?: string }) =>
      optimizeNovelOutlinePreview(id, {
        currentDraft: outlineText,
        instruction: outlineOptimizeInstruction,
        mode: payload.mode,
        selectedText: payload.selectedText,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: (response) => {
      setOutlineOptimizePreview(response.data?.optimizedDraft ?? "");
      setOutlineOptimizeMode(response.data?.mode ?? "full");
      setOutlineOptimizeSourceText(response.data?.selectedText ?? "");
    },
  });

  const optimizeStructuredMutation = useMutation({
    mutationFn: (payload: { mode: "full" | "selection"; selectedText?: string }) =>
      optimizeNovelStructuredOutlinePreview(id, {
        currentDraft: structuredDraftText,
        instruction: structuredOptimizeInstruction,
        mode: payload.mode,
        selectedText: payload.selectedText,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: (response) => {
      setStructuredOptimizePreview(response.data?.optimizedDraft ?? "");
      setStructuredOptimizeMode(response.data?.mode ?? "full");
      setStructuredOptimizeSourceText(response.data?.selectedText ?? "");
    },
  });

  const syncStructuredChaptersMutation = useMutation({
    mutationFn: async (options: StructuredSyncOptions) => {
      const plan = buildStructuredOutlineSyncPlan(structuredVolumes, chapters, options);
      if (plan.preview.createCount === 0 && plan.preview.updateCount === 0 && plan.preview.deleteCount === 0) {
        return plan;
      }

      for (const chapter of plan.creates) {
        await createNovelChapter(id, {
          title: chapter.title,
          order: chapter.order,
          content: "",
          expectation: chapter.summary,
          targetWordCount: chapter.targetWordCount,
          conflictLevel: chapter.conflictLevel,
          revealLevel: chapter.revealLevel,
          mustAvoid: chapter.mustAvoid,
          taskSheet: chapter.taskSheet?.trim() || buildTaskSheetFromStructuredChapter(chapter),
        });
      }

      for (const item of plan.updates) {
        const taskSheet = item.chapter.taskSheet?.trim();
        await updateNovelChapter(id, item.chapterId, {
          title: item.chapter.title,
          order: item.chapter.order,
          expectation: item.chapter.summary,
          targetWordCount: item.chapter.targetWordCount,
          conflictLevel: item.chapter.conflictLevel,
          revealLevel: item.chapter.revealLevel,
          mustAvoid: item.chapter.mustAvoid,
          taskSheet: taskSheet || buildTaskSheetFromStructuredChapter(item.chapter),
          ...(item.clearContent ? { content: "" } : {}),
        });
      }

      for (const item of plan.deletes) {
        await deleteNovelChapter(id, item.chapterId);
      }
      return plan;
    },
    onSuccess: async (plan) => {
      setStructuredMessage(
        `同步完成：新增 ${plan.preview.createCount}，更新 ${plan.preview.updateCount}，删除 ${plan.preview.deleteCount}。`,
      );
      await invalidateNovelDetail();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "章节同步失败。";
      setStructuredMessage(message);
    },
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(id, {
        title: `New Chapter ${chapterCount + 1}`,
        order: chapterCount + 1,
        content: "",
      }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setSelectedChapterId(response.data.id);
      }
      await invalidateNovelDetail();
    },
  });

  const runPipelineMutation = useMutation({
    mutationFn: (override?: Partial<PipelineFormState>) =>
      runNovelPipeline(id, {
        startOrder: override?.startOrder ?? pipelineForm.startOrder,
        endOrder: override?.endOrder ?? pipelineForm.endOrder,
        maxRetries: override?.maxRetries ?? pipelineForm.maxRetries,
        runMode: override?.runMode ?? pipelineForm.runMode,
        autoReview: override?.autoReview ?? pipelineForm.autoReview,
        autoRepair: override?.autoRepair ?? pipelineForm.autoRepair,
        skipCompleted: override?.skipCompleted ?? pipelineForm.skipCompleted,
        qualityThreshold: override?.qualityThreshold ?? pipelineForm.qualityThreshold,
        repairMode: override?.repairMode ?? pipelineForm.repairMode,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setCurrentJobId(response.data.id);
      }
      setPipelineMessage(response.message ?? "Pipeline started.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.pipelineJob(id, response.data?.id ?? "none") });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewNovelChapter(id, selectedChapterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.1,
      }),
    onSuccess: async (response) => {
      setReviewResult(response.data ?? null);
      setPipelineMessage("Chapter reviewed.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    },
  });

  const hookMutation = useMutation({
    mutationFn: () =>
      generateChapterHook(id, {
        chapterId: selectedChapterId || undefined,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async () => {
      setPipelineMessage("Chapter hook generated.");
      await invalidateNovelDetail();
    },
  });

  return {
    saveBasicMutation,
    saveOutlineMutation,
    saveStructuredMutation,
    optimizeOutlineMutation,
    optimizeStructuredMutation,
    syncStructuredChaptersMutation,
    createChapterMutation,
    runPipelineMutation,
    reviewMutation,
    hookMutation,
  };
}
