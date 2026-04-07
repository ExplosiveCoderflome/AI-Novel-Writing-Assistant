import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import AITakeoverContainer from "@/components/workflow/AITakeoverContainer";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import NovelTaskDrawer from "./NovelTaskDrawer";
import NovelCharacterPanel from "./NovelCharacterPanel";
import BasicInfoTab from "./BasicInfoTab";
import OutlineTab from "./OutlineTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import ChapterManagementTab from "./ChapterManagementTab";
import PipelineTab from "./PipelineTab";
import StoryMacroPlanTab from "./StoryMacroPlanTab";
import VersionHistoryTab from "./VersionHistoryTab";
import type { NovelEditViewProps } from "./NovelEditView.types";
import { getNovelWorkspaceTabLabel, normalizeNovelWorkspaceTab } from "../novelWorkspaceNavigation";

export default function NovelEditView(props: NovelEditViewProps) {
  const {
    id,
    activeTab,
    workflowCurrentTab,
    basicTab,
    storyMacroTab,
    outlineTab,
    structuredTab,
    chapterTab,
    pipelineTab,
    characterTab,
    takeover,
    taskDrawer,
  } = props;

  const [isKnowledgeBindingOpen, setIsKnowledgeBindingOpen] = useState(false);
  const [isProjectOverviewOpen, setIsProjectOverviewOpen] = useState(false);

  const totalChapters = chapterTab.chapters.length;
  const generatedChapters = chapterTab.chapters.filter((item) => Boolean(item.content?.trim())).length;
  const pendingRepairs = pipelineTab.chapterReports.filter((item) => item.overall < 75).length;
  const currentModel = pipelineTab.pipelineJob?.payload ? (() => {
    try {
      const parsed = JSON.parse(pipelineTab.pipelineJob.payload) as { model?: string };
      return parsed.model ?? "default";
    } catch {
      return "default";
    }
  })() : "default";

  const taskAttentionLabel = taskDrawer?.task
    ? taskDrawer.task.status === "failed"
      ? "异常"
      : taskDrawer.task.status === "waiting_approval"
        ? "待审核"
        : taskDrawer.task.status === "running" || taskDrawer.task.status === "queued"
          ? "进行中"
          : "最近任务"
    : null;

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? activeTab);
  const novelTitle = basicTab.basicForm.title.trim() || "未命名小说";
  const currentStepLabel = getNovelWorkspaceTabLabel(normalizedActiveTab);
  const workflowStepLabel = getNovelWorkspaceTabLabel(normalizedWorkflowTab);
  const currentChapterLabel = normalizedActiveTab === "chapter"
    ? chapterTab.selectedChapter
      ? `当前章节：第 ${chapterTab.selectedChapter.order} 章 · ${chapterTab.selectedChapter.title?.trim() || "未命名章节"}`
      : "当前章节：请选择要继续创作的章节"
    : null;

  const renderActivePanel = () => {
    switch (activeTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
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
    <div className="space-y-6 lg:space-y-7">
      {id ? (
        <div className="flex flex-col gap-3 pb-1 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex h-10 min-w-0 items-center gap-3 overflow-hidden text-sm">
              <span className="truncate font-semibold text-foreground">{novelTitle}</span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
              <span className="shrink-0 text-muted-foreground">当前步骤：{currentStepLabel}</span>
              {normalizedWorkflowTab !== normalizedActiveTab ? (
                <>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                  <span className="shrink-0 text-sky-700">流程：{workflowStepLabel}</span>
                </>
              ) : null}
              {currentChapterLabel ? (
                <>
                  <span className="hidden h-1 w-1 shrink-0 rounded-full bg-border 2xl:block" />
                  <span className="hidden truncate text-muted-foreground 2xl:block">{currentChapterLabel}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Dialog open={isProjectOverviewOpen} onOpenChange={setIsProjectOverviewOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">项目概览</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>项目概览</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>章节进度</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{generatedChapters} / {Math.max(totalChapters, 1)} 已生成</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>待修复章节</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{pendingRepairs}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>当前模型</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{currentModel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>最近任务</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{pipelineTab.pipelineJob?.status ?? "idle"}</p>
                    </CardContent>
                  </Card>
                </div>
                <KnowledgeBindingPanel targetType="novel" targetId={id} title="参考知识" />
              </DialogContent>
            </Dialog>

            <Dialog open={isKnowledgeBindingOpen} onOpenChange={setIsKnowledgeBindingOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">知识库绑定</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>小说知识库绑定</DialogTitle>
                </DialogHeader>
                <KnowledgeBindingPanel targetType="novel" targetId={id} title="参考知识" />
              </DialogContent>
            </Dialog>

            <Button
              variant={taskDrawer?.task?.status === "failed" ? "destructive" : "outline"}
              onClick={() => taskDrawer?.onOpenChange(true)}
            >
              任务面板
              {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
            </Button>
          </div>
        </div>
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
