import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDirectorBookAutomationProjection } from "@/api/novelDirector";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { deleteNovel, downloadNovelExport, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import AICockpit from "@/components/autoDirector/AICockpit";
import { Button } from "@/components/ui/button";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import {
  getDirectorCockpitActionHref,
  getDirectorCockpitContinuationMode,
  isDirectorCockpitContinuationAction,
} from "@/lib/directorCockpitActions";
import { useTaskRecovery } from "@/components/layout/TaskRecoveryContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NovelListEmptyState } from "./components/list/NovelListEmptyState";
import { NovelListFilterBar } from "./components/list/NovelListFilterBar";
import { NovelListHeader } from "./components/list/NovelListHeader";
import { NovelListPagination } from "./components/list/NovelListPagination";
import { NovelListSkeleton } from "./components/list/NovelListSkeleton";
import { NovelProjectCard } from "./components/list/NovelProjectCard";
import {
  buildNovelListSummary,
  filterNovelList,
  NOVEL_LIST_PAGE_SIZE,
  type StatusFilter,
  type WritingModeFilter,
} from "./components/list/novelListViewModel";

function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function NovelList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [writingMode, setWritingMode] = useState<WritingModeFilter>("all");
  const [cockpitNovelId, setCockpitNovelId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { candidateCount: recoveryCandidateCount, openDialog: openRecoveryDialog } = useTaskRecovery();

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(page, NOVEL_LIST_PAGE_SIZE),
    queryFn: () => getNovelList({ page, limit: NOVEL_LIST_PAGE_SIZE }),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const items = query.state.data?.data?.items ?? [];
      return items.some((novel) => {
        const task = novel.latestAutoDirectorTask;
        return task?.status === "queued" || task?.status === "running" || task?.status === "waiting_approval";
      })
        ? 4000
        : false;
    },
  });

  const cockpitProjectionQuery = useQuery({
    queryKey: cockpitNovelId
      ? queryKeys.novels.directorBookAutomation(cockpitNovelId)
      : ["novels", "director-book-automation", "idle"],
    queryFn: () => getDirectorBookAutomationProjection(cockpitNovelId ?? ""),
    enabled: Boolean(cockpitNovelId),
    staleTime: 10_000,
    refetchInterval: (query) => {
      return query.state.data?.data?.projection.displayState === "processing" ? 4000 : false;
    },
  });

  const deleteNovelMutation = useMutation({
    mutationFn: (id: string) => deleteNovel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      toast.success(t("gen.pages.novels.NovelList.gen_fc09ee9d"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("gen.pages.novels.NovelList.gen_8ece8c38"));
    },
  });

  const downloadNovelMutation = useMutation({
    mutationFn: (input: { novelId: string; novelTitle: string }) => downloadNovelExport(
      input.novelId,
      "txt",
      "full",
      input.novelTitle,
    ),
    onSuccess: ({ blob, fileName }) => {
      createDownload(blob, fileName);
      toast.success(t("gen.pages.novels.NovelList.gen_70576156"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("gen.pages.novels.NovelList.gen_45b8252a"));
    },
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: DirectorContinuationMode;
    }) => continueNovelWorkflow(input.taskId, input.mode ? { continuationMode: input.mode } : undefined),
    onSuccess: async (response, input) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ];
      if (cockpitNovelId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(cockpitNovelId) }),
        );
      }
      await Promise.all(invalidations);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: input.mode,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error, input) => {
      toast.error(
        error instanceof Error
          ? error.message
          : input.mode === "auto_execute_range"
            ? t("gen.pages.novels.NovelList.gen_73ebdc25")
            : t("gen.pages.novels.NovelList.gen_bb8020bb"),
      );
    },
  });

  const allNovels = novelListQuery.data?.data?.items ?? [];
  const totalPages = novelListQuery.data?.data?.totalPages ?? 1;
  const totalNovels = novelListQuery.data?.data?.total ?? 0;
  const selectedCockpitNovel = allNovels.find((item) => item.id === cockpitNovelId) ?? null;
  const cockpitProjection = cockpitProjectionQuery.data?.data?.projection ?? null;

  const novels = useMemo(() => filterNovelList({
    novels: allNovels,
    status,
    writingMode,
  }), [allNovels, status, writingMode]);
  const summary = useMemo(() => buildNovelListSummary(allNovels), [allNovels]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleDelete = (novelId: string, title: string) => {
    const confirmed = window.confirm(`确认删除《${title}》吗？该操作会直接删除当前小说。`);
    if (!confirmed) {
      return;
    }
    deleteNovelMutation.mutate(novelId);
  };

  const openNovelEditor = (novelId: string) => {
    navigate(`/novels/${novelId}/edit`);
  };

  const handleCockpitAction = (
    projection: DirectorBookAutomationProjection,
    action: DirectorBookAutomationAction,
  ) => {
    const taskId = action.commandPayload?.taskId ?? action.target.taskId ?? projection.latestTask?.id;
    if (taskId && isDirectorCockpitContinuationAction(action)) {
      continueWorkflowMutation.mutate({
        taskId,
        mode: getDirectorCockpitContinuationMode(action),
      });
      return;
    }
    setCockpitNovelId(null);
    navigate(getDirectorCockpitActionHref(projection, action));
  };

  return (
    <div className="space-y-5">
      <NovelListHeader
        page={page}
        totalPages={totalPages}
        totalNovels={totalNovels}
        recoveryCandidateCount={recoveryCandidateCount}
        summary={summary}
        onOpenRecovery={openRecoveryDialog}
      />

      <NovelListFilterBar
        status={status}
        writingMode={writingMode}
        onStatusChange={setStatus}
        onWritingModeChange={setWritingMode}
      />

      {novelListQuery.isPending ? (
        <NovelListSkeleton />
      ) : novelListQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("gen.pages.novels.NovelList.gen_d7f76120")}</CardTitle>
            <CardDescription>{t("gen.pages.novels.NovelList.gen_6ad34b4c")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void novelListQuery.refetch()}>重新加载</Button>
          </CardContent>
        </Card>
      ) : novels.length === 0 ? (
        <NovelListEmptyState hasAnyNovel={allNovels.length > 0} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {novels.map((novel) => (
              <NovelProjectCard
                key={novel.id}
                novel={novel}
                continuePendingTaskId={continueWorkflowMutation.isPending
                  ? continueWorkflowMutation.variables?.taskId ?? null
                  : null}
                downloadPendingNovelId={downloadNovelMutation.isPending
                  ? downloadNovelMutation.variables?.novelId ?? null
                  : null}
                deletePendingNovelId={deleteNovelMutation.isPending ? deleteNovelMutation.variables ?? null : null}
                onOpenNovel={openNovelEditor}
                onOpenCockpit={setCockpitNovelId}
                onContinueWorkflow={continueWorkflowMutation.mutate}
                onDownload={downloadNovelMutation.mutate}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <NovelListPagination
            page={page}
            totalPages={totalPages}
            isFetching={novelListQuery.isFetching}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog
        open={Boolean(cockpitNovelId)}
        onOpenChange={(open) => {
          if (!open) {
            setCockpitNovelId(null);
          }
        }}
      >
        <AppDialogContent
          className="max-w-2xl"
          title={t("gen.pages.novels.NovelList.aiCockpit")}
          description={
            selectedCockpitNovel?.title
              ? `查看《${selectedCockpitNovel.title}》的 AI 推进状态和下一步动作。`
              : t("gen.pages.novels.NovelList.gen_309ad2d0")
          }
        >
          {cockpitProjectionQuery.isPending ? (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              读取这本书的 AI 状态...
            </div>
          ) : cockpitProjectionQuery.isError ? (
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{t("gen.pages.novels.NovelList.gen_59ae355e")}</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void cockpitProjectionQuery.refetch()}
              >
                重新读取
              </Button>
            </div>
          ) : cockpitProjection ? (
            <AICockpit
              projection={cockpitProjection}
              mode="focusedNovel"
              isActionPending={continueWorkflowMutation.isPending}
              onAction={handleCockpitAction}
              onOpenNovel={(projection) => {
                setCockpitNovelId(null);
                navigate(projection.focusNovel.href);
              }}
            />
          ) : (
            <AICockpit fallbackSummary={t("gen.pages.novels.NovelList.gen_1f7096a6")} />
          )}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
