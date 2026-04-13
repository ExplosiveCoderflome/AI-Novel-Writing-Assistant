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

type OutlineVolume = NovelEditViewProps["outlineTab"]["volumes"][number];
type VolumeChapter = OutlineVolume["chapters"][number];

function hasVolumePlanContent(volume: OutlineVolume): boolean {
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

function hasChapterPlanContent(chapter: VolumeChapter): boolean {
  return Boolean(chapter.summary?.trim())
    || Boolean(chapter.purpose?.trim())
    || Boolean(chapter.mustAvoid?.trim())
    || Boolean(chapter.taskSheet?.trim())
    || typeof chapter.conflictLevel === "number"
    || typeof chapter.revealLevel === "number"
    || typeof chapter.targetWordCount === "number"
    || chapter.payoffRefs.length > 0;
}

export default function NovelEditView(props: NovelEditViewProps) {
  const { id, activeTab, onActiveTabChange, basicTab, storyMacroTab, outlineTab, structuredTab, chapterTab, pipelineTab, characterTab, takeover, taskDrawer } = props;
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

  const tabOrder = ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline", "history"];
  const activeStageIndex = Math.max(0, tabOrder.indexOf(activeTab));
  const basicReady = basicTab.basicForm.title.trim().length > 0;
  const storyMacroReady = basicReady && storyMacroTab.constraintEngine !== null;
  const characterReady = storyMacroReady && characterTab.characters.length > 0;
  const outlineAssetReady = Boolean(outlineTab.strategyPlan)
    || outlineTab.volumes.some((volume) => hasVolumePlanContent(volume));
  const outlineReady = characterReady && outlineAssetReady;
  const structuredAssetReady = structuredTab.beatSheets.some((sheet) => sheet.beats.length > 0)
    || structuredTab.volumes.some((volume) => volume.chapters.some((chapter) => hasChapterPlanContent(chapter)));
  const structuredReady = outlineReady && structuredAssetReady;
  const chapterReady = structuredReady && generatedChapters > 0;
  const pipelineReady = chapterReady && (pipelineTab.qualitySummary ? pipelineTab.qualitySummary.overall >= 75 : false);
  const stages = [
    {
      key: "basic",
      label: "项目设定",
      description: "定义作品身份、约束和 AI 协作方式。",
      ready: basicReady,
    },
    {
      key: "story_macro",
      label: "故事宏观规划",
      description: "先把故事想法变成约束引擎，再进入角色和主线阶段。",
      ready: storyMacroReady,
    },
    {
      key: "character",
      label: "角色准备",
      description: "补齐核心角色、关系和当前目标。",
      ready: characterReady,
    },
    {
      key: "outline",
      label: "卷战略 / 卷骨架",
      description: "先决定分卷策略，再确认每一卷的开卷抓手、压迫源和兑现方式。",
      ready: outlineReady,
    },
    {
      key: "structured",
      label: "节奏 / 拆章",
      description: "先做当前卷节奏板，再拆当前卷章节列表并补齐单章细化。",
      ready: structuredReady,
    },
    {
      key: "chapter",
      label: "章节执行",
      description: "生成章节、审计结果并处理修正。",
      ready: chapterReady,
    },
    {
      key: "pipeline",
      label: "质量修复",
      description: "批量执行生产链并跟踪质量风险。",
      ready: pipelineReady,
    },
    {
      key: "history",
      label: "版本历史",
      description: "查看重要版本、冻结点和差异。",
      ready: Boolean(id),
    },
  ];
  const completedStages = stages.filter((stage) => stage.ready).length;
  const progressPercent = Math.round((completedStages / Math.max(stages.length, 1)) * 100);
  const taskAttentionLabel = taskDrawer?.task
    ? taskDrawer.task.status === "failed"
      ? "异常"
      : taskDrawer.task.status === "waiting_approval"
        ? "待审核"
        : taskDrawer.task.status === "running" || taskDrawer.task.status === "queued"
          ? "进行中"
          : "最近任务"
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
        <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
          <Dialog open={isProjectOverviewOpen} onOpenChange={setIsProjectOverviewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">项目概览</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
              <DialogHeader>
                <DialogTitle>项目概览</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardHeader><CardTitle>章节进度</CardTitle></CardHeader><CardContent><p>{generatedChapters} / {Math.max(totalChapters, 1)} 已生成</p></CardContent></Card>
                <Card><CardHeader><CardTitle>待修复章节</CardTitle></CardHeader><CardContent><p>{pendingRepairs}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>当前模型</CardTitle></CardHeader><CardContent><p>{currentModel}</p></CardContent></Card>
                <Card><CardHeader><CardTitle>最近任务</CardTitle></CardHeader><CardContent><p>{pipelineTab.pipelineJob?.status ?? "idle"}</p></CardContent></Card>
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
      ) : null}

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <CardTitle>创作阶段</CardTitle>
              <div className="text-sm text-muted-foreground">
                这里是当前项目的唯一阶段导航。点击卡片即可切换到对应模块，并同时查看完成状态。
              </div>
            </div>
            <div className="min-w-[220px] rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">阶段进度</span>
                <span className="text-muted-foreground">{completedStages}/{stages.length}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                当前阶段：{stages[activeStageIndex]?.label ?? "项目设定"}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {stages.map((stage, index) => {
            const isActive = index === activeStageIndex;
            const isDone = stage.ready;
            const statusLabel = isActive ? "当前阶段" : isDone ? "已就绪" : "待推进";
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => onActiveTabChange(stage.key)}
                className={`rounded border px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? "border-sky-400/70 bg-sky-50 shadow-sm ring-1 ring-sky-200"
                    : isDone
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500/70"
                      : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isActive
                        ? "bg-sky-600 text-white"
                        : isDone
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      isActive
                        ? "bg-sky-100 text-sky-700"
                        : isDone
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-3 font-medium text-foreground">{stage.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</div>
              </button>
            );
          })}
        </CardContent>
      </Card>

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
            overlay={takeover.overlay}
            overlayMessage={takeover.overlayMessage}
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
