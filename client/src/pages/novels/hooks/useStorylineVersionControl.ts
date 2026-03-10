import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type { StorylineDiff, StorylineVersion } from "@ai-novel/shared/types/novel";
import {
  activateStorylineVersion,
  analyzeStorylineImpact,
  createStorylineDraft,
  freezeStorylineVersion,
  getStorylineDiff,
  listStorylineVersions,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";

interface StorylineImpactResult {
  novelId: string;
  sourceVersion: number | null;
  affectedCharacters: number;
  affectedChapters: number;
  changedLines: number;
  requiresOutlineRebuild: boolean;
  recommendations: {
    shouldSyncOutline: boolean;
    shouldRecheckCharacters: boolean;
    suggestedStrategy: "rebuild_outline" | "incremental_sync";
  };
}

interface UseStorylineVersionControlArgs {
  novelId: string;
  draftText: string;
  setDraftText: (value: string) => void;
  queryClient: QueryClient;
  invalidateNovelDetail: () => Promise<void>;
}

export function useStorylineVersionControl({
  novelId,
  draftText,
  setDraftText,
  queryClient,
  invalidateNovelDetail,
}: UseStorylineVersionControlArgs) {
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [storylineMessage, setStorylineMessage] = useState("");
  const [diffResult, setDiffResult] = useState<StorylineDiff | null>(null);
  const [impactResult, setImpactResult] = useState<StorylineImpactResult | null>(null);

  const storylineVersionsQuery = useQuery({
    queryKey: queryKeys.novels.storylineVersions(novelId),
    queryFn: () => listStorylineVersions(novelId),
    enabled: Boolean(novelId),
  });

  const storylineVersions = storylineVersionsQuery.data?.data ?? [];
  const selectedVersion = useMemo(
    () => storylineVersions.find((item) => item.id === selectedVersionId),
    [selectedVersionId, storylineVersions],
  );

  useEffect(() => {
    if (!selectedVersionId && storylineVersions.length > 0) {
      setSelectedVersionId(storylineVersions[0].id);
    }
  }, [selectedVersionId, storylineVersions]);

  const invalidateVersionList = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storylineVersions(novelId) });
  };

  const createDraftVersionMutation = useMutation({
    mutationFn: () => createStorylineDraft(novelId, {
      content: draftText,
      baseVersion: selectedVersion?.version,
    }),
    onSuccess: async (response) => {
      const nextVersionId = response.data?.id;
      if (nextVersionId) {
        setSelectedVersionId(nextVersionId);
      }
      setStorylineMessage(response.message ?? "主线草稿版本已创建。");
      await invalidateVersionList();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "创建主线草稿版本失败。";
      setStorylineMessage(message);
    },
  });

  const activateVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("请先选择一个主线版本。");
      }
      return activateStorylineVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setStorylineMessage(response.message ?? "已设为生效主线。");
      await invalidateVersionList();
      await invalidateNovelDetail();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "设置生效版失败。";
      setStorylineMessage(message);
    },
  });

  const freezeVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("请先选择一个主线版本。");
      }
      return freezeStorylineVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setStorylineMessage(response.message ?? "主线版本已冻结。");
      await invalidateVersionList();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "冻结主线版本失败。";
      setStorylineMessage(message);
    },
  });

  const diffMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("请先选择一个主线版本。");
      }
      return getStorylineDiff(novelId, selectedVersionId);
    },
    onSuccess: (response) => {
      setDiffResult(response.data ?? null);
      setStorylineMessage(response.message ?? "主线版本差异已更新。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "加载版本差异失败。";
      setStorylineMessage(message);
    },
  });

  const analyzeDraftImpactMutation = useMutation({
    mutationFn: () => analyzeStorylineImpact(novelId, { content: draftText }),
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setStorylineMessage(response.message ?? "草稿影响分析完成。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "草稿影响分析失败。";
      setStorylineMessage(message);
    },
  });

  const analyzeVersionImpactMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("请先选择一个主线版本。");
      }
      return analyzeStorylineImpact(novelId, { versionId: selectedVersionId });
    },
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setStorylineMessage(response.message ?? "版本影响分析完成。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "版本影响分析失败。";
      setStorylineMessage(message);
    },
  });

  const loadSelectedVersionToDraft = () => {
    if (!selectedVersion) {
      return;
    }
    setDraftText(selectedVersion.content);
    setStorylineMessage(`已加载 V${selectedVersion.version} 到当前草稿。`);
  };

  return {
    storylineMessage,
    storylineVersions,
    selectedVersionId,
    setSelectedVersionId,
    selectedVersion,
    diffResult,
    impactResult,
    isLoadingVersions: storylineVersionsQuery.isLoading,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  };
}
