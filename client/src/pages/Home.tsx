import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { MouseEvent } from "react";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { getTaskOverview } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import {
  canContinueDirector,
  canContinueChapterBatchAutoExecution,
  canEnterChapterExecution,
  getCandidateSelectionLink,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import {
  buildHomeAssetHealthItems,
  buildHomeAttentionItems,
  buildHomeMetrics,
  buildHomeNextAction,
  HOME_NOVEL_FETCH_LIMIT,
  HOME_RECENT_LIMIT,
  selectPrimaryNovel,
  type HomeNovelItem,
} from "./home/homeViewModel";
import { HomeAssetHealth } from "./home/components/HomeAssetHealth";
import { HomeAttentionQueue } from "./home/components/HomeAttentionQueue";
import { HomeNextActionPanel } from "./home/components/HomeNextActionPanel";
import { HomeRecentNovels } from "./home/components/HomeRecentNovels";
import { HomeStatusStrip } from "./home/components/HomeStatusStrip";

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.list(1, HOME_NOVEL_FETCH_LIMIT),
    queryFn: () => getNovelList({ page: 1, limit: HOME_NOVEL_FETCH_LIMIT }),
    staleTime: 30_000,
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: "resume" | "auto_execute_range";
    }) => continueNovelWorkflow(input.taskId, input.mode ? { continuationMode: input.mode } : undefined),
    onSuccess: async (response, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
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
            ? t("gen.pages.Home.gen_73ebdc25")
            : t("gen.pages.Home.gen_bb8020bb"),
      );
    },
  });

  const allNovels = novelQuery.data?.data?.items ?? [];
  const hasNovels = allNovels.length > 0;
  const taskOverview = taskQuery.data?.data ?? null;
  const primaryNovel = useMemo(() => selectPrimaryNovel(allNovels), [allNovels]);
  const recentNovels = useMemo(() => allNovels.slice(0, HOME_RECENT_LIMIT), [allNovels]);
  const nextAction = useMemo(() => buildHomeNextAction(primaryNovel), [primaryNovel]);
  const metrics = useMemo(
    () => buildHomeMetrics({ novels: allNovels, taskOverview }),
    [allNovels, taskOverview],
  );
  const attentionItems = useMemo(
    () => buildHomeAttentionItems({ novels: allNovels, taskOverview }),
    [allNovels, taskOverview],
  );
  const assetHealthItems = useMemo(
    () => buildHomeAssetHealthItems(allNovels),
    [allNovels],
  );

  const stopCardClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const openNovelEditor = (novelId: string) => {
    navigate(`/novels/${novelId}/edit`);
  };

  const renderNovelPrimaryAction = (
    novel: HomeNovelItem,
    options?: {
      size?: "default" | "sm" | "lg";
      stopPropagation?: boolean;
    },
  ) => {
    const { size = "sm", stopPropagation = false } = options ?? {};
    const task = novel.latestAutoDirectorTask ?? null;
    const isWorkflowPending = continueWorkflowMutation.isPending
      && continueWorkflowMutation.variables?.taskId === task?.id;

    const handleActionClick = (event: MouseEvent<HTMLElement>) => {
      if (stopPropagation) {
        stopCardClick(event);
      }
    };

    if (canContinueChapterBatchAutoExecution(task)) {
      return (
        <Button
          size={size}
          onClick={(event) => {
            handleActionClick(event);
            if (!task) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: task.id,
              mode: "auto_execute_range",
            });
          }}
          disabled={isWorkflowPending}
        >
          {isWorkflowPending ? t("gen.pages.Home.gen_eddf5894") : (task?.resumeAction ?? `继续自动执行${task?.executionScopeLabel ?? t("gen.pages.Home.gen_d7432bb5")}`)}
        </Button>
      );
    }

    if (canContinueDirector(task)) {
      return (
        <Button
          size={size}
          onClick={(event) => {
            handleActionClick(event);
            if (!task) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: task.id,
            });
          }}
          disabled={isWorkflowPending}
        >
          {isWorkflowPending ? t("gen.pages.Home.gen_95ee3e92") : (task?.resumeAction ?? t("gen.pages.Home.gen_1f32f18b"))}
        </Button>
      );
    }

    if (requiresCandidateSelection(task)) {
      return (
        <Button asChild size={size}>
          <Link
            to={getCandidateSelectionLink(task!.id)}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            {task!.resumeAction ?? t("gen.pages.Home.gen_4763a24b")}
          </Link>
        </Button>
      );
    }

    if (canEnterChapterExecution(task)) {
      return (
        <Button asChild size={size}>
          <Link
            to={`/novels/${novel.id}/edit`}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            进入章节执行
          </Link>
        </Button>
      );
    }

    if (task) {
      return (
        <Button asChild size={size}>
          <Link
            to={`/novels/${novel.id}/edit?directorTaskId=${task.id}`}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            查看推进状态
          </Link>
        </Button>
      );
    }

    return (
      <Button asChild size={size}>
        <Link
          to={`/novels/${novel.id}/edit`}
          onClick={stopPropagation ? stopCardClick : undefined}
        >
          编辑小说
        </Link>
      </Button>
    );
  };

  return (
    <div className="home-workbench space-y-6">
      <HomeNextActionPanel
        action={nextAction}
        primaryNovel={primaryNovel}
        loading={novelQuery.isPending}
        error={novelQuery.isError}
        onRetry={() => void novelQuery.refetch()}
        renderNovelPrimaryAction={renderNovelPrimaryAction}
      />

      <HomeStatusStrip
        metrics={metrics}
        pending={novelQuery.isPending || taskQuery.isPending}
      />

      <div className="home-dashboard-grid grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <HomeAttentionQueue items={attentionItems} hasNovels={hasNovels} />
          <HomeRecentNovels
            novels={recentNovels}
            loading={novelQuery.isPending}
            error={novelQuery.isError}
            onRetry={() => void novelQuery.refetch()}
            onOpenNovel={openNovelEditor}
            onStopCardClick={stopCardClick}
            renderNovelPrimaryAction={renderNovelPrimaryAction}
          />
        </div>

        <div className="space-y-4">
          <HomeAssetHealth items={assetHealthItems} showStarterActions={hasNovels} />
        </div>
      </div>
    </div>
  );
}
