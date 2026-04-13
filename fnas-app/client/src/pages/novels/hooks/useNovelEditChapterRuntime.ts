import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { ReviewIssue, Chapter, StoryStateSnapshot, StoryPlan } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { auditNovelChapter, generateChapterPlan, replanNovel } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import type { ChapterExecutionStrategy } from "../chapterExecution.utils";
import type { ChapterReviewResult } from "../chapterPlanning.shared";
import { useChapterExecutionActions } from "./useChapterExecutionActions";

interface StreamHandle {
  start: (path: string, payload: Record<string, unknown>) => Promise<void> | void;
  abort: () => void;
  isStreaming: boolean;
  content: string;
}

interface UseNovelEditChapterRuntimeArgs {
  novelId: string;
  llm: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  };
  selectedChapterId: string;
  selectedChapter?: Chapter;
  chapterStrategy: ChapterExecutionStrategy;
  reviewResult: ChapterReviewResult | null;
  openAuditIssueIds: string[];
  queryClient: QueryClient;
  invalidateNovelDetail: () => Promise<void>;
  setChapterOperationMessage: (value: string) => void;
  setReviewResult: (value: ChapterReviewResult | null) => void;
  setRepairBeforeContent: (value: string) => void;
  setRepairAfterContent: (value: string) => void;
  setActiveChapterStream: (value: { chapterId: string; chapterLabel: string } | null) => void;
  setActiveRepairStream: (value: { chapterId: string; chapterLabel: string } | null) => void;
  chapterSSE: StreamHandle;
  repairSSE: StreamHandle;
}

export function useNovelEditChapterRuntime({
  novelId,
  llm,
  selectedChapterId,
  selectedChapter,
  chapterStrategy,
  reviewResult,
  openAuditIssueIds,
  queryClient,
  invalidateNovelDetail,
  setChapterOperationMessage,
  setReviewResult,
  setRepairBeforeContent,
  setRepairAfterContent,
  setActiveChapterStream,
  setActiveRepairStream,
  chapterSSE,
  repairSSE,
}: UseNovelEditChapterRuntimeArgs) {
  const generateChapterPlanMutation = useMutation({
    mutationFn: () => generateChapterPlan(novelId, selectedChapterId, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async () => {
      setChapterOperationMessage("章节计划已生成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, selectedChapterId) });
    },
  });

  const replanChapterMutation = useMutation({
    mutationFn: () => replanNovel(novelId, {
      chapterId: selectedChapterId,
      reason: "manual_replan_from_chapter_tab",
      triggerType: "manual",
      sourceIssueIds: openAuditIssueIds,
      windowSize: 3,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      const affectedOrders = response.data?.affectedChapterOrders ?? [];
      const affectedChapterIds = response.data?.affectedChapterIds ?? [];
      setChapterOperationMessage(
        affectedOrders.length > 0
          ? `已重规划第 ${affectedOrders.join("、")} 章。`
          : "章节已完成重规划。",
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(novelId) });
      await Promise.all(
        affectedChapterIds.map((chapterId) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, chapterId) })),
      );
      if (selectedChapterId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, selectedChapterId) });
      }
    },
  });

  const fullAuditMutation = useMutation({
    mutationFn: () => auditNovelChapter(novelId, selectedChapterId, "full", {
      provider: llm.provider,
      model: llm.model,
      temperature: 0.1,
    }),
    onSuccess: async (response) => {
      setReviewResult(response.data ?? null);
      setChapterOperationMessage("完整审计已完成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, selectedChapterId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(novelId) });
    },
  });

  const handleGenerateSelectedChapter = () => {
    if (!selectedChapter) {
      return;
    }
    setActiveChapterStream({
      chapterId: selectedChapter.id,
      chapterLabel: `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}`,
    });
    void chapterSSE.start(`/novels/${novelId}/chapters/${selectedChapter.id}/generate`, {
      provider: llm.provider,
      model: llm.model,
      previousChaptersSummary: [],
    });
  };

  const handleAbortChapterStream = () => {
    chapterSSE.abort();
    setChapterOperationMessage("已停止当前章节生成，你可以保留当前输出继续查看，或重新发起本章写作。");
  };

  const handleAbortRepair = () => {
    repairSSE.abort();
    setActiveRepairStream(null);
    setChapterOperationMessage("已停止当前章节修复，你可以先查看当前修复结果，再决定是否继续。");
  };

  const startChapterRepair = (issues: ReviewIssue[]) => {
    if (!selectedChapterId) {
      setChapterOperationMessage("请先选择章节。");
      return;
    }
    setRepairBeforeContent(selectedChapter?.content ?? "");
    setRepairAfterContent("");
    setActiveRepairStream({
      chapterId: selectedChapterId,
      chapterLabel: selectedChapter ? `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}` : "当前章节",
    });
    void repairSSE.start(`/novels/${novelId}/chapters/${selectedChapterId}/repair`, {
      provider: llm.provider,
      model: llm.model,
      reviewIssues: issues,
      auditIssueIds: openAuditIssueIds,
    });
  };

  const chapterExecutionActions = useChapterExecutionActions({
    novelId,
    selectedChapterId,
    selectedChapter,
    strategy: chapterStrategy,
    reviewIssues: reviewResult?.issues ?? [],
    onGenerateChapter: handleGenerateSelectedChapter,
    onReviewChapter: () => fullAuditMutation.mutate(),
    onStartRepair: startChapterRepair,
    onMessage: setChapterOperationMessage,
    invalidateNovelDetail,
  });

  return {
    generateChapterPlanMutation,
    replanChapterMutation,
    fullAuditMutation,
    handleGenerateSelectedChapter,
    handleAbortChapterStream,
    handleAbortRepair,
    startChapterRepair,
    chapterExecutionActions,
  };
}
