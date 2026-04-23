import { useEffect, useState } from "react";
import type { BookAnalysis } from "@ai-novel/shared/types/bookAnalysis";
import type { KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import type { StyleExtractionSourceProcessingMode, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
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
import type {
  WritingFormulaCreateFormState,
  WritingFormulaMaterialSource,
} from "../useWritingFormulaCreateFlow";

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

const MATERIAL_SOURCE_OPTIONS: Array<{
  key: WritingFormulaMaterialSource;
  label: string;
  summary: string;
}> = [
  {
    key: "direct_text",
    label: "直接粘贴文本",
    summary: "把样本文本交给后台提取任务，适合手里已有片段或章节。",
  },
  {
    key: "knowledge_document",
    label: "知识库原文",
    summary: "选择知识库文档活动版本，系统冻结全文快照后用代表性样本学习写法。",
  },
  {
    key: "book_analysis",
    label: "拆书结果",
    summary: "直接使用拆书里的文风与技法结果生成写法。",
  },
];

const KNOWLEDGE_SOURCE_PROCESSING_OPTIONS: Array<{
  key: StyleExtractionSourceProcessingMode;
  label: string;
  summary: string;
  badge?: string;
}> = [
  {
    key: "representative_sample",
    label: "智能抽样",
    summary: "从开篇、中段、后段和收束抽取代表性样本，适合长篇原文，速度和稳定性更好。",
    badge: "推荐",
  },
  {
    key: "full_text",
    label: "全文提取",
    summary: "把活动版本全文作为模型输入，适合短文档；长篇可能更慢，也更容易触发模型上下文或超时限制。",
  },
];

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

function formatCharCount(value: number | null | undefined): string {
  if (!value) {
    return "0 字";
  }
  return `${value.toLocaleString("zh-CN")} 字`;
}

function formatKnowledgeStatus(status: KnowledgeDocumentSummary["status"]): string {
  if (status === "enabled") {
    return "可用";
  }
  if (status === "disabled") {
    return "停用";
  }
  return "归档";
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
  knowledgeDocuments: KnowledgeDocumentSummary[];
  knowledgeDocumentsLoading: boolean;
  selectedKnowledgeDocument: KnowledgeDocumentDetail | null;
  selectedKnowledgeDocumentLoading: boolean;
  bookAnalyses: BookAnalysis[];
  bookAnalysesLoading: boolean;
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
    knowledgeDocuments,
    knowledgeDocumentsLoading,
    selectedKnowledgeDocument,
    selectedKnowledgeDocumentLoading,
    bookAnalyses,
    bookAnalysesLoading,
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
  const activeKnowledgeVersion = selectedKnowledgeDocument?.versions.find((version) => version.isActive) ?? null;
  const selectedBookAnalysis = bookAnalyses.find((analysis) => analysis.id === form.bookAnalysisId) ?? null;
  const knowledgeDocumentReady = Boolean(
    selectedKnowledgeDocument
      && selectedKnowledgeDocument.status !== "archived"
      && activeKnowledgeVersion
      && activeKnowledgeVersion.content.trim(),
  );
  const bookAnalysisReady = Boolean(form.bookAnalysisId);
  const materialSubmitDisabled = extractTaskSubmitting
    || (form.materialSource !== "book_analysis" && extractionTaskIsActive)
    || !form.extractName.trim()
    || (form.materialSource === "direct_text" && !form.extractSourceText.trim())
    || (form.materialSource === "knowledge_document" && !knowledgeDocumentReady)
    || (form.materialSource === "book_analysis" && !bookAnalysisReady);
  const materialSubmitLabel = form.materialSource === "book_analysis"
    ? "从拆书结果创建写法"
    : form.materialSource === "knowledge_document"
      ? "从知识库原文提取并自动保存"
      : "提交提取任务并自动保存";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>创建写法</DialogTitle>
          <DialogDescription>
            先选最省力的起步方式。创建完成后会自动打开当前写法编辑，继续补规则、试写和绑定。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex min-h-0 flex-1 flex-col space-y-4">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            <TabsTrigger value="quick_start">模板起步</TabsTrigger>
            <TabsTrigger value="blank">空白 / AI</TabsTrigger>
            <TabsTrigger value="extract">从素材提取</TabsTrigger>
          </TabsList>

          <TabsContent value="quick_start" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              手里还没有明确规则时，先从模板起一套最省力。后面都可以继续改。
            </div>
            <div className="grid gap-3 pr-1 md:grid-cols-2">
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

          <TabsContent value="blank" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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

          <TabsContent value="extract" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              从素材中创建写法。文本和知识库原文会进入后台提取任务；拆书结果会直接使用文风与技法分析生成写法。
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="space-y-4 rounded-lg border p-4">
                <div className={form.materialSource === "book_analysis" ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="写法名称"
                    value={form.extractName}
                    onChange={(event) => onFormChange({ extractName: event.target.value })}
                  />
                  {form.materialSource !== "book_analysis" ? (
                    <input
                      className="rounded-md border p-2 text-sm"
                      placeholder="分类（可选）"
                      value={form.extractCategory}
                      onChange={(event) => onFormChange({ extractCategory: event.target.value })}
                    />
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {MATERIAL_SOURCE_OPTIONS.map((option) => {
                    const active = option.key === form.materialSource;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          active
                            ? "border-slate-950 bg-slate-950 text-white shadow"
                            : "border-slate-200 bg-white hover:border-slate-400"
                        }`}
                        onClick={() => onFormChange({ materialSource: option.key })}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className={`mt-1 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-500"}`}>
                          {option.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {form.materialSource === "direct_text" ? (
                  <textarea
                    className="min-h-[260px] w-full rounded-md border p-2 text-sm"
                    placeholder="粘贴你想提取手感的参考文本。建议至少给一段完整场景。"
                    value={form.extractSourceText}
                    onChange={(event) => onFormChange({ extractSourceText: event.target.value })}
                  />
                ) : null}

                {form.materialSource === "knowledge_document" ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="搜索知识库文档标题或文件名"
                      value={form.knowledgeSearchKeyword}
                      onChange={(event) => onFormChange({ knowledgeSearchKeyword: event.target.value })}
                    />
                    <div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">
                      {knowledgeDocumentsLoading && knowledgeDocuments.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                          检索知识库文档中...
                        </div>
                      ) : null}
                      {!knowledgeDocumentsLoading && knowledgeDocuments.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                          没有找到可用知识库文档。可以先到知识库上传原文，再回到这里创建写法。
                        </div>
                      ) : null}
                      {knowledgeDocuments.map((document) => {
                        const selected = document.id === form.knowledgeDocumentId;
                        return (
                          <button
                            key={document.id}
                            type="button"
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              selected ? "border-slate-950 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-400"
                            }`}
                            disabled={document.status === "archived"}
                            onClick={() => onFormChange({
                              knowledgeDocumentId: document.id,
                              knowledgeDocumentTitle: document.title,
                              extractName: form.extractName.trim() ? form.extractName : `${document.title}写法`,
                            })}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-slate-950">{document.title}</div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">{document.fileName}</div>
                              </div>
                              <Badge variant={selected ? "default" : "outline"}>
                                {selected ? "已选择" : formatKnowledgeStatus(document.status)}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-500">
                              活动版本 v{document.activeVersionNumber} · {document.versionCount} 个版本 · {document.bookAnalysisCount} 个拆书结果
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-2 rounded-xl border bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-950">原文处理方式</div>
                        {activeKnowledgeVersion ? (
                          <div className="text-xs text-slate-500">
                            来源快照 {formatCharCount(activeKnowledgeVersion.charCount)}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {KNOWLEDGE_SOURCE_PROCESSING_OPTIONS.map((option) => {
                          const active = option.key === form.knowledgeSourceProcessingMode;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              className={`rounded-xl border px-3 py-3 text-left transition ${
                                active
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white hover:border-slate-400"
                              }`}
                              onClick={() => onFormChange({ knowledgeSourceProcessingMode: option.key })}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold">{option.label}</div>
                                {option.badge ? (
                                  <Badge variant={active ? "secondary" : "outline"}>{option.badge}</Badge>
                                ) : null}
                              </div>
                              <div className={`mt-1 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-500"}`}>
                                {option.summary}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {form.knowledgeSourceProcessingMode === "representative_sample" ? (
                        <div className="text-xs leading-5 text-slate-500">
                          写法资产会继续保留完整来源预览；模型只读取代表性样本，避免长篇全文一次性超出模型承载能力。
                        </div>
                      ) : (
                        <div className="text-xs leading-5 text-amber-700">
                          全文提取会把活动版本全文交给模型。长篇原文建议先使用智能抽样。
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border bg-slate-50/80 p-3 text-sm leading-6 text-slate-700">
                      {selectedKnowledgeDocumentLoading ? (
                        "读取所选文档的活动版本..."
                      ) : selectedKnowledgeDocument ? (
                        <>
                          <div className="font-medium text-slate-950">{selectedKnowledgeDocument.title}</div>
                          {activeKnowledgeVersion ? (
                            <div className="mt-1 text-xs text-slate-500">
                              活动版本 v{activeKnowledgeVersion.versionNumber} · {formatCharCount(activeKnowledgeVersion.charCount)}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-amber-700">所选文档缺少活动版本，不能提交。</div>
                          )}
                          {activeKnowledgeVersion && !activeKnowledgeVersion.content.trim() ? (
                            <div className="mt-1 text-xs text-amber-700">活动版本正文为空，不能提交。</div>
                          ) : null}
                        </>
                      ) : (
                        "选择一个知识库文档后，系统会读取活动版本全文并在提交任务时冻结快照。"
                      )}
                    </div>
                  </div>
                ) : null}

                {form.materialSource === "book_analysis" ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="搜索拆书标题或来源文档"
                      value={form.bookAnalysisSearchKeyword}
                      onChange={(event) => onFormChange({ bookAnalysisSearchKeyword: event.target.value })}
                    />
                    <div className="grid max-h-[290px] gap-2 overflow-y-auto pr-1">
                      {bookAnalysesLoading && bookAnalyses.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                          检索拆书结果中...
                        </div>
                      ) : null}
                      {!bookAnalysesLoading && bookAnalyses.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                          没有找到可用拆书结果。完成拆书后，可以在这里直接生成写法。
                        </div>
                      ) : null}
                      {bookAnalyses.map((analysis) => {
                        const selected = analysis.id === form.bookAnalysisId;
                        return (
                          <button
                            key={analysis.id}
                            type="button"
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              selected ? "border-slate-950 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-400"
                            }`}
                            onClick={() => onFormChange({
                              bookAnalysisId: analysis.id,
                              bookAnalysisTitle: analysis.title,
                              extractName: form.extractName.trim() ? form.extractName : `${analysis.title}写法`,
                            })}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-slate-950">{analysis.title}</div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">{analysis.documentTitle}</div>
                              </div>
                              <Badge variant={selected ? "default" : "outline"}>
                                {selected ? "已选择" : "可生成"}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-500">
                              来源版本 v{analysis.documentVersionNumber} · {analysis.summary || "拆书结果可用于生成写法"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur">
                  <Button
                    className="w-full"
                    onClick={onSubmitExtractionTask}
                    disabled={materialSubmitDisabled}
                  >
                    {extractTaskSubmitting
                      ? form.materialSource === "book_analysis" ? "生成中..." : "提交任务中..."
                      : extractionTaskIsActive && form.materialSource !== "book_analysis"
                        ? "后台任务进行中..."
                        : materialSubmitLabel}
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                {form.materialSource === "book_analysis" ? (
                  <>
                    <div>
                      <div className="text-sm font-medium text-foreground">拆书结果生成</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        这一路会直接读取拆书里的文风与技法小节，生成后立即打开写法编辑。
                      </div>
                    </div>
                    <div className="rounded-xl border bg-slate-50/80 p-4 text-sm leading-6 text-slate-700">
                      {selectedBookAnalysis ? (
                        <>
                          <div className="font-medium text-slate-950">{selectedBookAnalysis.title}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            来源文档：{selectedBookAnalysis.documentTitle} · v{selectedBookAnalysis.documentVersionNumber}
                          </div>
                          {selectedBookAnalysis.summary ? (
                            <div className="mt-3 text-xs leading-6 text-slate-600">{selectedBookAnalysis.summary}</div>
                          ) : null}
                        </>
                      ) : (
                        "选择一个拆书结果后，系统会用文风与技法分析生成写法，不进入后台提取任务。"
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                      会按“{selectedPreset.label}”提交后台任务。任务完成后系统会自动保存，不需要再手动点一次保存成写法。
                    </div>
                    {activeExtractionTask ? (
                      <div className="rounded-xl border bg-slate-50/80 p-4 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">后台任务</div>
                          <Badge variant={extractionTaskIsActive ? "secondary" : "outline"}>
                            {formatTaskStatus(activeExtractionTask)}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                          <div>任务标题：{activeExtractionTask.title}</div>
                          <div>执行阶段：{activeExtractionTask.currentStage ?? "等待调度"}</div>
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
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
