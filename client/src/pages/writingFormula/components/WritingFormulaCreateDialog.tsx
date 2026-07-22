import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_670b95ab"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_38cd0be2"),
  },
  {
    key: "balanced",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.preserveMainReadFeel"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.preserveReadFeelAndProgressRhythmWeakenOverStrongFingerprintSuitableForMostProjectsDirectUse"),
  },
  {
    key: "transfer",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_6da989b7"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_ef957e52"),
  },
] as const;

const MATERIAL_SOURCE_OPTIONS: Array<{
  key: WritingFormulaMaterialSource;
  label: string;
  summary: string;
}> = [
  {
    key: "direct_text",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_26f1d00f"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_62c7ec91"),
  },
  {
    key: "knowledge_document",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_51a7e4d2"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_04b0ad79"),
  },
  {
    key: "book_analysis",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_64d477d1"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_585484cd"),
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
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_a42e20c2"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.extractRepresentativeSamples"),
    badge: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_3f981012"),
  },
  {
    key: "full_text",
    label: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_fc456238"),
    summary: t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_04ac9582"),
  },
];

function formatTaskStatus(task: UnifiedTaskDetail | null): string {
  if (!task) {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_0589e591");
  }
  if (task.status === "queued") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_e5ac1d20");
  }
  if (task.status === "running") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_5d459d55");
  }
  if (task.status === "succeeded") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_fad5222c");
  }
  if (task.status === "failed") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_acd5cb84");
  }
  if (task.status === "cancelled") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_2111ccbb");
  }
  return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_3ced7e48");
}

function formatCharCount(value: number | null | undefined): string {
  if (!value) {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.zeroCharacters");
  }
  return `${value.toLocaleString("zh-CN")} 字`;
}

function formatKnowledgeStatus(status: KnowledgeDocumentSummary["status"]): string {
  if (status === "enabled") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_ad6b7038");
  }
  if (status === "disabled") {
    return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_5c56a889");
  }
  return t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_2f51c18f");
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
    ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_从拆书结果创建写法_spus")
    : form.materialSource === "knowledge_document"
      ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.extractAndAutoSaveOriginalTextKnowledgeBase")
      : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_3a428b93");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_68a34a89")}</DialogTitle>
          <DialogDescription>
            先选最省力的起步方式。创建完成后会自动打开当前写法编辑，继续补规则、试写和绑定。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex min-h-0 flex-1 flex-col space-y-4">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            <TabsTrigger value="quick_start">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_fefda8fe")}</TabsTrigger>
            <TabsTrigger value="blank">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_63db6415")}</TabsTrigger>
            <TabsTrigger value="extract">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.extractFromMaterials")}</TabsTrigger>
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
                    <Badge variant="outline">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_59cf15fe")}</Badge>
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
                    {createFromTemplatePending ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_b26107b6") : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_e32593d7")}
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
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_53a4c0f4")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    适合你已经知道自己要维护什么类型的写法，只想先建一个空壳。
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_例如都市强冲突快推流_hf3h")}
                    value={form.manualName}
                    onChange={(event) => onFormChange({ manualName: event.target.value })}
                  />
                  <Button
                    className="w-full"
                    onClick={onCreateManual}
                    disabled={!form.manualName.trim() || createManualPending}
                  >
                    {createManualPending ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_b26107b6") : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_94dde803")}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3">
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.aiHelpBuildSet")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    适合你只知道想写成什么感觉，还不想先手填规则字段。
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_5eac1d80")}
                    value={form.briefName}
                    onChange={(event) => onFormChange({ briefName: event.target.value })}
                  />
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_1befc273")}
                    value={form.briefCategory}
                    onChange={(event) => onFormChange({ briefCategory: event.target.value })}
                  />
                  <textarea
                    className="min-h-[180px] w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.exampleFastProgressiveConflictDirectDialogueEmotionFitsUrbanHeatUpgrade")}
                    value={form.briefPrompt}
                    onChange={(event) => onFormChange({ briefPrompt: event.target.value })}
                  />
                  <Button
                    className="w-full"
                    onClick={onCreateFromBrief}
                    disabled={!form.briefPrompt.trim() || createFromBriefPending}
                  >
                    {createFromBriefPending ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.aiGeneratingLoading") : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.aiGenerateWritingStyleSet")}
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
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_a5d0edd4")}
                    value={form.extractName}
                    onChange={(event) => onFormChange({ extractName: event.target.value })}
                  />
                  {form.materialSource !== "book_analysis" ? (
                    <input
                      className="rounded-md border p-2 text-sm"
                      placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_1befc273")}
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
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_55494a88")}
                    value={form.extractSourceText}
                    onChange={(event) => onFormChange({ extractSourceText: event.target.value })}
                  />
                ) : null}

                {form.materialSource === "knowledge_document" ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_32d6b5f5")}
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
                                {selected ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_f08afd1f") : formatKnowledgeStatus(document.status)}
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
                        <div className="text-sm font-medium text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_3d97e69b")}</div>
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
                        t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_b363cd08")
                      ) : selectedKnowledgeDocument ? (
                        <>
                          <div className="font-medium text-slate-950">{selectedKnowledgeDocument.title}</div>
                          {activeKnowledgeVersion ? (
                            <div className="mt-1 text-xs text-slate-500">
                              活动版本 v{activeKnowledgeVersion.versionNumber} · {formatCharCount(activeKnowledgeVersion.charCount)}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-amber-700">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_e6b3a549")}</div>
                          )}
                          {activeKnowledgeVersion && !activeKnowledgeVersion.content.trim() ? (
                            <div className="mt-1 text-xs text-amber-700">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_0ee1d1fb")}</div>
                          ) : null}
                        </>
                      ) : (
                        t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_131c45bb")
                      )}
                    </div>
                  </div>
                ) : null}

                {form.materialSource === "book_analysis" ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder={t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_8af1aea1")}
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
                                {selected ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_f08afd1f") : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_882ba885")}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-500">
                              来源版本 v{analysis.documentVersionNumber} · {analysis.summary || t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_5299f9e8")}
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
                      ? form.materialSource === "book_analysis" ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_4d020ba3") : t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_c661e656")
                      : extractionTaskIsActive && form.materialSource !== "book_analysis"
                        ? t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_c5a43600")
                        : materialSubmitLabel}
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                {form.materialSource === "book_analysis" ? (
                  <>
                    <div>
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_0ea66184")}</div>
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
                        t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_47d21a58")
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.preserveStrategy")}</div>
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
                              {active ? <Badge variant="secondary" className="bg-white/10 text-white">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_ce717abb")}</Badge> : null}
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
                          <div className="font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_fea28a8c")}</div>
                          <Badge variant={extractionTaskIsActive ? "secondary" : "outline"}>
                            {formatTaskStatus(activeExtractionTask)}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                          <div>{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.taskTitleActiveExtractionTask")}</div>
                          <div>{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_f024aecf")}</div>
                          <div>{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.taskProgressRoundActiveExtractionTaskProgress100Percent")}</div>
                          {activeExtractionTask.failureSummary ? (
                            <div className="text-rose-600">{t("gen.pages.writingFormula.components.WritingFormulaCreateDialog.gen_bd248a2f")}</div>
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
