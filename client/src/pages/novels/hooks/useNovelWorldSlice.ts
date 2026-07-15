import { useState } from "react";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type { StoryWorldSliceOverrides } from "@ai-novel/shared/types/storyWorldSlice";
import type {
  NovelWorldGenerateInput,
  NovelWorldImportInput,
  NovelWorldManualInput,
  NovelWorldSaveToLibraryInput,
  NovelWorldSyncInput,
} from "@ai-novel/shared/types/novelWorld";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { queryKeys } from "@/api/queryKeys";
import {
  getNovelWorld,
  getNovelWorldSlice,
  getNovelWorldSyncDiff,
  createManualNovelWorld,
  generateNovelWorldFromTheme,
  importNovelWorldFromLibrary,
  refreshNovelWorldSlice,
  saveNovelWorldToLibrary,
  syncNovelWorldWithLibrary,
  updateNovelWorldSliceOverrides,
} from "@/api/novelWorldSlice";

interface UseNovelWorldSliceOptions {
  novelId: string;
  enabled?: boolean;
  llm: {
    provider: LLMProvider;
    model: string;
    temperature: number;
  };
  queryClient: QueryClient;
  onNovelWorldImported?: (worldId: string) => void;
}

export function useNovelWorldSlice({
  novelId,
  enabled = true,
  llm,
  queryClient,
  onNovelWorldImported,
}: UseNovelWorldSliceOptions) {
  const [worldSliceMessage, setWorldSliceMessage] = useState("");

  const novelWorldQuery = useQuery({
    queryKey: queryKeys.novels.novelWorld(novelId),
    queryFn: () => getNovelWorld(novelId),
    enabled: Boolean(novelId && enabled),
  });

  const worldSliceQuery = useQuery({
    queryKey: queryKeys.novels.worldSlice(novelId),
    queryFn: () => getNovelWorldSlice(novelId),
    enabled: Boolean(novelId && enabled),
  });

  const refreshWorldSliceMutation = useMutation({
    mutationFn: () => refreshNovelWorldSlice(novelId, {
      builderMode: "manual_refresh",
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async () => {
      setWorldSliceMessage("已重新整理这本书会用到的世界设定。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
    },
  });

  const saveWorldSliceOverridesMutation = useMutation({
    mutationFn: (payload: StoryWorldSliceOverrides) => updateNovelWorldSliceOverrides(novelId, payload),
    onSuccess: async () => {
      setWorldSliceMessage("已保存这本书的世界设定保留项。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) });
    },
  });

  const syncDiffQuery = useQuery({
    queryKey: queryKeys.novels.novelWorldSyncDiff(novelId),
    queryFn: () => getNovelWorldSyncDiff(novelId),
    enabled: Boolean(
      novelId
      && enabled
      && novelWorldQuery.data?.data?.novelWorld?.sourceWorldId,
    ),
  });

  const importNovelWorldMutation = useMutation({
    mutationFn: (payload: NovelWorldImportInput) => importNovelWorldFromLibrary(novelId, payload),
    onSuccess: async (_response, payload) => {
      onNovelWorldImported?.(payload.worldId);
      setWorldSliceMessage("已导入为这本书的世界，后续会按本书内容重新整理可用设定。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorld(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      ]);
    },
  });

  const generateNovelWorldMutation = useMutation({
    mutationFn: (payload: NovelWorldGenerateInput) => generateNovelWorldFromTheme(novelId, payload),
    onSuccess: async () => {
      setWorldSliceMessage("已根据本书主题生成世界，并保存到世界库供后续复用。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorld(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all }),
      ]);
    },
  });

  const createManualNovelWorldMutation = useMutation({
    mutationFn: (payload: NovelWorldManualInput) => createManualNovelWorld(novelId, payload),
    onSuccess: async () => {
      setWorldSliceMessage("本书自定义世界已创建并保存到世界库，可以继续补充规则、势力和故事舞台。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorld(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all }),
      ]);
    },
  });

  const saveNovelWorldToLibraryMutation = useMutation({
    mutationFn: (payload: NovelWorldSaveToLibraryInput) => saveNovelWorldToLibrary(novelId, payload),
    onSuccess: async () => {
      setWorldSliceMessage("本书世界已保存到世界库。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorld(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorldSyncDiff(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all }),
      ]);
    },
  });

  const syncNovelWorldMutation = useMutation({
    mutationFn: (payload: NovelWorldSyncInput) => syncNovelWorldWithLibrary(novelId, payload),
    onSuccess: async (_response, payload) => {
      setWorldSliceMessage(
        payload.direction === "none"
          ? "本书世界会保留为独立副本。"
          : payload.direction === "push"
            ? "已将本书世界推送到世界库。"
            : "已从世界库拉取更新到本书世界。",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorld(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.novelWorldSyncDiff(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all }),
      ]);
    },
  });

  return {
    worldSliceMessage,
    setWorldSliceMessage,
    novelWorldView: novelWorldQuery.data?.data ?? null,
    novelWorldSyncDiff: novelWorldQuery.data?.data?.novelWorld?.sourceWorldId ? syncDiffQuery.data?.data ?? null : null,
    worldSliceView: worldSliceQuery.data?.data ?? null,
    isLoadingNovelWorld: novelWorldQuery.isFetching,
    isImportingNovelWorld: importNovelWorldMutation.isPending,
    isGeneratingNovelWorld: generateNovelWorldMutation.isPending,
    isCreatingManualNovelWorld: createManualNovelWorldMutation.isPending,
    isSavingNovelWorldToLibrary: saveNovelWorldToLibraryMutation.isPending,
    isLoadingNovelWorldSyncDiff: syncDiffQuery.isFetching,
    isSyncingNovelWorld: syncNovelWorldMutation.isPending,
    isRefreshingWorldSlice: refreshWorldSliceMutation.isPending || worldSliceQuery.isFetching,
    isSavingWorldSliceOverrides: saveWorldSliceOverridesMutation.isPending,
    importNovelWorld: (payload: NovelWorldImportInput) => importNovelWorldMutation.mutate(payload),
    createManualNovelWorld: (payload: NovelWorldManualInput = {}) => createManualNovelWorldMutation.mutate(payload),
    generateNovelWorld: (payload: NovelWorldGenerateInput) => generateNovelWorldMutation.mutate(payload),
    saveNovelWorldToLibrary: (payload: NovelWorldSaveToLibraryInput = {}) => saveNovelWorldToLibraryMutation.mutate(payload),
    syncNovelWorld: (payload: NovelWorldSyncInput) => syncNovelWorldMutation.mutate(payload),
    refreshWorldSlice: () => refreshWorldSliceMutation.mutate(),
    saveWorldSliceOverrides: (patch: StoryWorldSliceOverrides) => saveWorldSliceOverridesMutation.mutate(patch),
  };
}
