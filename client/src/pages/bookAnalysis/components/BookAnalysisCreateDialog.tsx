import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import {
  BOOK_ANALYSIS_PRESETS,
  BOOK_ANALYSIS_SECTIONS,
  DEFAULT_BOOK_ANALYSIS_BUDGET_TOKENS,
  type BookAnalysisPreset,
} from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter, KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import LLMSelector from "@/components/common/LLMSelector";
import BookAnalysisSourceRangePicker from "./BookAnalysisSourceRangePicker";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LLMConfigState } from "../bookAnalysis.types";
import type { BookAnalysisMode, BookAnalysisSourceRangeDraft, NovelOption } from "../hooks/bookAnalysisWorkspace.types";
import SelectControl from "@/components/common/SelectControl";

interface BookAnalysisCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisMode: BookAnalysisMode;
  selectedDocumentId: string;
  selectedVersionId: string;
  selectedDiagnosisNovelId: string;
  userFocusInstruction: string;
  selectedSourceRange: BookAnalysisSourceRangeDraft;
  budgetTokens: number | null;
  analysisPreset: BookAnalysisPreset;
  llmConfig: LLMConfigState;
  documentOptions: KnowledgeDocumentSummary[];
  versionOptions: KnowledgeDocumentDetail["versions"];
  sourceDocument?: KnowledgeDocumentDetail;
  sourceChapters: DocumentChapter[];
  sourceChaptersRequested: boolean;
  sourceChaptersLoading: boolean;
  sourceChaptersError: string;
  novelOptions: NovelOption[];
  createPending: boolean;
  createDiagnosisPending: boolean;
  onModeChange: (mode: BookAnalysisMode) => void;
  onSelectDocument: (documentId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onSelectDiagnosisNovel: (novelId: string) => void;
  onUserFocusInstructionChange: (instruction: string) => void;
  onSourceRangeChange: (range: BookAnalysisSourceRangeDraft) => void;
  onBudgetTokensChange: (budgetTokens: number | null) => void;
  onRequestSourceChapters: () => void;
  onAnalysisPresetChange: (preset: BookAnalysisPreset) => void;
  onLlmConfigChange: (config: LLMConfigState) => void;
  onCreate: () => void;
  onCreateDiagnosis: () => void;
}

const ESTIMATED_SEGMENT_CHARS = 10_000;
const MAX_ESTIMATED_SEGMENTS = 12;

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getBookAnalysisScaleLabel(charCount: number): { label: string; tone: string } {
  if (charCount >= 300_000) {
    return { label: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_ef9a46bf"), tone: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_c2f7f484") };
  }
  if (charCount >= 100_000) {
    return { label: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.mediumVolume"), tone: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_4c932ebc") };
  }
  return { label: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_9510eff9"), tone: t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_684d2554") };
}

function getPresetSectionTitles(sectionKeys: readonly string[]): string {
  return sectionKeys
    .map((key) => BOOK_ANALYSIS_SECTIONS.find((section) => section.key === key)?.title)
    .filter((title): title is string => Boolean(title))
    .join("、");
}

export default function BookAnalysisCreateDialog(props: BookAnalysisCreateDialogProps) {
  const {
    open,
    onOpenChange,
    analysisMode,
    selectedDocumentId,
    selectedVersionId,
    selectedDiagnosisNovelId,
    userFocusInstruction,
    selectedSourceRange,
    budgetTokens,
    analysisPreset,
    llmConfig,
    documentOptions,
    versionOptions,
    sourceDocument,
    sourceChapters,
    sourceChaptersRequested,
    sourceChaptersLoading,
    sourceChaptersError,
    novelOptions,
    createPending,
    createDiagnosisPending,
    onModeChange,
    onSelectDocument,
    onSelectVersion,
    onSelectDiagnosisNovel,
    onUserFocusInstructionChange,
    onSourceRangeChange,
    onBudgetTokensChange,
    onRequestSourceChapters,
    onAnalysisPresetChange,
    onLlmConfigChange,
    onCreate,
    onCreateDiagnosis,
  } = props;

  const isDiagnosisMode = analysisMode === "diagnosis";
  const selectedSourceVersion = sourceDocument?.versions.find((version) => version.id === selectedVersionId)
    ?? sourceDocument?.versions.find((version) => version.isActive)
    ?? sourceDocument?.versions[0];
  const sourceCharCount = selectedSourceVersion?.charCount ?? selectedSourceVersion?.content.length ?? 0;
  const sortedSourceChapters = [...sourceChapters].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const rangeStartChapter = selectedSourceRange
    ? sortedSourceChapters.find((chapter) => chapter.chapterIndex === selectedSourceRange.startChapterIndex)
    : null;
  const rangeEndChapter = selectedSourceRange
    ? sortedSourceChapters.find((chapter) => chapter.chapterIndex === selectedSourceRange.endChapterIndex)
    : null;
  const selectedRangeCharCount = rangeStartChapter && rangeEndChapter
    ? Math.max(0, rangeEndChapter.endOffset - rangeStartChapter.startOffset)
    : sourceCharCount;
  const effectiveSourceCharCount = selectedSourceRange ? selectedRangeCharCount : sourceCharCount;
  const sourceRangeValid = !selectedSourceRange || Boolean(rangeStartChapter && rangeEndChapter && selectedRangeCharCount > 0);
  const estimatedSegmentCount = effectiveSourceCharCount > 0
    ? Math.min(MAX_ESTIMATED_SEGMENTS, Math.max(1, Math.ceil(effectiveSourceCharCount / ESTIMATED_SEGMENT_CHARS)))
    : 0;
  const selectedPreset = BOOK_ANALYSIS_PRESETS.find((preset) => preset.key === analysisPreset) ?? BOOK_ANALYSIS_PRESETS[1];
  const estimatedSectionCount = selectedPreset.sectionKeys.length;
  const estimatedLlmCalls = estimatedSegmentCount > 0 ? estimatedSegmentCount + estimatedSectionCount : 0;
  const scale = getBookAnalysisScaleLabel(effectiveSourceCharCount);

  const canSubmit = isDiagnosisMode
    ? Boolean(selectedDiagnosisNovelId) && !createDiagnosisPending
    : Boolean(selectedDocumentId) && sourceRangeValid && !createPending;
  const submitting = isDiagnosisMode ? createDiagnosisPending : createPending;
  const submitLabel = isDiagnosisMode
    ? (createDiagnosisPending ? t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_c8cb0226") : t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_50e2e2d4"))
    : (createPending ? t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_890cac7b") : t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_b96a18d9"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_08277d71")}
        description={t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_26abfe76")}
        className="max-w-4xl"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={isDiagnosisMode ? onCreateDiagnosis : onCreate}
            >
              {submitLabel}
            </Button>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-1">
              <Button
                type="button"
                size="sm"
                variant={analysisMode === "reference" ? "default" : "ghost"}
                onClick={() => onModeChange("reference")}
              >
                参考作品
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isDiagnosisMode ? "default" : "ghost"}
                onClick={() => onModeChange("diagnosis")}
              >
                诊断稿子
              </Button>
            </div>

            {isDiagnosisMode ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_c9eedcd0")}</div>
                <SelectControl
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedDiagnosisNovelId}
                  onChange={(event) => onSelectDiagnosisNovel(event.target.value)}
                >
                  <option value="">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_44cddc3d")}</option>
                  {novelOptions.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </SelectControl>
                <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                  系统会导出这本小说的当前章节正文，作为新的知识文档创建诊断拆书。
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_a597ef78")}</div>
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedDocumentId}
                    onChange={(event) => onSelectDocument(event.target.value)}
                  >
                    <option value="">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_a70ee8be")}</option>
                    {documentOptions.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                  </SelectControl>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_f1cee000")}</div>
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedVersionId}
                    onChange={(event) => onSelectVersion(event.target.value)}
                    disabled={!selectedDocumentId}
                  >
                    <option value="">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_使用当前激活版本_01b6")}</option>
                    {versionOptions.map((version) => (
                      <option key={version.id} value={version.id}>
                        v{version.versionNumber} {version.isActive ? t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_7588ab69") : ""}
                      </option>
                    ))}
                  </SelectControl>
                </div>
              </div>
                <BookAnalysisSourceRangePicker
                  selectedRange={selectedSourceRange}
                  sourceChapters={sourceChapters}
                  sourceCharCount={sourceCharCount}
                  sourceSelected={Boolean(selectedDocumentId)}
                  chaptersRequested={sourceChaptersRequested}
                  chaptersLoading={sourceChaptersLoading}
                  chaptersError={sourceChaptersError}
                  onRangeChange={onSourceRangeChange}
                  onRequestChapters={onRequestSourceChapters}
                />
              </>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_8000f187")}</div>
              <LLMSelector
                value={llmConfig}
                onChange={(next) =>
                  onLlmConfigChange({
                    provider: next.provider,
                    model: next.model,
                    temperature: next.temperature ?? llmConfig.temperature,
                    maxTokens: next.maxTokens ?? llmConfig.maxTokens,
                  })
                }
                showParameters
              />
              <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                <div>
                  <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_b474d723")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    留空使用服务端默认值。累计用量达到上限后停止任务，已完成的小节会保留。
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1000}
                    max={10000000}
                    step={1000}
                    placeholder={DEFAULT_BOOK_ANALYSIS_BUDGET_TOKENS.toLocaleString("zh-CN")}
                    value={budgetTokens ?? ""}
                    onChange={(event) => {
                      if (!event.target.value) {
                        onBudgetTokensChange(null);
                        return;
                      }
                      const next = Number(event.target.value);
                      onBudgetTokensChange(Number.isFinite(next) ? Math.max(1000, Math.min(10000000, Math.floor(next))) : null);
                    }}
                    className="text-right font-mono tabular-nums"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">tokens</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_1a00cbf4")}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {BOOK_ANALYSIS_PRESETS.map((preset) => {
                  const selected = preset.key === analysisPreset;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`rounded-md border p-3 text-left transition-colors ${
                        selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                      }`}
                      onClick={() => onAnalysisPresetChange(preset.key)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{preset.title}</div>
                        <div className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.presetCount")}</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{preset.summary}</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        包含：{getPresetSectionTitles(preset.sectionKeys)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_48b141e3")}</div>
              <textarea
                className="min-h-[92px] w-full rounded-md border bg-background p-3 text-sm"
                value={userFocusInstruction}
                onChange={(event) => onUserFocusInstructionChange(event.target.value)}
                placeholder={isDiagnosisMode
                  ? t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_06f379b4")
                  : t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_9cc5c446")}
              />
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-foreground">
              {isDiagnosisMode
                ? t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_95778722")
                : t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_f5f49733")}
            </div>

            {!isDiagnosisMode && selectedSourceVersion ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCreateDialog.gen_3011bbd9")}</div>
                <div className="mt-1">
                  约 {formatCount(effectiveSourceCharCount)} 字，预计拆成 {estimatedSegmentCount} 个原文片段，
                  约 {estimatedLlmCalls} 次模型调用。
                </div>
                <div className="mt-1">{scale.tone}</div>
              </div>
            ) : null}

            {!isDiagnosisMode && sourceDocument ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                版本数：{sourceDocument.versions.length} | 已有拆书：{sourceDocument.bookAnalysisCount}
              </div>
            ) : null}
          </aside>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
