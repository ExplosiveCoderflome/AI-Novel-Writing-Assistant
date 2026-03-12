import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import NovelCharacterPanel from "./NovelCharacterPanel";
import BasicInfoTab from "./BasicInfoTab";
import OutlineTab from "./OutlineTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import ChapterManagementTab from "./ChapterManagementTab";
import PipelineTab from "./PipelineTab";
import VersionHistoryTab from "./VersionHistoryTab";
import type { NovelEditViewProps } from "./NovelEditView.types";

export default function NovelEditView(props: NovelEditViewProps) {
  const { id, activeTab, onActiveTabChange, basicTab, outlineTab, structuredTab, chapterTab, pipelineTab, characterTab } = props;
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

  const tabOrder = ["basic", "character", "outline", "structured", "chapter", "pipeline", "history"];
  const activeStageIndex = Math.max(0, tabOrder.indexOf(activeTab));
  const stages = [
    { key: "basic", label: "项目设定", ready: basicTab.basicForm.title.trim().length > 0 },
    { key: "character", label: "角色准备", ready: characterTab.characters.length > 0 },
    { key: "outline", label: "故事主线", ready: outlineTab.draftText.trim().length > 0 },
    { key: "structured", label: "生成规划", ready: structuredTab.draftText.trim().length > 0 },
    { key: "chapter", label: "章节执行", ready: generatedChapters > 0 },
    { key: "pipeline", label: "质量修复", ready: pipelineTab.qualitySummary ? pipelineTab.qualitySummary.overall >= 75 : false },
    { key: "history", label: "版本历史", ready: Boolean(id) },
  ];

  return (
    <>
      {id ? (
        <div className="flex items-center justify-end gap-2">
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
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>小说生产状态栏</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-6">
          {stages.map((stage, index) => {
            const isActive = index === activeStageIndex;
            const isDone = stage.ready;
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => onActiveTabChange(stage.key)}
                className={`rounded border px-3 py-2 text-left text-sm transition ${
                  isActive ? "border-primary bg-primary/10" : isDone ? "border-emerald-500/40 bg-emerald-500/10" : "border-muted bg-background"
                }`}
              >
                <div className="font-medium">{stage.label}</div>
                <div className="text-xs text-muted-foreground">{isDone ? "已就绪" : isActive ? "进行中" : "待完成"}</div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={onActiveTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="basic">项目设定</TabsTrigger>
          <TabsTrigger value="character">角色准备</TabsTrigger>
          <TabsTrigger value="outline">故事主线</TabsTrigger>
          <TabsTrigger value="structured">生成规划</TabsTrigger>
          <TabsTrigger value="chapter">章节执行</TabsTrigger>
          <TabsTrigger value="pipeline">质量修复</TabsTrigger>
          <TabsTrigger value="history">版本历史</TabsTrigger>
        </TabsList>

        <TabsContent value="basic"><BasicInfoTab {...basicTab} /></TabsContent>
        <TabsContent value="outline"><OutlineTab {...outlineTab} /></TabsContent>
        <TabsContent value="structured"><StructuredOutlineTab {...structuredTab} /></TabsContent>
        <TabsContent value="chapter"><ChapterManagementTab {...chapterTab} /></TabsContent>
        <TabsContent value="pipeline"><PipelineTab {...pipelineTab} /></TabsContent>
        <TabsContent value="character"><NovelCharacterPanel {...characterTab} /></TabsContent>
        <TabsContent value="history"><VersionHistoryTab novelId={id} /></TabsContent>
      </Tabs>
    </>
  );
}
