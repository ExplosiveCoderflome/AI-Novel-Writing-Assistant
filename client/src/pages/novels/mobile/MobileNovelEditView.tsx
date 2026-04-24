import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import MobileWorkspaceShell from "@/components/layout/mobile/MobileWorkspaceShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import AITakeoverContainer from "@/components/workflow/AITakeoverContainer";
import BasicInfoTab from "../components/BasicInfoTab";
import ChapterManagementTab from "../components/ChapterManagementTab";
import NovelCharacterPanel from "../components/NovelCharacterPanel";
import NovelTaskDrawer from "../components/NovelTaskDrawer";
import OutlineTab from "../components/OutlineTab";
import PipelineTab from "../components/PipelineTab";
import StoryMacroPlanTab from "../components/StoryMacroPlanTab";
import StructuredOutlineTab from "../components/StructuredOutlineTab";
import VersionHistoryTab from "../components/VersionHistoryTab";
import type { NovelEditViewProps } from "../components/NovelEditView.types";
import {
  getNovelWorkspaceTabLabel,
  normalizeNovelWorkspaceTab,
  type NovelWorkspaceTab,
} from "../novelWorkspaceNavigation";
import MobileNovelStepNav from "./MobileNovelStepNav";
import { getMobileNovelWorkspaceStatusText } from "./mobileNovelWorkspaceUtils";

export default function MobileNovelEditView(props: NovelEditViewProps) {
  const {
    id,
    activeTab,
    workflowCurrentTab,
    exportControls,
    basicTab,
    storyMacroTab,
    outlineTab,
    structuredTab,
    chapterTab,
    pipelineTab,
    characterTab,
    takeover,
    taskDrawer,
    activeStepTakeoverEntry,
  } = props;
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? normalizedActiveTab);
  const novelTitle = basicTab.basicForm.title.trim() || "未命名小说";
  const statusText = getMobileNovelWorkspaceStatusText({
    activeLabel: getNovelWorkspaceTabLabel(normalizedActiveTab),
    workflowLabel: getNovelWorkspaceTabLabel(normalizedWorkflowTab),
  });
  const isTakeoverLoading = takeover?.mode === "loading";
  const hideTakeoverEntry = takeover?.mode === "running" || takeover?.mode === "waiting";

  const selectTab = (tab: NovelWorkspaceTab) => {
    props.onActiveTabChange(tab);
  };

  const taskAttentionLabel = taskDrawer?.task
    ? taskDrawer.task.status === "failed"
      ? "异常"
      : taskDrawer.task.status === "waiting_approval"
        ? "待确认"
        : taskDrawer.task.status === "running" || taskDrawer.task.status === "queued"
          ? "进行中"
          : "最近任务"
    : null;

  const renderActivePanel = () => {
    switch (normalizedActiveTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
      case "story_macro":
        return <StoryMacroPlanTab {...storyMacroTab} />;
      case "character":
        return <NovelCharacterPanel {...characterTab} />;
      case "outline":
        return <OutlineTab {...outlineTab} />;
      case "structured":
        return <StructuredOutlineTab {...structuredTab} />;
      case "chapter":
        return <ChapterManagementTab {...chapterTab} />;
      case "pipeline":
        return <PipelineTab {...pipelineTab} />;
      case "history":
        return <VersionHistoryTab novelId={id} />;
      default:
        return <BasicInfoTab {...basicTab} />;
    }
  };

  const activePanel = renderActivePanel();

  return (
    <MobileWorkspaceShell
      title={novelTitle}
      subtitle="小说创作工作区"
      statusText={statusText}
      actions={(
        <Dialog open={isToolsOpen} onOpenChange={setIsToolsOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="icon" variant="outline" aria-label="打开创作工具">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle>创作工具</DialogTitle>
              <DialogDescription>查看任务、导出项目内容，或继续当前 AI 创作流程。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {taskDrawer ? (
                <Button
                  type="button"
                  variant={taskDrawer.task?.status === "failed" ? "destructive" : "outline"}
                  className="w-full justify-between"
                  onClick={() => {
                    taskDrawer.onOpenChange(true);
                    setIsToolsOpen(false);
                  }}
                >
                  <span>查看任务进度</span>
                  {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
                </Button>
              ) : null}

              <div className="rounded-2xl border border-border/70 p-3">
                <div className="text-sm font-medium">导出当前步骤</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportControls.onExportCurrent("markdown")}
                    disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                  >
                    {exportControls.isExportingCurrentMarkdown ? "导出中..." : "Markdown"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportControls.onExportCurrent("json")}
                    disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                  >
                    {exportControls.isExportingCurrentJson ? "导出中..." : "JSON"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 p-3">
                <div className="text-sm font-medium">导出整本书</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportControls.onExportFull("markdown")}
                    disabled={exportControls.isExportingFullMarkdown}
                  >
                    {exportControls.isExportingFullMarkdown ? "导出中..." : "Markdown"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => exportControls.onExportFull("json")}
                    disabled={exportControls.isExportingFullJson}
                  >
                    {exportControls.isExportingFullJson ? "导出中..." : "JSON"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    >
      <div className="space-y-4">
        <MobileNovelStepNav
          activeTab={normalizedActiveTab}
          workflowCurrentTab={normalizedWorkflowTab}
          onSelectTab={selectTab}
        />

        {!hideTakeoverEntry ? (
          <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-sm">
            {isTakeoverLoading ? (
              <Button type="button" size="sm" disabled className="w-full">
                <Loader2 className="animate-spin" />
                AI 自动导演接管
              </Button>
            ) : activeStepTakeoverEntry}
          </div>
        ) : null}

        <section className="mobile-novel-workspace-panel space-y-4 [&_.grid]:min-w-0 [&_.min-w-0]:min-w-0">
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
              {activePanel}
            </AITakeoverContainer>
          ) : activePanel}
        </section>
      </div>
      {taskDrawer ? <NovelTaskDrawer {...taskDrawer} /> : null}
    </MobileWorkspaceShell>
  );
}
