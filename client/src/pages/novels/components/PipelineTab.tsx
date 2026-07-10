import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ReactNode } from "react";
import type { Chapter, NovelBible, PipelineJob, PlotBeat, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import CollapsibleSummary from "./CollapsibleSummary";
import WorldInjectionHint from "./WorldInjectionHint";
import { getLowScoreChapterRange, getPipelineStageState, PIPELINE_STAGE_ITEMS } from "./pipelineTab.utils";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import SelectControl from "@/components/common/SelectControl";

interface PipelineTabProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  directorTakeoverEntry?: ReactNode;
  onGoToCharacterTab: () => void;
  pipelineForm: {
    startOrder: number;
    endOrder: number;
    maxRetries: number;
    runMode: "fast" | "polish";
    autoReview: boolean;
    autoRepair: boolean;
    skipCompleted: boolean;
    qualityThreshold: number;
    repairMode: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
  };
  onPipelineFormChange: (
    field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode",
    value: number | boolean | string,
  ) => void;
  maxOrder: number;
  onGenerateBible: () => void;
  onAbortBible: () => void;
  isBibleStreaming: boolean;
  bibleStreamContent: string;
  onGenerateBeats: () => void;
  onAbortBeats: () => void;
  isBeatsStreaming: boolean;
  beatsStreamContent: string;
  onRunPipeline: (patch?: Partial<PipelineTabProps["pipelineForm"]>) => void;
  isRunningPipeline: boolean;
  pipelineMessage: string;
  pipelineJob?: PipelineJob;
  chapters: Chapter[];
  selectedChapterId: string;
  onSelectedChapterChange: (chapterId: string) => void;
  onReviewChapter: () => void;
  isReviewing: boolean;
  onRepairChapter: () => void;
  isRepairing: boolean;
  onGenerateHook: () => void;
  isGeneratingHook: boolean;
  reviewResult: {
    score: QualityScore;
    issues: ReviewIssue[];
  } | null;
  repairBeforeContent: string;
  repairAfterContent: string;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
  qualitySummary?: QualityScore;
  chapterReports: Array<{
    chapterId?: string | null;
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  }>;
  bible?: NovelBible | null;
  plotBeats: PlotBeat[];
}

function repairModeLabel(mode: PipelineTabProps["pipelineForm"]["repairMode"]): string {
  const mapping: Record<PipelineTabProps["pipelineForm"]["repairMode"], string> = {
    detect_only: t("gen.pages.novels.components.PipelineTab.gen_af284883"),
    light_repair: t("gen.pages.novels.components.PipelineTab.gen_82aaf5f8"),
    heavy_repair: t("gen.pages.novels.components.PipelineTab.gen_795f45db"),
    continuity_only: t("gen.pages.novels.components.PipelineTab.gen_2f630185"),
    character_only: t("gen.pages.novels.components.PipelineTab.gen_53776535"),
    ending_only: t("gen.pages.novels.components.PipelineTab.gen_8f96a7e8"),
  };
  return mapping[mode];
}

function stageStatusLabel(state: "pending" | "active" | "completed" | "failed"): string {
  if (state === "active") return t("gen.pages.novels.components.PipelineTab.gen_fb852fc6");
  if (state === "completed") return t("gen.pages.novels.components.PipelineTab.gen_fad5222c");
  if (state === "failed") return t("gen.pages.novels.components.PipelineTab.gen_c195df63");
  return t("gen.pages.novels.components.PipelineTab.gen_6139a699");
}

export default function PipelineTab(props: PipelineTabProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    onGoToCharacterTab,
    pipelineForm,
    onPipelineFormChange,
    maxOrder,
    onGenerateBible,
    onAbortBible,
    isBibleStreaming,
    bibleStreamContent,
    onGenerateBeats,
    onAbortBeats,
    isBeatsStreaming,
    beatsStreamContent,
    onRunPipeline,
    isRunningPipeline,
    pipelineMessage,
    pipelineJob,
    chapters,
    selectedChapterId,
    onSelectedChapterChange,
    onReviewChapter,
    isReviewing,
    onRepairChapter,
    isRepairing,
    onGenerateHook,
    isGeneratingHook,
    reviewResult,
    repairBeforeContent,
    repairAfterContent,
    repairStreamContent,
    isRepairStreaming,
    onAbortRepair,
    qualitySummary,
    chapterReports,
    bible,
    plotBeats,
    directorTakeoverEntry,
  } = props;

  const lowScoreRange = getLowScoreChapterRange(chapters, chapterReports, pipelineForm.qualityThreshold);
  const lowScoreReports = chapterReports
    .filter((item) => item.chapterId && item.overall < pipelineForm.qualityThreshold)
    .slice(0, 12);
  const pendingRepairCount = chapterReports.filter((item) => item.chapterId && item.overall < pipelineForm.qualityThreshold).length;

  const exportPipelineReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      pipelineForm,
      pipelineJob,
      qualitySummary,
      chapterReports,
      lowScoreThreshold: pipelineForm.qualityThreshold,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pipeline-report-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title={t("gen.pages.novels.components.PipelineTab.takeoverFromQualityFix")}
        description={t("gen.pages.novels.components.PipelineTab.aiCheckActiveBatchOrCheckpoint")}
        entry={directorTakeoverEntry}
      />
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="rounded-2xl bg-muted/20 px-5 py-4">
          <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_df504fca")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-0 pt-5">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span>{t("gen.pages.novels.components.PipelineTab.gen_6d1840c2")}</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>{t("gen.pages.novels.components.PipelineTab.gen_ef2c69b9")}</Button>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_657ac21a")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {pendingRepairCount > 0 ? `先处理 ${pendingRepairCount} 个低分章节` : t("gen.pages.novels.components.PipelineTab.gen_61ca66fc")}
              </div>
            </div>
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_ae823fce")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{pipelineForm.qualityThreshold}</div>
            </div>
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_ff87de99")}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{t("gen.pages.novels.components.PipelineTab.runModeText")}</div>
            </div>
          </div>
          {pipelineMessage ? <div className="text-sm text-muted-foreground">{pipelineMessage}</div> : null}
        </CardContent>
      </Card>

      <Card className="border-0 bg-muted/15 shadow-none">
        <CardHeader>
          <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_687b3bfc")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectControl
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selectedChapterId}
            onChange={(event) => onSelectedChapterChange(event.target.value)}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{t("gen.pages.novels.components.PipelineTab.gen_6b257030")}</option>
            ))}
          </SelectControl>
          <div className="flex flex-wrap gap-2">
            <AiButton onClick={onReviewChapter} disabled={isReviewing || !selectedChapterId}>{t("gen.pages.novels.components.PipelineTab.gen_72dd900b")}</AiButton>
            <AiButton variant="secondary" onClick={onRepairChapter} disabled={isRepairing || !selectedChapterId}>{t("gen.pages.novels.components.PipelineTab.gen_32c8e3bb")}</AiButton>
            <AiButton variant="outline" onClick={onGenerateHook} disabled={isGeneratingHook || !selectedChapterId}>{t("gen.pages.novels.components.PipelineTab.gen_195c8390")}</AiButton>
          </div>
          {reviewResult ? (
            <div className="rounded-xl bg-background/70 p-3 text-sm">
              <div className="mb-2 font-medium">{t("gen.pages.novels.components.PipelineTab.gen_980b1636")}</div>
              <div className="grid gap-1 md:grid-cols-2">
                <div>{t("gen.pages.novels.components.PipelineTab.gen_108e646c")}</div>
                <div>{t("gen.pages.novels.components.PipelineTab.gen_fea0118e")}</div>
                <div>{t("gen.pages.novels.components.PipelineTab.gen_5c05d6df")}</div>
                <div>{t("gen.pages.novels.components.PipelineTab.gen_f46055cb")}</div>
                <div>{t("gen.pages.novels.components.PipelineTab.gen_685f1bd8")}</div>
                <div>{t("gen.pages.novels.components.PipelineTab.gen_987f56e9")}</div>
              </div>
            </div>
          ) : null}
          <StreamOutput content={repairStreamContent} isStreaming={isRepairStreaming} onAbort={onAbortRepair} />
          {(repairBeforeContent || repairAfterContent) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs">{t("gen.pages.novels.components.PipelineTab.preRepairInfo")}</pre>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs">{t("gen.pages.novels.components.PipelineTab.postRepairDisplay")}</pre>
            </div>
          ) : null}
          {lowScoreReports.length > 0 ? (
            <div className="space-y-2 rounded-xl bg-background/70 p-3 text-xs">
              <div className="font-medium">{t("gen.pages.novels.components.PipelineTab.lowChapterFilteringThresholdQualityThreshold")}</div>
              {lowScoreReports.map((item, index) => (
                <div key={`${item.chapterId}-${index}`} className="flex items-center justify-between">
                  <span>{item.chapterId}</span>
                  <Badge variant="secondary">overall {item.overall}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title={t("gen.pages.novels.components.PipelineTab.gen_16809553")}
            description={t("gen.pages.novels.components.PipelineTab.gen_2d2bd334")}
          />
        </summary>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_4dc28753")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <LLMSelector />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_4f82436f")}</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.startOrder}
                    onChange={(event) => onPipelineFormChange("startOrder", Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_1024805a")}</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.endOrder}
                    onChange={(event) => onPipelineFormChange("endOrder", Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_37cd8040")}</div>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={pipelineForm.maxRetries}
                    onChange={(event) => onPipelineFormChange("maxRetries", Number(event.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_44c4aaa1")}</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={pipelineForm.runMode}
                    onChange={(event) => onPipelineFormChange("runMode", event.target.value)}
                  >
                    <option value="fast">{t("gen.pages.novels.components.PipelineTab.gen_f63762a0")}</option>
                    <option value="polish">{t("gen.pages.novels.components.PipelineTab.gen_41ed42e6")}</option>
                  </SelectControl>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_ae823fce")}</div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={pipelineForm.qualityThreshold}
                    onChange={(event) => onPipelineFormChange("qualityThreshold", Number(event.target.value) || 75)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_a74dbf0c")}</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={pipelineForm.repairMode}
                    onChange={(event) => onPipelineFormChange("repairMode", event.target.value)}
                  >
                    <option value="detect_only">{t("gen.pages.novels.components.PipelineTab.gen_af284883")}</option>
                    <option value="light_repair">{t("gen.pages.novels.components.PipelineTab.gen_82aaf5f8")}</option>
                    <option value="heavy_repair">{t("gen.pages.novels.components.PipelineTab.gen_795f45db")}</option>
                    <option value="continuity_only">{t("gen.pages.novels.components.PipelineTab.gen_2f630185")}</option>
                    <option value="character_only">{t("gen.pages.novels.components.PipelineTab.gen_53776535")}</option>
                    <option value="ending_only">{t("gen.pages.novels.components.PipelineTab.gen_8f96a7e8")}</option>
                  </SelectControl>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pipelineForm.autoReview}
                    onChange={(event) => onPipelineFormChange("autoReview", event.target.checked)}
                  />
                  自动审校
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pipelineForm.autoRepair}
                    onChange={(event) => onPipelineFormChange("autoRepair", event.target.checked)}
                  />
                  自动修复
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pipelineForm.skipCompleted}
                    onChange={(event) => onPipelineFormChange("skipCompleted", event.target.checked)}
                  />
                  跳过已完成章节
                </label>
              </div>
              <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                当前设置：{pipelineForm.runMode === "polish" ? t("gen.pages.novels.components.PipelineTab.gen_41ed42e6") : t("gen.pages.novels.components.PipelineTab.gen_f63762a0")} | 阈值 {pipelineForm.qualityThreshold} | {repairModeLabel(pipelineForm.repairMode)}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_36c20c7a")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {PIPELINE_STAGE_ITEMS.map((stage) => {
                  const state = getPipelineStageState(stage.key, pipelineJob, PIPELINE_STAGE_ITEMS);
                  return (
                    <div
                      key={stage.key}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        state === "active"
                          ? "border-primary bg-primary/10"
                          : state === "completed"
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : state === "failed"
                              ? "border-red-400/40 bg-red-500/10"
                              : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{stage.label}</span>
                        <span className="text-xs text-muted-foreground">{stageStatusLabel(state)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_935d16e3")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <AiButton onClick={() => onRunPipeline()} disabled={isRunningPipeline || !hasCharacters}>启动批量生成</AiButton>
                  <AiButton
                    variant="outline"
                    onClick={() => {
                      if (!lowScoreRange) {
                        return;
                      }
                      onRunPipeline({
                        startOrder: lowScoreRange.startOrder,
                        endOrder: lowScoreRange.endOrder,
                        skipCompleted: true,
                      });
                    }}
                    disabled={isRunningPipeline || !lowScoreRange}
                  >
                    仅重跑低分章节
                  </AiButton>
                  <Button variant="outline" onClick={exportPipelineReport}>{t("gen.pages.novels.components.PipelineTab.gen_55edcfc0")}</Button>
                  <AiButton onClick={onGenerateBible} disabled={isBibleStreaming || !hasCharacters}>{t("gen.pages.novels.components.PipelineTab.gen_e874b56f")}</AiButton>
                  <Button variant="secondary" onClick={onAbortBible} disabled={!isBibleStreaming}>{t("gen.pages.novels.components.PipelineTab.gen_7ad87f4a")}</Button>
                  <AiButton onClick={onGenerateBeats} disabled={isBeatsStreaming || !hasCharacters}>{t("gen.pages.novels.components.PipelineTab.gen_5970afec")}</AiButton>
                  <Button variant="secondary" onClick={onAbortBeats} disabled={!isBeatsStreaming}>{t("gen.pages.novels.components.PipelineTab.gen_1eed7ce6")}</Button>
                </div>
                {lowScoreRange ? (
                  <div className="text-xs text-muted-foreground">
                    低分章节 {lowScoreRange.count} 个，可重跑范围：第 {lowScoreRange.startOrder} 章 - 第 {lowScoreRange.endOrder} 章。
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_a2359212")}</div>
                )}
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">{t("gen.pages.novels.components.PipelineTab.taskIdStatus")}</div>
                  {pipelineJob ? (
                    <div className="space-y-1">
                      <div>{t("gen.pages.novels.components.PipelineTab.taskIdPipelineJobId")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_558b534a")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_f278ee48")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_0b2eaee1")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_263a6b07")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_da8ca2c1")}</div>
                      <div>{t("gen.pages.novels.components.PipelineTab.gen_2f767b68")}</div>
                      {pipelineJob.lastErrorType ? <div>{t("gen.pages.novels.components.PipelineTab.gen_9e700f27")}</div> : null}
                      {pipelineJob.error ? <div className="text-red-600">{t("gen.pages.novels.components.PipelineTab.gen_487cd5cc")}</div> : null}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_11610df7")}</div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <StreamOutput content={bibleStreamContent} isStreaming={isBibleStreaming} onAbort={onAbortBible} />
                  <StreamOutput content={beatsStreamContent} isStreaming={isBeatsStreaming} onAbort={onAbortBeats} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </details>

      <details className="group rounded-2xl border border-border/70 bg-background/95 p-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title={t("gen.pages.novels.components.PipelineTab.gen_e2372df9")}
            description={t("gen.pages.novels.components.PipelineTab.gen_9c58a496")}
          />
        </summary>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_98001905")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {qualitySummary ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Badge variant="outline">{t("gen.pages.novels.components.PipelineTab.gen_b031f966")}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.PipelineTab.gen_6a4abc13")}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.PipelineTab.gen_ae9c34a3")}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.PipelineTab.gen_975e6dc9")}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.PipelineTab.gen_197500cb")}</Badge>
                  <Badge variant="default">{t("gen.pages.novels.components.PipelineTab.gen_1d3831b1")}</Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_7b207e94")}</div>
              )}
              <div className="space-y-2 text-sm">
                {chapterReports.slice(0, 10).map((item, index) => (
                  <div key={`${item.chapterId ?? "novel"}-${index}`} className="rounded-md border p-2">
                    <div>{t("gen.pages.novels.components.PipelineTab.gen_10e8639d")}</div>
                    <div className="text-muted-foreground">
                      综合：{item.overall}，连贯性：{item.coherence}，重复率：{item.repetition}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_a6bc98ff")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {bible ? (
                  <>
                    <div className="rounded-md border p-2"><div className="font-medium">{t("gen.pages.novels.components.PipelineTab.mainPromiseLine")}</div><div className="text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.bibleMainPromise")}</div></div>
                    <div className="rounded-md border p-2"><div className="font-medium">{t("gen.pages.novels.components.PipelineTab.gen_3f78c39a")}</div><div className="text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.bibleCoreSetting")}</div></div>
                    <div className="rounded-md border p-2">
                      <div className="font-medium">{t("gen.pages.novels.components.PipelineTab.bibleWorldRecord")}</div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        这里是作品圣经里的文字记录；章节生成优先读取“本书世界”里的世界手册和使用范围。
                      </div>
                      <div className="mt-2 text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.bibleWorldRules")}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_16345639")}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("gen.pages.novels.components.PipelineTab.gen_0c698d6f")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {plotBeats.length > 0 ? (
                  plotBeats.slice(0, 20).map((beat) => (
                    <div key={beat.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{t("gen.pages.novels.components.PipelineTab.gen_cd1128df")}</div>
                        <Badge variant="outline">{beat.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_cfe84033")}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">{t("gen.pages.novels.components.PipelineTab.gen_69e0bfd2")}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </details>
    </div>
  );
}
