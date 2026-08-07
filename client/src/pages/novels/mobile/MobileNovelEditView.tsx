import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
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
import BasicInfoTab from "../components/BasicInfoTab";
import WorldSetupTab from "../components/WorldSetupTab";
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
import MobileAutoDirectorStatusCard from "./MobileAutoDirectorStatusCard";
import MobileFloatingSaveButton from "./MobileFloatingSaveButton";
import MobileNovelStepNav from "./MobileNovelStepNav";
import {
  getMobileNovelSaveState,
  getMobileNovelWorkspaceStatusText,
} from "./mobileNovelWorkspaceUtils";

export default function MobileNovelEditView(props: NovelEditViewProps) {
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
  } = props;
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? normalizedActiveTab);
  const novelTitle = basicTab.basicForm.title.trim() || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  const statusText = getMobileNovelWorkspaceStatusText({
    activeLabel: getNovelWorkspaceTabLabel(normalizedActiveTab),
    workflowLabel: getNovelWorkspaceTabLabel(normalizedWorkflowTab),
  });
  const isTakeoverLoading = takeover?.mode === "loading";
  const hideTakeoverEntry = takeover?.mode === "running" || takeover?.mode === "waiting";
  const pendingResourceProposalCount = taskDrawer?.resourceProposals?.length ?? 0;
  const totalChapters = chapterTab.chapters.length;
  const generatedChapters = chapterTab.chapters.filter((item) => Boolean(item.content?.trim())).length;
  const pendingRepairs = pipelineTab.chapterReports.filter(
    (item) => item.overall < pipelineTab.pipelineForm.qualityThreshold,
  ).length;
  const taskAttentionLabel = (() => {
    if (pendingResourceProposalCount > 0) {
      return `${pendingResourceProposalCount} 条资源`;
    }
    if (!taskDrawer?.task) {
      return null;
    }
    if (taskDrawer.task.status === "failed") {
      return "abnormal";
    }
    if (taskDrawer.task.status === "waiting_approval") {
      return "To be confirmed";
    }
    if (taskDrawer.task.status === "running" || taskDrawer.task.status === "queued") {
      return "in progress";
    }
    return "recent tasks";
  })();

  const selectTab = (tab: NovelWorkspaceTab) => {
    props.onActiveTabChange(tab);
  };

  const renderActivePanel = () => {
    switch (normalizedActiveTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
      case "world":
        return <WorldSetupTab {...worldTab} />;
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

  return (
    <div className="mobile-page-novel-edit min-h-screen bg-background px-4 pb-28 pt-3">
      <header className="mobile-novel-workspace-header sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">{novelTitle}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{statusText}</p>
          </div>
          <Dialog open={isToolsOpen} onOpenChange={setIsToolsOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label="Open authoring tools">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle>Creation tools</DialogTitle>
                <DialogDescription>View task progress and export the current step or the entire book.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">chapter</div>
                    <div className="mt-1 font-semibold">{generatedChapters}/{Math.max(totalChapters, 1)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</div>
                    <div className="mt-1 font-semibold">{pendingRepairs}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Task</div>
                    <div className="mt-1 truncate font-semibold">{taskAttentionLabel ?? "none"}</div>
                  </div>
                </div>

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
                    <span>View task progress</span>
                    {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
                  </Button>
                ) : null}

                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-sm font-medium">Export current step</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportCurrent("markdown")}
                      disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                    >
                      {exportControls.isExportingCurrentMarkdown ? "Exporting..." : "Markdown"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportCurrent("json")}
                      disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                    >
                      {exportControls.isExportingCurrentJson ? "Exporting..." : "JSON"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-sm font-medium">Export the entire book</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportFull("markdown")}
                      disabled={exportControls.isExportingFullMarkdown}
                    >
                      {exportControls.isExportingFullMarkdown ? "Exporting..." : "Markdown"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportFull("json")}
                      disabled={exportControls.isExportingFullJson}
                    >
                      {exportControls.isExportingFullJson ? "Exporting..." : "JSON"}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-3">
          <MobileNovelStepNav
            activeTab={normalizedActiveTab}
            workflowCurrentTab={normalizedWorkflowTab}
            onSelectTab={selectTab}
          />
        </div>
      </header>

      <main className="space-y-3 pt-3">
        {!hideTakeoverEntry ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            {isTakeoverLoading ? (
              <Button type="button" size="sm" disabled className="w-full">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI automatic director takes over
                                            </Button>
            ) : activeStepTakeoverEntry}
          </div>
        ) : null}

        {takeover ? <MobileAutoDirectorStatusCard takeover={takeover} /> : null}

        <section className="mobile-novel-workspace-panel space-y-4">
          {renderActivePanel()}
        </section>
      </main>

      <MobileFloatingSaveButton {...getMobileNovelSaveState(normalizedActiveTab, props)} />
      {taskDrawer ? <NovelTaskDrawer {...taskDrawer} /> : null}
    </div>
  );
}
