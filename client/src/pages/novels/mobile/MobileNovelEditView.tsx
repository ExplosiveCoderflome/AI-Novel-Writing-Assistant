import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
  const novelTitle = basicTab.basicForm.title.trim() || t("gen.pages.novels.mobile.MobileNovelEditView.gen_e3f46686");
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
      return t("gen.pages.novels.mobile.MobileNovelEditView.gen_c195df63");
    }
    if (taskDrawer.task.status === "waiting_approval") {
      return t("gen.pages.novels.mobile.MobileNovelEditView.gen_2a2772fa");
    }
    if (taskDrawer.task.status === "running" || taskDrawer.task.status === "queued") {
      return t("gen.pages.novels.mobile.MobileNovelEditView.gen_fb852fc6");
    }
    return t("gen.pages.novels.mobile.MobileNovelEditView.gen_cad670fb");
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
              <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label={t("gen.pages.novels.mobile.MobileNovelEditView.gen_ecb72f4d")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle>{t("gen.pages.novels.mobile.MobileNovelEditView.gen_e6a2706f")}</DialogTitle>
                <DialogDescription>{t("gen.pages.novels.mobile.MobileNovelEditView.gen_6ac02d2b")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.mobile.MobileNovelEditView.gen_9290b644")}</div>
                    <div className="mt-1 font-semibold">{generatedChapters}/{Math.max(totalChapters, 1)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.mobile.MobileNovelEditView.gen_a7a05e79")}</div>
                    <div className="mt-1 font-semibold">{pendingRepairs}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.mobile.MobileNovelEditView.task")}</div>
                    <div className="mt-1 truncate font-semibold">{t("gen.pages.novels.mobile.MobileNovelEditView.gen_taskAttent_5yi7")}</div>
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
                    <span>{t("gen.pages.novels.mobile.MobileNovelEditView.gen_4de94e23")}</span>
                    {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
                  </Button>
                ) : null}

                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-sm font-medium">{t("gen.pages.novels.mobile.MobileNovelEditView.gen_169a61d7")}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportCurrent("markdown")}
                      disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                    >
                      {exportControls.isExportingCurrentMarkdown ? t("gen.pages.novels.mobile.MobileNovelEditView.gen_4062b25e") : "Markdown"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportCurrent("json")}
                      disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                    >
                      {exportControls.isExportingCurrentJson ? t("gen.pages.novels.mobile.MobileNovelEditView.gen_4062b25e") : "JSON"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-sm font-medium">{t("gen.pages.novels.mobile.MobileNovelEditView.gen_9b96a714")}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportFull("markdown")}
                      disabled={exportControls.isExportingFullMarkdown}
                    >
                      {exportControls.isExportingFullMarkdown ? t("gen.pages.novels.mobile.MobileNovelEditView.gen_4062b25e") : "Markdown"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportControls.onExportFull("json")}
                      disabled={exportControls.isExportingFullJson}
                    >
                      {exportControls.isExportingFullJson ? t("gen.pages.novels.mobile.MobileNovelEditView.gen_4062b25e") : "JSON"}
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
                AI 自动导演接管
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
