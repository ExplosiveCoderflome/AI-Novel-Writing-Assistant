import { useState } from "react";
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
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import NovelCharacterPanel from "./NovelCharacterPanel";
import NovelTaskDrawer from "./NovelTaskDrawer";
import OutlineTab from "./OutlineTab";
import PipelineTab from "./PipelineTab";
import StoryMacroPlanTab from "./StoryMacroPlanTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import VersionHistoryTab from "./VersionHistoryTab";
import BasicInfoTab from "./BasicInfoTab";
import type { NovelEditViewProps } from "./NovelEditView.types";
import {
  getNovelWorkspaceFlowStepIndex,
  getNovelWorkspaceTabLabel,
  NOVEL_WORKSPACE_FLOW_STEPS,
  normalizeNovelWorkspaceTab,
} from "../novelWorkspaceNavigation";

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
    activeStepTakeoverEntry,
  } = props;

  const [isProjectToolsOpen, setIsProjectToolsOpen] = useState(false);

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
  const guidedFlowTab = normalizedActiveTab === "history"
    ? normalizedWorkflowTab === "history"
      ? "basic"
      : normalizedWorkflowTab
    : normalizedActiveTab;
  const novelTitle = basicTab.basicForm.title.trim() || "未命名小说";
  const currentStepLabel = getNovelWorkspaceTabLabel(normalizedActiveTab);
  const workflowStepLabel = getNovelWorkspaceTabLabel(normalizedWorkflowTab);
  const stepIndex = getNovelWorkspaceFlowStepIndex(guidedFlowTab);
  const progressLabel = stepIndex >= 0
    ? `第 ${stepIndex + 1} 步 / 共 ${NOVEL_WORKSPACE_FLOW_STEPS.length} 步`
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
        <div className="space-y-3 pb-1">
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
            <span className="truncate font-semibold text-foreground">{novelTitle}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
            <span className="shrink-0 text-muted-foreground">当前步骤：{currentStepLabel}</span>
            {progressLabel ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 text-muted-foreground">{progressLabel}</span>
              </>
            ) : null}
            {normalizedWorkflowTab !== normalizedActiveTab ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 text-sky-700">流程推荐：{workflowStepLabel}</span>
              </>
            ) : null}
          </div>

          <DirectorTakeoverEntryPanel
            title="让 AI 从当前步骤继续接管"
            description="退出导演模式后，不需要回到项目起点。直接从当前页面重新进入自动导演，并明确选择继续已有进度还是重跑当前步。"
            entry={activeStepTakeoverEntry}
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Dialog open={isProjectToolsOpen} onOpenChange={setIsProjectToolsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">项目工具</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>项目工具</DialogTitle>
                  <DialogDescription>
                    这里收纳次级信息。首屏只保留当前步骤和恢复接管入口，避免主工作区被项目辅助信息挤满。
                  </DialogDescription>
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
