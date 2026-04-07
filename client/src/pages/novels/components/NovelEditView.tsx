import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import {
  getNextNovelWorkspaceFlowTab,
  getNovelWorkspaceFlowStepIndex,
  getNovelWorkspaceTabLabel,
  getPreviousNovelWorkspaceFlowTab,
  NOVEL_WORKSPACE_FLOW_STEPS,
  normalizeNovelWorkspaceTab,
} from "../novelWorkspaceNavigation";

function getStepGuidanceDescription(input: {
  tab: string;
  totalChapters: number;
  pendingRepairs: number;
}) {
  switch (input.tab) {
    case "basic":
      return "先把这本书的标题、题材和一句话想法定清楚，后面的规划才不会跑偏。";
    case "story_macro":
      return "这里先确认主卖点、前 30 章承诺和整体方向，再继续往下拆。";
    case "character":
      return "先凑齐能支撑前期剧情的核心角色，不必一口气把所有配角都补完。";
    case "outline":
      return "先把每一卷要解决什么、冲突怎么升级和卷末钩子想明白。";
    case "structured":
      return "把章节目标和节奏拆清楚，后面进入正文写作会更顺。";
    case "chapter":
      return input.totalChapters > 0
        ? "选中当前要推进的一章，正文留在中间，其他能力都放到次级区域。"
        : "先创建至少一章，再开始正文写作。";
    case "pipeline":
      return input.pendingRepairs > 0
        ? `当前还有 ${input.pendingRepairs} 章待修，先把高风险章节处理掉。`
        : "这里主要处理审校和修复，问题不多时不需要长时间停留。";
    default:
      return "按步骤推进，当前页面只保留最需要看的内容。";
  }
}

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

  const [isProjectToolsOpen, setIsProjectToolsOpen] = useState(false);

  const totalChapters = chapterTab.chapters.length;
  const generatedChapters = chapterTab.chapters.filter((item) => Boolean(item.content?.trim())).length;
  const pendingRepairs = pipelineTab.chapterReports.filter(
    (item) => item.overall < pipelineTab.pipelineForm.qualityThreshold,
  ).length;
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
  const guidedFlowTab = normalizedActiveTab === "history"
    ? normalizedWorkflowTab === "history"
      ? "basic"
      : normalizedWorkflowTab
    : normalizedActiveTab;
  const stepIndex = getNovelWorkspaceFlowStepIndex(guidedFlowTab);
  const previousStep = getPreviousNovelWorkspaceFlowTab(guidedFlowTab);
  const nextStep = getNextNovelWorkspaceFlowTab(guidedFlowTab);
  const progressLabel = stepIndex >= 0
    ? `第 ${stepIndex + 1} 步 / 共 ${NOVEL_WORKSPACE_FLOW_STEPS.length} 步`
    : null;
  const guidanceDescription = normalizedActiveTab === "history"
    ? "这里保留最近可恢复的创作版本。恢复前系统会先自动备份一次当前状态。"
    : getStepGuidanceDescription({
      tab: guidedFlowTab,
      totalChapters,
      pendingRepairs,
    });
  const currentChapterLabel = normalizedActiveTab === "chapter"
    ? chapterTab.selectedChapter
      ? `当前章节：第 ${chapterTab.selectedChapter.order} 章 · ${chapterTab.selectedChapter.title?.trim() || "未命名章节"}`
      : "当前章节：请选择要继续创作的章节"
    : null;
  const primaryActionLabel = normalizedActiveTab === "history"
    ? `返回当前步骤：${getNovelWorkspaceTabLabel(guidedFlowTab)}`
    : nextStep
      ? `下一步：${getNovelWorkspaceTabLabel(nextStep)}`
      : "查看版本历史";
  const handlePreviousStep = () => {
    if (!previousStep) {
      return;
    }
    props.onActiveTabChange(previousStep);
  };
  const handlePrimaryAction = () => {
    if (normalizedActiveTab === "history") {
      props.onActiveTabChange(guidedFlowTab);
      return;
    }
    if (nextStep) {
      props.onActiveTabChange(nextStep);
      return;
    }
    props.onActiveTabChange("history");
  };
  const handleHistoryAction = () => {
    if (normalizedActiveTab === "history") {
      props.onActiveTabChange(guidedFlowTab);
      return;
    }
    props.onActiveTabChange("history");
  };

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

          <div className="rounded-3xl border border-border/70 bg-gradient-to-r from-slate-50 via-background to-emerald-50/40 p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{progressLabel ?? "恢复入口"}</Badge>
                  <Badge variant={normalizedActiveTab === "history" ? "secondary" : "default"}>
                    {normalizedActiveTab === "history" ? "版本恢复区" : `正在处理：${getNovelWorkspaceTabLabel(guidedFlowTab)}`}
                  </Badge>
                  {currentChapterLabel ? <Badge variant="secondary">{currentChapterLabel}</Badge> : null}
                </div>
                <div className="text-sm leading-7 text-muted-foreground">
                  {guidanceDescription}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handlePreviousStep} disabled={!previousStep}>
                  上一步
                </Button>
                <Button variant="secondary" onClick={handleHistoryAction}>
                  {normalizedActiveTab === "history" ? "返回当前步骤" : "版本历史"}
                </Button>
                <Button onClick={handlePrimaryAction}>
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Dialog open={isProjectToolsOpen} onOpenChange={setIsProjectToolsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">项目工具</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>项目工具</DialogTitle>
                  <DialogDescription>
                    这里收纳次级信息。首屏只保留当前步骤、继续按钮和恢复入口，避免主工作区被项目信息挤满。
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
