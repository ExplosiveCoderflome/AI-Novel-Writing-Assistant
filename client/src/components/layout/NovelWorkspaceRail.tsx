import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  ListTodo,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { DirectorContinuationMode, DirectorLockScope } from "@ai-novel/shared/types/novelDirector";
import type { VolumePlan } from "@ai-novel/shared/types/novel";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { getNovelDetail, getNovelQualityReport, getNovelVolumeWorkspace } from "@/api/novel";
import { getDirectorBookAutomationProjection, getDirectorRuntimeProjection, getDirectorTaskSnapshot } from "@/api/novelDirector";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DirectorBookAutomationCard from "@/components/autoDirector/DirectorBookAutomationCard";
import NovelAutoDirectorProgressPanel from "@/pages/novels/components/NovelAutoDirectorProgressPanel";
import { shouldShowPinnedBookAutomationProjection } from "@/pages/novels/novelEditAutomationStatus";
import { cn } from "@/lib/utils";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import {
  applyAutoDirectorResetStepReadiness,
  extractAutoDirectorResetStepsFromMeta,
} from "./novelWorkspaceRailState";
import {
  getNovelWorkspaceTabLabel,
  NOVEL_WORKSPACE_FLOW_STEPS,
  normalizeNovelWorkspaceTab,
  tabFromDirectorProgress,
  type NovelWorkspaceFlowTab,
  type NovelWorkspaceTab,
} from "@/pages/novels/novelWorkspaceNavigation";

interface NovelWorkspaceRailProps {
  novelId: string;
  chapterId?: string;
  collapsed: boolean;
  onToggle: () => void;
  onSwitchToProjectNav?: () => void;
}

function hasVolumePlanContent(volume: VolumePlan): boolean {
  return [
    volume.summary,
    volume.openingHook,
    volume.mainPromise,
    volume.primaryPressureSource,
    volume.coreSellingPoint,
    volume.escalationMode,
    volume.protagonistChange,
    volume.midVolumeRisk,
    volume.climax,
    volume.payoffType,
    volume.nextVolumeHook,
    volume.resetPoint,
  ].some((value) => Boolean(value?.trim())) || volume.openPayoffs.length > 0;
}

function hasChapterPlanContent(chapter: VolumePlan["chapters"][number]): boolean {
  return Boolean(chapter.summary?.trim())
    || Boolean(chapter.purpose?.trim())
    || Boolean(chapter.mustAvoid?.trim())
    || Boolean(chapter.taskSheet?.trim())
    || typeof chapter.conflictLevel === "number"
    || typeof chapter.revealLevel === "number"
    || typeof chapter.targetWordCount === "number"
    || chapter.payoffRefs.length > 0;
}

function formatTaskStatus(status: string | null | undefined): string {
  if (status === "running") return "进行中";
  if (status === "queued") return "排队中";
  if (status === "waiting_approval") return "待审核";
  if (status === "failed") return "异常";
  if (status === "succeeded") return "已完成";
  return "空闲";
}

function shouldShowBookAutomationProjectionWithoutActiveTask(input: {
  status: string | null | undefined;
  latestTaskId?: string | null;
  requestedDirectorTaskId?: string | null;
}): boolean {
  if (
    input.status === "queued"
    || input.status === "running"
    || input.status === "waiting_approval"
    || input.status === "waiting_recovery"
    || input.status === "blocked"
  ) {
    return true;
  }
  return shouldShowPinnedBookAutomationProjection({
    projection: input.latestTaskId
      ? {
        status: input.status === "completed"
          || input.status === "cancelled"
          || input.status === "failed"
          ? input.status
          : "failed",
        latestTask: { id: input.latestTaskId },
      }
      : null,
    directorTaskId: input.requestedDirectorTaskId,
  });
}

function resolveDirectorContinueMode(task: Pick<
  UnifiedTaskDetail,
  "checkpointType" | "currentItemKey" | "currentStage" | "pendingManualRecovery"
> | null | undefined): DirectorContinuationMode {
  if (task?.pendingManualRecovery) {
    return "resume";
  }
  if (
    task?.checkpointType === "replan_required"
    || task?.currentItemKey === "quality_repair"
    || task?.currentStage?.includes("质量")
  ) {
    return "skip_quality_repair";
  }
  if (task?.checkpointType === "chapter_batch_ready") {
    return "auto_execute_range";
  }
  return "resume";
}

export default function NovelWorkspaceRail(props: NovelWorkspaceRailProps) {
  const { novelId, chapterId = "", collapsed, onToggle, onSwitchToProjectNav } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const requestedDirectorTaskId = searchParams.get("directorTaskId")?.trim() || "";
  const activeTab = useMemo<NovelWorkspaceTab>(() => {
    if (location.pathname.includes("/chapters/")) {
      return "chapter";
    }
    return normalizeNovelWorkspaceTab(searchParams.get("stage"));
  }, [location.pathname, searchParams]);
  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(novelId),
    queryFn: () => getNovelDetail(novelId),
    enabled: Boolean(novelId),
  });
  const volumeWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.volumeWorkspace(novelId),
    queryFn: () => getNovelVolumeWorkspace(novelId),
    enabled: Boolean(novelId),
  });
  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(novelId),
    queryFn: () => getNovelQualityReport(novelId),
    enabled: Boolean(novelId),
  });
  const activeTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(novelId),
    queryFn: () => getActiveAutoDirectorTask(novelId),
    enabled: Boolean(novelId),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")
        ? 4000
        : false;
    },
  });
  const bookAutomationQuery = useQuery({
    queryKey: queryKeys.novels.directorBookAutomation(novelId),
    queryFn: () => getDirectorBookAutomationProjection(novelId),
    enabled: Boolean(novelId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.projection.status;
      return status === "queued" || status === "running" || status === "waiting_approval" ? 4000 : false;
    },
  });

  const novelDetail = novelDetailQuery.data?.data;
  const workspace = volumeWorkspaceQuery.data?.data;
  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const latestActiveTask = activeTaskQuery.isFetchedAfterMount
    ? activeTaskQuery.data?.data ?? null
    : null;
  const activeTask = latestActiveTask?.status === "cancelled" ? null : latestActiveTask;
  const latestBookAutomationProjection = bookAutomationQuery.data?.data?.projection ?? null;
  const bookAutomationProjection = latestBookAutomationProjection?.status === "cancelled"
    ? null
    : latestBookAutomationProjection;
  const visibleBookAutomationProjection = useMemo(() => {
    if (!bookAutomationProjection) {
      return null;
    }
    if (activeTask) {
      return bookAutomationProjection;
    }
    return shouldShowBookAutomationProjectionWithoutActiveTask({
      status: bookAutomationProjection.status,
      latestTaskId: bookAutomationProjection.latestTask?.id ?? null,
      requestedDirectorTaskId,
    })
      ? bookAutomationProjection
      : null;
  }, [activeTask, bookAutomationProjection, requestedDirectorTaskId]);
  const runtimeProjectionQuery = useQuery({
    queryKey: queryKeys.tasks.directorRuntime(activeTask?.id ?? "none"),
    queryFn: () => getDirectorRuntimeProjection(activeTask?.id as string),
    enabled: Boolean(activeTask?.id),
    retry: false,
    refetchInterval: () => (
      activeTask && (activeTask.status === "queued" || activeTask.status === "running" || activeTask.status === "waiting_approval")
        ? 4000
        : false
    ),
  });
  const runtimeSnapshotQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(activeTask?.id ?? "none"),
    queryFn: () => getDirectorTaskSnapshot(activeTask?.id as string),
    enabled: Boolean(activeTask?.id),
    retry: false,
    refetchInterval: () => (
      activeTask && (activeTask.status === "queued" || activeTask.status === "running" || activeTask.status === "waiting_approval")
        ? 4000
        : false
    ),
  });
  const runtimeProjection = runtimeProjectionQuery.data?.data?.projection ?? null;
  const runtimeSnapshot = runtimeSnapshotQuery.data?.data?.snapshot ?? null;
  const resetSteps = useMemo(
    () => extractAutoDirectorResetStepsFromMeta(activeTask?.meta),
    [activeTask?.meta],
  );
  const reviewScope = useMemo(() => {
    const rawMeta = activeTask?.meta;
    if (!rawMeta || typeof rawMeta !== "object") {
      return null;
    }
    const directorSession = (rawMeta as { directorSession?: { reviewScope?: DirectorLockScope | null } }).directorSession;
    return directorSession?.reviewScope ?? null;
  }, [activeTask?.meta]);
  const workflowCurrentTab = useMemo(
    () => tabFromDirectorProgress({
      currentStage: activeTask?.currentStage,
      currentItemKey: activeTask?.currentItemKey,
      checkpointType: activeTask?.checkpointType,
      reviewScope,
      status: activeTask?.status,
    }),
    [
      activeTask?.checkpointType,
      activeTask?.currentItemKey,
      activeTask?.currentStage,
      reviewScope,
    ],
  );

  const stepReadiness = useMemo(() => {
    const basicReady = Boolean(novelDetail?.title?.trim());
    const outlineReady = Boolean(workspace?.strategyPlan) || (workspace?.volumes ?? []).some((volume) => hasVolumePlanContent(volume));
    const structuredReady = (workspace?.beatSheets ?? []).some((sheet) => sheet.beats.length > 0)
      || (workspace?.volumes ?? []).some((volume) => volume.chapters.some((chapter) => hasChapterPlanContent(chapter)));
    const chapterReady = (novelDetail?.chapters ?? []).some((chapter) => Boolean(chapter.content?.trim()));
    const characterReady = (novelDetail?.characters ?? []).length > 0;
    const storyMacroReady = characterReady
      || outlineReady
      || structuredReady
      || chapterReady
      || Boolean(novelDetail?.bible)
      || Boolean((novelDetail?.plotBeats ?? []).length);
    const pipelineReady = Boolean(qualitySummary && qualitySummary.overall >= 75);

    return applyAutoDirectorResetStepReadiness({
      basic: basicReady,
      story_macro: storyMacroReady,
      character: characterReady,
      outline: outlineReady,
      structured: structuredReady,
      chapter: chapterReady,
      pipeline: pipelineReady,
    } satisfies Record<NovelWorkspaceFlowTab, boolean>, resetSteps);
  }, [novelDetail?.bible, novelDetail?.chapters, novelDetail?.characters, novelDetail?.plotBeats, qualitySummary, resetSteps, workspace]);

  const workflowIndex = workflowCurrentTab
    ? NOVEL_WORKSPACE_FLOW_STEPS.findIndex((item) => item.key === workflowCurrentTab)
    : -1;

  const stepStates = useMemo(() => (
    NOVEL_WORKSPACE_FLOW_STEPS.map((step, index) => {
      const isSelected = activeTab === step.key;
      const isWorkflowCurrent = workflowCurrentTab === step.key;
      const isReset = resetSteps.has(step.key);
      const isDone = !isReset && (
        workflowIndex >= 0
          ? index < workflowIndex
          : stepReadiness[step.key]
      );
      const statusLabel = isWorkflowCurrent
        ? isSelected ? "当前步骤" : "流程中"
        : isSelected
          ? "查看中"
          : isDone
            ? "已完成"
            : "待推进";

      return {
        ...step,
        isSelected,
        isWorkflowCurrent,
        isDone,
        statusLabel,
      };
    })
  ), [activeTab, resetSteps, stepReadiness, workflowCurrentTab, workflowIndex]);

  const completedStepCount = stepStates.filter((item) => item.isDone).length;
  const workflowProgressCount = workflowIndex >= 0 ? workflowIndex + 1 : completedStepCount;
  const novelTitle = novelDetail?.title?.trim() || "小说创作工作台";
  const runtimeActionSummary = runtimeProjection?.nextActionLabel
    ? `下一步：${runtimeProjection.nextActionLabel}`
    : null;
  const runtimeSummary = runtimeProjection?.requiresUserAction
    ? `需要处理：${runtimeProjection.blockedReason ?? runtimeProjection.lastEventSummary ?? runtimeProjection.currentLabel ?? "请先查看当前停留点"}`
    : runtimeSnapshot?.displayState.currentAction?.trim()
      || runtimeProjection?.headline
      || runtimeActionSummary
      || runtimeProjection?.currentLabel
      || runtimeProjection?.lastEventSummary
      || runtimeProjection?.blockedReason
      || null;
  const cockpitSummary = activeTask
    ? runtimeSummary
      || (activeTask.status === "failed"
      ? activeTask.lastError || "后台任务已中断，可打开执行详情查看原因。"
      : activeTask.status === "waiting_approval"
        ? `等待处理：${getNovelWorkspaceTabLabel(workflowCurrentTab ?? activeTab)}`
      : activeTask.currentItemLabel || `AI 正在推进 ${getNovelWorkspaceTabLabel(workflowCurrentTab ?? activeTab)}`)
    : "当前没有后台导演任务，可以直接继续手动创作。";
  const cockpitProjection = useMemo(() => {
    if (!visibleBookAutomationProjection || !runtimeSummary?.trim()) {
      return visibleBookAutomationProjection;
    }
    const summary = runtimeSummary.trim();
    return {
      ...visibleBookAutomationProjection,
      userHeadline: summary,
      headline: summary,
      detail: summary,
      automationSummary: summary,
    };
  }, [runtimeSummary, visibleBookAutomationProjection]);

  const goToTab = (tab: NovelWorkspaceTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("stage", tab);
    if (tab === "chapter" && chapterId) {
      next.set("chapterId", chapterId);
    } else if (tab !== "chapter") {
      next.delete("chapterId");
    }
    navigate(`/novels/${novelId}/edit?${next.toString()}`);
  };

  const openTaskCenter = () => {
    setProgressDialogOpen(false);
    const taskId = activeTask?.id ?? visibleBookAutomationProjection?.latestTask?.id;
    if (taskId) {
      const next = new URLSearchParams(searchParams);
      next.set("directorTaskId", taskId);
      next.delete("taskId");
      next.set("taskPanel", "1");
      navigate(`/novels/${novelId}/edit?${next.toString()}`);
      return;
    }
    navigate(`/novels/${novelId}/edit`);
  };

  const openProgressDialog = () => {
    if (!activeTask?.id) {
      openTaskCenter();
      return;
    }
    setProgressDialogOpen(true);
  };

  const progressDialogMode = activeTask?.status === "failed" || activeTask?.status === "cancelled"
    ? "execution_failed"
    : "execution_progress";
  const continueDirectorMutation = useMutation({
    mutationFn: async () => {
      if (!activeTask?.id) {
        throw new Error("当前没有可继续的自动导演任务。");
      }
      return continueNovelWorkflow(activeTask.id, {
        continuationMode: resolveDirectorContinueMode(activeTask),
      });
    },
    onSuccess: async (response) => {
      const persistedTaskId = response.data?.taskId ?? activeTask?.id ?? "";
      if (persistedTaskId) {
        const next = new URLSearchParams(searchParams);
        next.set("directorTaskId", persistedTaskId);
        next.delete("taskId");
        navigate(`/novels/${novelId}/edit?${next.toString()}`, { replace: true });
      }
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail("novel_workflow", activeTask?.id ?? "") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(activeTask?.id ?? "") }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: resolveDirectorContinueMode(activeTask),
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "继续自动导演失败。");
    },
  });

  return (
    <>
      <aside
        className={cn(
          "border-r bg-background/95 backdrop-blur transition-[width] duration-200",
          collapsed ? "w-[84px]" : "w-[248px]",
        )}
      >
        <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-3">
          <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "justify-between")}>
            {!collapsed ? (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                  <BookOpenText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    创作工作台
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">{novelTitle}</div>
                </div>
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onToggle}
              aria-label={collapsed ? "展开创作导航" : "收起创作导航"}
              title={collapsed ? "展开创作导航" : "收起创作导航"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

        {!collapsed ? (
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => navigate("/novels")}
          >
            返回小说列表
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="mx-auto h-9 w-9"
            onClick={() => navigate("/novels")}
            title="返回小说列表"
            aria-label="返回小说列表"
          >
            <BookOpenText className="h-4 w-4" />
          </Button>
        )}

        {!collapsed ? (
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>流程：{getNovelWorkspaceTabLabel(workflowCurrentTab ?? activeTab)}</span>
              <span>{workflowProgressCount}/{NOVEL_WORKSPACE_FLOW_STEPS.length}</span>
            </div>
          </div>
        ) : null}

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {stepStates.map((step, index) => (
            <button
              key={step.key}
              type="button"
              title={collapsed ? step.label : undefined}
              aria-current={step.isSelected ? "step" : undefined}
              onClick={() => goToTab(step.key)}
              className={cn(
                "relative flex w-full items-center rounded-2xl border text-left transition-colors",
                collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3",
                step.isWorkflowCurrent && step.isSelected
                  ? "border-sky-400 bg-sky-100 text-sky-950 shadow-sm ring-1 ring-sky-200"
                  : step.isWorkflowCurrent
                  ? "border-sky-200 bg-sky-50 text-sky-900"
                  : step.isSelected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : step.isDone
                      ? "border-emerald-200 bg-emerald-50/60 text-foreground"
                      : "border-border/70 bg-background hover:bg-muted/40",
              )}
            >
              {step.isWorkflowCurrent && !step.isSelected ? (
                <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-sky-400" />
              ) : null}
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.isWorkflowCurrent
                    ? "bg-sky-600 text-white"
                    : step.isSelected
                    ? "bg-white/15 text-white"
                    : step.isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.label}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1 text-[11px] font-medium",
                      step.isWorkflowCurrent
                        ? "bg-sky-600 text-white"
                        : step.isSelected
                        ? "bg-white/15 text-white"
                        : step.isDone
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {step.statusLabel}
                  </span>
                </>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={() => goToTab("history")}
            title="版本历史"
            className={cn(
              "flex w-full items-center rounded-2xl border border-border/70 transition-colors hover:bg-muted/40",
              collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3 text-left",
              activeTab === "history" && "border-slate-900 bg-slate-900 text-white",
            )}
          >
            <History className="h-4 w-4 shrink-0" />
            {!collapsed ? <span className="text-sm font-medium">版本历史</span> : null}
          </button>

          {!collapsed ? (
            <DirectorBookAutomationCard
              projection={cockpitProjection}
              fallbackStatusLabel={formatTaskStatus(activeTask?.status)}
              fallbackSummary={cockpitSummary}
              compact
              onOpenProgress={openProgressDialog}
              onOpenTaskCenter={openTaskCenter}
              onSwitchToProjectNav={onSwitchToProjectNav}
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onClick={openProgressDialog}
                title={`查看导演进度：${formatTaskStatus(activeTask?.status)}`}
                aria-label="查看导演进度"
              >
                <ListTodo className="h-4 w-4" />
              </Button>
              {onSwitchToProjectNav ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  onClick={onSwitchToProjectNav}
                  title="切换到项目导航"
                  aria-label="切换到项目导航"
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      </aside>

      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle>AI 自动导演进度</DialogTitle>
            <DialogDescription>
              查看这本书的推进步骤、最近进展和 AI 用量。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(88vh-6.5rem)] overflow-y-auto p-4 sm:p-6">
            <NovelAutoDirectorProgressPanel
              mode={progressDialogMode}
              task={activeTask}
              taskId={activeTask?.id ?? ""}
              titleHint={novelTitle}
              fallbackError={activeTask?.lastError ?? null}
              onBackgroundContinue={() => setProgressDialogOpen(false)}
              onConfirmAndContinue={() => continueDirectorMutation.mutate()}
              isConfirmingAndContinuing={continueDirectorMutation.isPending}
              onOpenTaskCenter={openTaskCenter}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
