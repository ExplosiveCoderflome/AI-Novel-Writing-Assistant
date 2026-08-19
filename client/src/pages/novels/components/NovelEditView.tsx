import i18next from "i18next";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import AITakeoverContainer from "@/components/workflow/AITakeoverContainer";
import ChapterManagementTab from "./ChapterManagementTab";
import DirectorFactDebugDialog from "./DirectorFactDebugDialog";
import NovelCharacterPanel from "./NovelCharacterPanel";
import NovelTaskDrawer from "./NovelTaskDrawer";
import OutlineTab from "./OutlineTab";
import PipelineTab from "./PipelineTab";
import StoryMacroPlanTab from "./StoryMacroPlanTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import VersionHistoryTab from "./VersionHistoryTab";
import BasicInfoTab from "./BasicInfoTab";
import WorldSetupTab from "./WorldSetupTab";
import { devResetNovelChapters } from "@/api/novel";
import { toast } from "@/components/ui/toast";
import { queryKeys } from "@/api/queryKeys";
import MobileNovelEditView from "../mobile/MobileNovelEditView";
import type { NovelEditViewProps } from "./NovelEditView.types";
import {
  getNovelWorkspaceFlowStepIndex,
  getNovelWorkspaceTabLabel,
  NOVEL_WORKSPACE_FLOW_STEPS,
  normalizeNovelWorkspaceTab,
  tabFromDirectorDisplayStage,
} from "../novelWorkspaceNavigation";
import { StepHero } from "./workspaceShell";

export default function NovelEditView(props: NovelEditViewProps) {
  const isMobileViewport = useIsMobileViewport();

  if (isMobileViewport) {
    return <MobileNovelEditView {...props} />;
  }

  return <DesktopNovelEditView {...props} />;
}

function DesktopNovelEditView(props: NovelEditViewProps) {
  const {
    id,
    activeTab,
    workflowCurrentTab,
    exportControls,
    basicTab,
    worldTab,
    storyMacroTab,
    outlineTab,
    structuredTab,
    chapterTab,
    pipelineTab,
    characterTab,
    takeover,
    taskDrawer,
    activeStepTakeoverEntry,
    onSwitchToSimpleMode,
    isSwitchingToSimpleMode = false,
  } = props;

  const [isProjectToolsOpen, setIsProjectToolsOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const resetChaptersMutation = useMutation({
    mutationFn: () => devResetNovelChapters(id),
    onSuccess: async (result) => {
      toast.success(i18next.t("novels.novelEditView.88a1ge", { val1: (result.resetCount) }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapters(id) }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : i18next.t("dict.gen_f65a5818"));
    },
  });

  const totalChapters = chapterTab.chapters.length;
  const generatedChapters = chapterTab.chapters.filter((item) => Boolean(item.content?.trim())).length;
  const pendingRepairs = pipelineTab.chapterReports.filter(
    (item) => item.overall < pipelineTab.pipelineForm.qualityThreshold,
  ).length;
  const currentModel = pipelineTab.pipelineJob?.payload
    ? (() => {
        try {
          const parsed = JSON.parse(pipelineTab.pipelineJob.payload) as { model?: string };
          return parsed.model ?? "default";
        } catch {
          return "default";
        }
      })()
    : "default";

  const pendingResourceProposalCount = taskDrawer?.resourceProposals?.length ?? 0;
  const taskAttentionLabel = (() => {
    if (pendingResourceProposalCount > 0) {
      return i18next.t("novels.novelEditView.byfxtv", { val1: (pendingResourceProposalCount) });
    }
    if (!taskDrawer?.task) {
      return null;
    }
    if (taskDrawer.task.pendingManualRecovery) {
      return i18next.t("dict.gen_b0e31037");
    }
    if (taskDrawer.task.status === "failed") {
      return i18next.t("dict.gen_c195df63");
    }
    if (taskDrawer.task.status === "waiting_approval") {
      return i18next.t("dict.gen_5cb42476");
    }
    if (taskDrawer.task.status === "running" || taskDrawer.task.status === "queued") {
      return i18next.t("tasks.levelRunning");
    }
    return i18next.t("dict.gen_cad670fb");
  })();

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? activeTab);
  const guidedFlowTab = normalizedActiveTab === "history"
    ? normalizedWorkflowTab === "history"
      ? "basic"
      : normalizedWorkflowTab
    : normalizedActiveTab;
  const novelTitle = basicTab.basicForm.title.trim() || "\u672a\u547d\u540d\u5c0f\u8bf4";
  const directorDisplayState = taskDrawer?.snapshot?.displayState ?? null;
  const currentPageLabel = getNovelWorkspaceTabLabel(normalizedActiveTab);
  const currentStepLabel = directorDisplayState?.stageLabel ?? currentPageLabel;
  const recommendedWorkflowTab = directorDisplayState
    ? tabFromDirectorDisplayStage(directorDisplayState.stageKey)
    : normalizedWorkflowTab;
  const workflowStepLabel = recommendedWorkflowTab
    ? getNovelWorkspaceTabLabel(recommendedWorkflowTab)
    : null;
  const stepIndex = directorDisplayState?.stepIndex ?? getNovelWorkspaceFlowStepIndex(guidedFlowTab);
  const progressLabel = stepIndex >= 0
    ? `\u7b2c ${stepIndex + 1} \u6b65 / \u5171 ${directorDisplayState?.totalSteps ?? NOVEL_WORKSPACE_FLOW_STEPS.length} \u6b65`
    : null;
  const showWorkflowRecommendation = Boolean(
    recommendedWorkflowTab
    && recommendedWorkflowTab !== normalizedActiveTab,
  );
  const isTakeoverLoading = takeover?.mode === "loading";
  const hideTakeoverEntry = takeover?.mode === "running" || takeover?.mode === "waiting";
  const workspaceTone = taskDrawer?.task?.status === "failed"
    ? "danger"
    : taskDrawer?.task?.status === "waiting_approval"
      ? "warning"
      : taskDrawer?.task?.status === "running" || taskDrawer?.task?.status === "queued"
        ? "info"
        : "neutral";

  const renderActivePanel = () => {
    switch (activeTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
      case "world":
        return <WorldSetupTab {...worldTab} />;
      case "outline":
        return <OutlineTab {...outlineTab} />;
      case "story_macro":
        return <StoryMacroPlanTab {...storyMacroTab} />;
      case "structured":
        return <StructuredOutlineTab {...structuredTab} />;
      case "chapter":
        return <ChapterManagementTab {...chapterTab} />;
      case "pipeline":
        return <PipelineTab {...pipelineTab} />;
      case "character":
        return <NovelCharacterPanel {...characterTab} />;
      case "history":
        return <VersionHistoryTab novelId={id} />;
      default:
        return <BasicInfoTab {...basicTab} />;
    }
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      {id ? (
        <StepHero
          tone={workspaceTone}
          eyebrow={(
            <>
              <span className="truncate font-semibold text-foreground">{novelTitle}</span>
              {progressLabel ? <span>{progressLabel}</span> : null}
              <span>当前页面：{currentPageLabel}</span>
            </>
          )}
          title={currentStepLabel}
          description={showWorkflowRecommendation && workflowStepLabel
            ? i18next.t("novels.novelEditView.4i4lpd", { val1: (workflowStepLabel) })
            : "按当前步骤整理这本书的生产资产，需要时可以交给 AI 自动导演接管。"}
          actions={(
            <>
            {onSwitchToSimpleMode ? (
              <Button type="button" variant="outline" onClick={onSwitchToSimpleMode} disabled={isSwitchingToSimpleMode}>
                {isSwitchingToSimpleMode ? <Loader2 className="animate-spin" /> : <Sparkles />}
                简易模式
              </Button>
            ) : null}
            {!hideTakeoverEntry ? (
              isTakeoverLoading ? (
                <Button type="button" size="sm" disabled>
                  <Loader2 className="animate-spin" />
                  AI 自动导演接管
                </Button>
              ) : activeStepTakeoverEntry
            ) : null}

            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">{i18next.t("dict.gen_55405ea6")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{i18next.t("dict.gen_379ad801")}</DialogTitle>
                  <DialogDescription>{i18next.t("novels.novelEditView.x0o4re")}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">当前步骤：{currentStepLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportCurrent("markdown")}
                        disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                      >
                        {exportControls.isExportingCurrentMarkdown ? "导出中..." : "Markdown"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportCurrent("json")}
                        disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                      >
                        {exportControls.isExportingCurrentJson ? "导出中..." : "JSON"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{i18next.t("dict.gen_82e75116")}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportFull("markdown")}
                        disabled={exportControls.isExportingFullMarkdown}
                      >
                        {exportControls.isExportingFullMarkdown ? "导出中..." : "Markdown"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportFull("json")}
                        disabled={exportControls.isExportingFullJson}
                      >
                        {exportControls.isExportingFullJson ? "导出中..." : "JSON"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </DialogContent>
            </Dialog>

            <DirectorFactDebugDialog novelId={id} taskId={taskDrawer?.task?.id ?? null} />

            <Dialog open={isProjectToolsOpen} onOpenChange={setIsProjectToolsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">{i18next.t("dict.gen_81904c4a")}</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>{i18next.t("dict.gen_81904c4a")}</DialogTitle>
                  <DialogDescription>{i18next.t("novels.novelEditView.h5f8y4")}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>{i18next.t("dict.gen_9c8e364e")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{generatedChapters} / {Math.max(totalChapters, 1)} 已生成</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{i18next.t("dict.gen_f28a56a3")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{pendingRepairs}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{i18next.t("dict.gen_e18ae875")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{currentModel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>{i18next.t("dict.gen_cad670fb")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{pipelineTab.pipelineJob?.status ?? "idle"}</p>
                    </CardContent>
                  </Card>
                </div>
                <KnowledgeBindingPanel targetType="novel" targetId={id} title={i18next.t("dict.gen_bd73ad86")} />

                {/* 开发工具区 —— 仅在 DEV 环境可见 */}
                {import.meta.env.DEV ? (
                  <Card className="border-dashed border-yellow-500/60 bg-yellow-50/30 dark:bg-yellow-950/10">
                    <CardHeader>
                      <CardTitle className="text-sm text-yellow-700 dark:text-yellow-400">🛠 开发工具</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground">{i18next.t("novels.novelEditView.t6eg8g")}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-yellow-500/60 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                        disabled={resetChaptersMutation.isPending}
                        onClick={() => {
                          if (window.confirm(i18next.t("novels.novelEditView.ykty5q", { val1: (totalChapters) }))) {
                            resetChaptersMutation.mutate();
                          }
                        }}
                      >
                        {resetChaptersMutation.isPending
                          ? <><Loader2 className="animate-spin" />{i18next.t("dict.gen_9c56ac70")}</>
                          : <><RotateCcw />{i18next.t("dict.gen_deecbd2b")}</>}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </DialogContent>
            </Dialog>

            <Button
              variant={taskDrawer?.task?.status === "failed" ? "destructive" : "secondary"}
              onClick={() => taskDrawer?.onOpenChange(true)}
            >
              执行详情
              {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
            </Button>
            </>
          )}
        />
      ) : null}

      <div className="space-y-4 pt-1">
        {takeover ? (
          <AITakeoverContainer
            mode={takeover.mode}
            title={takeover.title}
            description={takeover.description}
            progress={takeover.progress}
            currentAction={takeover.currentAction}
            checkpointLabel={takeover.checkpointLabel}
            taskId={takeover.taskId}
            actions={takeover.actions}
          >
            {renderActivePanel()}
          </AITakeoverContainer>
        ) : (
          renderActivePanel()
        )}
      </div>

      {taskDrawer ? <NovelTaskDrawer {...taskDrawer} /> : null}
    </div>
  );
}
