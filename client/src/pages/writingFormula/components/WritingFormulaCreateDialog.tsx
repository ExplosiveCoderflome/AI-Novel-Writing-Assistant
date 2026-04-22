import { useEffect, useState } from "react";
import type { StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WritingFormulaCreateFormState } from "../useWritingFormulaCreateFlow";

const EXTRACTION_PRESET_OPTIONS = [
  {
    key: "imitate",
    label: "尽量贴近原文",
    summary: "尽量保留强烈指纹和表达习惯，适合短期临摹、风格试写和对照学习。",
  },
  {
    key: "balanced",
    label: "保留主要读感",
    summary: "保留读感和推进节奏，弱化过强指纹，适合大多数项目直接使用。",
  },
  {
    key: "transfer",
    label: "只迁移可复用骨架",
    summary: "更多保留可复用的节奏、结构和对白逻辑，适合长期项目和整书默认写法。",
  },
] as const;

function formatTaskStatus(task: UnifiedTaskDetail | null): string {
  if (!task) {
    return "暂无任务";
  }
  if (task.status === "queued") {
    return "排队中";
  }
  if (task.status === "running") {
    return "处理中";
  }
  if (task.status === "succeeded") {
    return "已完成";
  }
  if (task.status === "failed") {
    return "失败";
  }
  if (task.status === "cancelled") {
    return "已取消";
  }
  return "等待审批";
}

interface WritingFormulaCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: WritingFormulaCreateFormState;
  onFormChange: (patch: Partial<WritingFormulaCreateFormState>) => void;
  templates: StyleTemplate[];
  createManualPending: boolean;
  createFromBriefPending: boolean;
  createFromTemplatePending: boolean;
  extractTaskSubmitting: boolean;
  activeExtractionTask: UnifiedTaskDetail | null;
  selectedPresetKey: "imitate" | "balanced" | "transfer";
  onCreateManual: () => void;
  onCreateFromBrief: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  onPresetChange: (value: "imitate" | "balanced" | "transfer") => void;
  onSubmitExtractionTask: () => void;
  onOpenTaskCenter?: (task: UnifiedTaskDetail) => void;
}

export default function WritingFormulaCreateDialog(props: WritingFormulaCreateDialogProps) {
  const {
    open,
    onOpenChange,
    form,
    onFormChange,
    templates,
    createManualPending,
    createFromBriefPending,
    createFromTemplatePending,
    extractTaskSubmitting,
    activeExtractionTask,
    selectedPresetKey,
    onCreateManual,
    onCreateFromBrief,
    onCreateFromTemplate,
    onPresetChange,
    onSubmitExtractionTask,
    onOpenTaskCenter,
  } = props;
  const [activeTab, setActiveTab] = useState<"quick_start" | "blank" | "extract">("quick_start");

  useEffect(() => {
    if (open && activeExtractionTask) {
      setActiveTab("extract");
    }
  }, [activeExtractionTask, open]);

  const extractionTaskIsActive = activeExtractionTask?.status === "queued" || activeExtractionTask?.status === "running";
  const selectedPreset = EXTRACTION_PRESET_OPTIONS.find((item) => item.key === selectedPresetKey) ?? EXTRACTION_PRESET_OPTIONS[1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>创建写法</DialogTitle>
          <DialogDescription>
            先选最省力的起步方式。创建完成后会自动打开当前写法编辑，继续补规则、试写和绑定。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="quick_start">模板起步</TabsTrigger>
            <TabsTrigger value="blank">空白 / AI</TabsTrigger>
            <TabsTrigger value="extract">从文本提取</TabsTrigger>
          </TabsList>

          <TabsContent value="quick_start" className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              手里还没有明确规则时，先从模板起一套最省力。后面都可以继续改。
            </div>
            <div className="grid max-h-[58vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-foreground">{template.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{template.category}</div>
                    </div>
                    <Badge variant="outline">模板</Badge>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-muted-foreground">{template.description}</div>
                  {template.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {template.tags.slice(0, 4).map((tag) => (
                        <Badge key={`${template.id}-${tag}`} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                  {template.applicableGenres.length > 0 ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      适合：{template.applicableGenres.join(" / ")}
                    </div>
                  ) : null}
                  <Button
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => onCreateFromTemplate(template.id)}
                    disabled={createFromTemplatePending}
                  >
                    {createFromTemplatePending ? "创建中..." : "基于这套创建"}
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="blank" className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              你可以手动建一个空白写法，也可以先说一句想要的读感，让 AI 帮你搭第一版骨架。
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="mb-3">
                  <div className="text-sm font-medium text-foreground">手动空白创建</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    适合你已经知道自己要维护什么类型的写法，只想先建一个空壳。
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="例如：都市强冲突快推流"
                    value={form.manualName}
                    onChange={(event) => onFormChange({ manualName: event.target.value })}
                  />
                  <Button
                    className="w-full"
                    onClick={onCreateManual}
                    disabled={!form.manualName.trim() || createManualPending}
                  >
                    {createManualPending ? "创建中..." : "创建空白写法"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3">
                  <div className="text-sm font-medium text-foreground">AI 帮我先搭一套</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    适合你只知道想写成什么感觉，还不想先手填规则字段。
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="写法名称（可选）"
                    value={form.briefName}
                    onChange={(event) => onFormChange({ briefName: event.target.value })}
                  />
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="分类（可选）"
                    value={form.briefCategory}
                    onChange={(event) => onFormChange({ briefCategory: event.target.value })}
                  />
                  <textarea
                    className="min-h-[180px] w-full rounded-md border p-2 text-sm"
                    placeholder="例如：整体推进快，冲突密集，对话直接，情绪不拖泥带水，适合都市和热血升级文。"
                    value={form.briefPrompt}
                    onChange={(event) => onFormChange({ briefPrompt: event.target.value })}
                  />
                  <Button
                    className="w-full"
                    onClick={onCreateFromBrief}
                    disabled={!form.briefPrompt.trim() || createFromBriefPending}
                  >
                    {createFromBriefPending ? "AI 生成中..." : "AI 生成一套写法"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="extract" className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              有稳定样本文本时，系统会把提取和保存放到后台任务里处理。你选好保留策略后提交，完成后会自动保存并打开这套写法。
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="写法名称"
                    value={form.extractName}
                    onChange={(event) => onFormChange({ extractName: event.target.value })}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="分类（可选）"
                    value={form.extractCategory}
                    onChange={(event) => onFormChange({ extractCategory: event.target.value })}
                  />
                </div>
                <textarea
                  className="min-h-[260px] w-full rounded-md border p-2 text-sm"
                  placeholder="粘贴你想提取手感的参考文本。建议至少给一段完整场景。"
                  value={form.extractSourceText}
                  onChange={(event) => onFormChange({ extractSourceText: event.target.value })}
                />
                <Button
                  className="w-full"
                  onClick={onSubmitExtractionTask}
                  disabled={!form.extractName.trim() || !form.extractSourceText.trim() || extractTaskSubmitting || extractionTaskIsActive}
                >
                  {extractTaskSubmitting
                    ? "提交任务中..."
                    : extractionTaskIsActive
                      ? "后台任务进行中..."
                      : "提交提取任务并自动保存"}
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <div className="text-sm font-medium text-foreground">保留策略</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    先决定你要保留多少原始指纹，系统会按这个策略自动生成并保存写法。
                  </div>
                </div>
                <div className="grid gap-3">
                  {EXTRACTION_PRESET_OPTIONS.map((preset) => {
                    const active = preset.key === selectedPresetKey;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? "border-slate-950 bg-slate-950 text-white shadow-lg"
                            : "border-slate-200 bg-white hover:border-slate-400"
                        }`}
                        onClick={() => onPresetChange(preset.key)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold">{preset.label}</div>
                          {active ? <Badge variant="secondary" className="bg-white/10 text-white">当前方案</Badge> : null}
                        </div>
                        <div className={`mt-2 text-sm leading-6 ${active ? "text-slate-200" : "text-slate-600"}`}>
                          {preset.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border bg-amber-50/80 p-3 text-xs leading-6 text-amber-900">
                  当前会按“{selectedPreset.label}”提交后台任务。任务完成后系统会自动保存，不需要再手动点一次保存成写法。
                </div>
                {activeExtractionTask ? (
                  <div className="rounded-xl border bg-slate-50/80 p-4 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">当前后台任务</div>
                      <Badge variant={extractionTaskIsActive ? "secondary" : "outline"}>
                        {formatTaskStatus(activeExtractionTask)}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                      <div>任务标题：{activeExtractionTask.title}</div>
                      <div>当前阶段：{activeExtractionTask.currentStage ?? "等待调度"}</div>
                      <div>任务进度：{Math.round(activeExtractionTask.progress * 100)}%</div>
                      {activeExtractionTask.failureSummary ? (
                        <div className="text-rose-600">异常原因：{activeExtractionTask.failureSummary}</div>
                      ) : null}
                    </div>
                    {onOpenTaskCenter ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={() => onOpenTaskCenter(activeExtractionTask)}
                      >
                        去任务中心查看
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">
                    提交后系统会在后台完成提取、套用保留策略并自动保存写法。你可以先关掉弹窗，完成后会自动打开结果。
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
