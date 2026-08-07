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
    detect_only: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    light_repair: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    heavy_repair: "Automatic rebuild",
    continuity_only: "Only practice continuity",
    character_only: "Only repair the character",
    ending_only: "Only the ending intensity is modified",
  };
  return mapping[mode];
}

function stageStatusLabel(state: "pending" | "active" | "completed" | "failed"): string {
  if (state === "active") return "in progress";
  if (state === "completed") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (state === "failed") return "abnormal";
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
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
        title="Takeover from Quality Repair"
        description="The AI ​​will first determine whether there are currently active chapter batches or checkpoints to be repaired, and then decide whether to resume the current repair or open a new batch."
        entry={directorTakeoverEntry}
      />
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="rounded-2xl bg-muted/20 px-5 py-4">
          <CardTitle>Batch production and quality inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-0 pt-5">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span>Please add at least 1 role before executing the pipeline.</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>Go to character management</Button>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">Current focus</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {pendingRepairCount > 0 ? `先处理 ${pendingRepairCount} 个低分章节` : "There are currently no chapters with obviously low scores"}
              </div>
            </div>
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">quality threshold</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{pipelineForm.qualityThreshold}</div>
            </div>
            <div className="rounded-xl bg-muted/15 p-3">
              <div className="text-xs text-muted-foreground">Current operating mode</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{pipelineForm.runMode === "polish" ? "Refinement" : "Quick"}</div>
            </div>
          </div>
          {pipelineMessage ? <div className="text-sm text-muted-foreground">{pipelineMessage}</div> : null}
        </CardContent>
      </Card>

      <Card className="border-0 bg-muted/15 shadow-none">
        <CardHeader>
          <CardTitle>Quality risk queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectControl
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selectedChapterId}
            onChange={(event) => onSelectedChapterChange(event.target.value)}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>Section{chapter.order}chapter - {chapter.title}</option>
            ))}
          </SelectControl>
          <div className="flex flex-wrap gap-2">
            <AiButton onClick={onReviewChapter} disabled={isReviewing || !selectedChapterId}>Perform review</AiButton>
            <AiButton variant="secondary" onClick={onRepairChapter} disabled={isRepairing || !selectedChapterId}>Perform repair</AiButton>
            <AiButton variant="outline" onClick={onGenerateHook} disabled={isGeneratingHook || !selectedChapterId}>Generate hook</AiButton>
          </div>
          {reviewResult ? (
            <div className="rounded-xl bg-background/70 p-3 text-sm">
              <div className="mb-2 font-medium">Reviewer rating</div>
              <div className="grid gap-1 md:grid-cols-2">
                <div>Continuity:{reviewResult.score.coherence}</div>
                <div>重复率：{reviewResult.score.repetition}</div>
                <div>Rhythm:{reviewResult.score.pacing}</div>
                <div>Tone:{reviewResult.score.voice}</div>
                <div>Follow up:{reviewResult.score.engagement}</div>
                <div>comprehensive:{reviewResult.score.overall}</div>
              </div>
            </div>
          ) : null}
          <StreamOutput content={repairStreamContent} isStreaming={isRepairStreaming} onAbort={onAbortRepair} />
          {(repairBeforeContent || repairAfterContent) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs">{repairBeforeContent || "None yet"}</pre>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/70 p-3 text-xs">{repairAfterContent || "Displayed after repair execution"}</pre>
            </div>
          ) : null}
          {lowScoreReports.length > 0 ? (
            <div className="space-y-2 rounded-xl bg-background/70 p-3 text-xs">
              <div className="font-medium">Low-scoring chapter filtering (threshold {pipelineForm.qualityThreshold}）</div>
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
            title="Pipeline configuration, operation and model setup"
            description="Batch tasks, models and advanced parameters are collected here. By default, the current problem chapter will be processed first, and will only be expanded when batch advancement is needed."
          />
        </summary>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Models and configurations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <LLMSelector />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Starting chapter</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.startOrder}
                    onChange={(event) => onPipelineFormChange("startOrder", Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">end chapter</div>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrder}
                    value={pipelineForm.endOrder}
                    onChange={(event) => onPipelineFormChange("endOrder", Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Retry on failure</div>
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
                  <div className="text-xs font-medium text-muted-foreground">operating mode</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={pipelineForm.runMode}
                    onChange={(event) => onPipelineFormChange("runMode", event.target.value)}
                  >
                    <option value="fast">Quick</option>
                    <option value="polish">Refinement</option>
                  </SelectControl>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">quality threshold</div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={pipelineForm.qualityThreshold}
                    onChange={(event) => onPipelineFormChange("qualityThreshold", Number(event.target.value) || 75)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">repair mode</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={pipelineForm.repairMode}
                    onChange={(event) => onPipelineFormChange("repairMode", event.target.value)}
                  >
                    <option value="detect_only">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                    <option value="light_repair">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                    <option value="heavy_repair">Automatic rebuild</option>
                    <option value="continuity_only">Only practice continuity</option>
                    <option value="character_only">Only repair the character</option>
                    <option value="ending_only">Only the ending intensity is modified</option>
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
                  Automatic review
                                                  </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pipelineForm.autoRepair}
                    onChange={(event) => onPipelineFormChange("autoRepair", event.target.checked)}
                  />
                  Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
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
                Current settings:{pipelineForm.runMode === "polish" ? "Refinement" : "Quick"} | Threshold {pipelineForm.qualityThreshold} | {repairModeLabel(pipelineForm.repairMode)}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Stage visualization</CardTitle>
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
                <CardTitle>Run panel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <AiButton onClick={() => onRunPipeline()} disabled={isRunningPipeline || !hasCharacters}>Start batch generation</AiButton>
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
                    Only rerun low score chapters
                                                        </AiButton>
                  <Button variant="outline" onClick={exportPipelineReport}>Export task report</Button>
                  <AiButton onClick={onGenerateBible} disabled={isBibleStreaming || !hasCharacters}>generate bible</AiButton>
                  <Button variant="secondary" onClick={onAbortBible} disabled={!isBibleStreaming}>stop bible</Button>
                  <AiButton onClick={onGenerateBeats} disabled={isBeatsStreaming || !hasCharacters}>Generate beat points</AiButton>
                  <Button variant="secondary" onClick={onAbortBeats} disabled={!isBeatsStreaming}>Stop shooting</Button>
                </div>
                {lowScoreRange ? (
                  <div className="text-xs text-muted-foreground">
                    Low score chapter {lowScoreRange.count} , rerunable range: No. {lowScoreRange.startOrder} Chapter - Chapter {lowScoreRange.endOrder} chapter.
                                                        </div>
                ) : (
                  <div className="text-xs text-muted-foreground">There are currently no chapters below the threshold.</div>
                )}
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">Task status</div>
                  {pipelineJob ? (
                    <div className="space-y-1">
                      <div>Task ID:{pipelineJob.id}</div>
                      <div>state:{pipelineJob.status}</div>
                      <div>Current stage:{pipelineJob.currentStage || "-"}</div>
                      <div>Current chapter:{pipelineJob.currentItemLabel || "-"}</div>
                      <div>schedule:{Math.round((pipelineJob.progress ?? 0) * 100)}%</div>
                      <div>Finish:{pipelineJob.completedCount}/{pipelineJob.totalCount}</div>
                      <div>Try again:{pipelineJob.retryCount}/{pipelineJob.maxRetries}</div>
                      {pipelineJob.lastErrorType ? <div>Failure classification:{pipelineJob.lastErrorType}</div> : null}
                      {pipelineJob.error ? <div className="text-red-600">mistake:{pipelineJob.error}</div> : null}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">There are currently no running pipeline tasks.</div>
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
            title="Quality reporting and derived products"
            description="The full quality report, saved Bibles and shooting points are all viewable information and are closed by default."
          />
        </summary>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Report Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {qualitySummary ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Badge variant="outline">Continuity:{qualitySummary.coherence}</Badge>
                  <Badge variant="outline">重复率：{qualitySummary.repetition}</Badge>
                  <Badge variant="outline">Rhythm:{qualitySummary.pacing}</Badge>
                  <Badge variant="outline">Tone:{qualitySummary.voice}</Badge>
                  <Badge variant="outline">Follow up:{qualitySummary.engagement}</Badge>
                  <Badge variant="default">comprehensive:{qualitySummary.overall}</Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">There is no quality report yet.</div>
              )}
              <div className="space-y-2 text-sm">
                {chapterReports.slice(0, 10).map((item, index) => (
                  <div key={`${item.chapterId ?? "novel"}-${index}`} className="rounded-md border p-2">
                    <div>chapter:{item.chapterId ?? "whole book"}</div>
                    <div className="text-muted-foreground">
                      comprehensive:{item.overall}, coherence:{item.coherence},repetition rate:{item.repetition}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Bible saved</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {bible ? (
                  <>
                    <div className="rounded-md border p-2"><div className="font-medium">Mainline Commitment</div><div className="text-muted-foreground">{bible.mainPromise ?? "None yet"}</div></div>
                    <div className="rounded-md border p-2"><div className="font-medium">Core Settings</div><div className="text-muted-foreground">{bible.coreSetting ?? "None yet"}</div></div>
                    <div className="rounded-md border p-2">
                      <div className="font-medium">Bible World Records</div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        Here is the text record in the work Bible; chapter generation gives priority to reading the world manual and usage scope in the "book world".
                                                                    </div>
                      <div className="mt-2 text-muted-foreground">{bible.worldRules ?? "None yet"}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">There is currently no work Bible.</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Saved shot</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {plotBeats.length > 0 ? (
                  plotBeats.slice(0, 20).map((beat) => (
                    <div key={beat.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">Section {beat.chapterOrder ?? "-"} chapter · {beat.title}</div>
                        <Badge variant="outline">{beat.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">type:{beat.beatType}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">There is no plot filming yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </details>
    </div>
  );
}
