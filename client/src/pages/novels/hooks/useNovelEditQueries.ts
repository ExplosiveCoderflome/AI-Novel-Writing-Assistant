import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBaseCharacterList } from "@/api/character";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import {
  getChapterAuditReports,
  getChapterPlan,
  getChapterResourceContext,
  getChapterStateSnapshot,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelDetail,
  getNovelPayoffLedger,
  getNovelPipelineJob,
  getNovelQualityReport,
  getNovelVolumeWorkspace,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { getWorldList } from "@/api/world";

export function useNovelEditQueries(input: {
  novelId: string;
  selectedChapterId: string;
  currentJobId: string;
}) {
  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(input.novelId),
    queryFn: () => getNovelDetail(input.novelId),
    enabled: Boolean(input.novelId),
  });

  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(input.novelId),
    queryFn: () => getNovelQualityReport(input.novelId),
    enabled: Boolean(input.novelId),
  });

  const volumeWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.volumeWorkspace(input.novelId),
    queryFn: () => getNovelVolumeWorkspace(input.novelId),
    enabled: Boolean(input.novelId),
  });

  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(input.novelId),
    queryFn: () => getLatestStateSnapshot(input.novelId),
    enabled: Boolean(input.novelId),
  });

  const chapterStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.chapterStateSnapshot(input.novelId, input.selectedChapterId || "none"),
    queryFn: () => getChapterStateSnapshot(input.novelId, input.selectedChapterId),
    enabled: Boolean(input.novelId && input.selectedChapterId),
  });

  const payoffLedgerChapterOrder = useMemo(() => {
    const orders = novelDetailQuery.data?.data?.chapters?.map((chapter) => chapter.order) ?? [];
    return orders.length > 0 ? Math.max(...orders) : undefined;
  }, [novelDetailQuery.data?.data?.chapters]);

  const payoffLedgerQuery = useQuery({
    queryKey: queryKeys.novels.payoffLedger(input.novelId, payoffLedgerChapterOrder),
    queryFn: () => getNovelPayoffLedger(input.novelId, payoffLedgerChapterOrder),
    enabled: Boolean(input.novelId),
  });

  const characterResourcesQuery = useQuery({
    queryKey: queryKeys.novels.characterResources(input.novelId),
    queryFn: () => getNovelCharacterResources(input.novelId),
    enabled: Boolean(input.novelId),
  });

  const chapterResourceContextQuery = useQuery({
    queryKey: queryKeys.novels.characterResourceContext(input.novelId, input.selectedChapterId || "none"),
    queryFn: () => getChapterResourceContext(input.novelId, input.selectedChapterId),
    enabled: Boolean(input.novelId && input.selectedChapterId),
  });

  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(input.novelId, input.selectedChapterId || "none"),
    queryFn: () => getChapterPlan(input.novelId, input.selectedChapterId),
    enabled: Boolean(input.novelId && input.selectedChapterId),
  });

  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(input.novelId, input.selectedChapterId || "none"),
    queryFn: () => getChapterAuditReports(input.novelId, input.selectedChapterId),
    enabled: Boolean(input.novelId && input.selectedChapterId),
  });

  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });

  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });

  const genreOptions = useMemo(
    () => flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []),
    [genreTreeQuery.data?.data],
  );

  const storyModeOptions = useMemo(
    () => flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []),
    [storyModeTreeQuery.data?.data],
  );

  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(input.novelId, input.currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(input.novelId, input.currentJobId),
    enabled: Boolean(input.novelId && input.currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });

  return {
    novelDetailQuery,
    qualityReportQuery,
    volumeWorkspaceQuery,
    latestStateSnapshotQuery,
    chapterStateSnapshotQuery,
    payoffLedgerChapterOrder,
    payoffLedgerQuery,
    characterResourcesQuery,
    chapterResourceContextQuery,
    chapterPlanQuery,
    chapterAuditReportsQuery,
    baseCharacterListQuery,
    worldListQuery,
    genreTreeQuery,
    storyModeTreeQuery,
    genreOptions,
    storyModeOptions,
    pipelineJobQuery,
  };
}
