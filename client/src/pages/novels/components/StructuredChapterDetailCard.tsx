import { useEffect, useMemo, useState } from "react";
import { UnlockKeyhole } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getChapterExecutionDetailStatus,
  type ChapterDetailBatchSelection,
} from "../chapterDetailPlanning.shared";
import type { StructuredTabViewProps } from "./NovelEditView.types";
import SelectControl from "@/components/common/SelectControl";

const textareaClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type BatchMode = "count" | "visible_all" | "volume_all";

interface BatchPlan {
  count: number;
  hint: string;
  request: ChapterDetailBatchSelection;
}

function renderChapterDetailStatusBadge(
  status: ReturnType<typeof getChapterExecutionDetailStatus>,
) {
  if (status === "complete") {
    return <Badge variant="secondary">Refined</Badge>;
  }
  if (status === "partial") {
    return <Badge>Refining</Badge>;
  }
  return <Badge variant="outline">To be refined</Badge>;
}

interface StructuredChapterDetailCardProps {
  selectedVolume: StructuredVolume | undefined;
  selectedChapter: StructuredChapter | null;
  visibleChapters: StructuredChapter[];
  selectedChapterBeatLabel?: string | null;
  selectedChapterIndex: number;
  showChapterAdvanced: boolean;
  onToggleAdvanced: () => void;
  isGeneratingChapterDetail: boolean;
  isGeneratingChapterDetailBundle: boolean;
  generatingChapterDetailMode: "purpose" | "boundary" | "task_sheet" | "";
  generatingChapterDetailChapterId: string;
  onGenerateChapterDetail: StructuredTabViewProps["onGenerateChapterDetail"];
  onGenerateChapterDetailBundle: StructuredTabViewProps["onGenerateChapterDetailBundle"];
  onChapterFieldChange: StructuredTabViewProps["onChapterFieldChange"];
  onChapterNumberChange: StructuredTabViewProps["onChapterNumberChange"];
  onChapterPayoffRefsChange: StructuredTabViewProps["onChapterPayoffRefsChange"];
  onMoveChapter: StructuredTabViewProps["onMoveChapter"];
  onRemoveChapter: StructuredTabViewProps["onRemoveChapter"];
  locked: boolean;
}

export default function StructuredChapterDetailCard(props: StructuredChapterDetailCardProps) {
  const {
    selectedVolume,
    selectedChapter,
    visibleChapters,
    selectedChapterBeatLabel,
    selectedChapterIndex,
    showChapterAdvanced,
    onToggleAdvanced,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail,
    onGenerateChapterDetailBundle,
    onChapterFieldChange,
    onChapterNumberChange,
    onChapterPayoffRefsChange,
    onMoveChapter,
    onRemoveChapter,
    locked,
  } = props;

  const [batchMode, setBatchMode] = useState<BatchMode>("count");
  const [batchCount, setBatchCount] = useState(3);

  const volumeChapters = selectedVolume?.chapters ?? [];
  const remainingChapters = selectedChapterIndex >= 0 ? volumeChapters.slice(selectedChapterIndex) : [];
  const hasVisibleBatch = visibleChapters.length > 1 && visibleChapters.length < volumeChapters.length;
  const hasVolumeBatch = volumeChapters.length > 1;
  const hasCountBatch = remainingChapters.length > 1;
  const chapterDetailStatus = selectedChapter ? getChapterExecutionDetailStatus(selectedChapter) : "empty";

  useEffect(() => {
    if (hasCountBatch) {
      setBatchCount((current) => Math.min(Math.max(current, 2), remainingChapters.length));
      return;
    }
    setBatchCount(1);
  }, [hasCountBatch, remainingChapters.length]);

  useEffect(() => {
    if (batchMode === "count" && !hasCountBatch) {
      if (hasVisibleBatch) {
        setBatchMode("visible_all");
        return;
      }
      if (hasVolumeBatch) {
        setBatchMode("volume_all");
      }
      return;
    }
    if (batchMode === "visible_all" && !hasVisibleBatch) {
      setBatchMode(hasCountBatch ? "count" : "volume_all");
      return;
    }
    if (batchMode === "volume_all" && !hasVolumeBatch) {
      setBatchMode("count");
    }
  }, [batchMode, hasCountBatch, hasVisibleBatch, hasVolumeBatch]);

  const batchPlan = useMemo<BatchPlan | null>(() => {
    if (!selectedVolume || !selectedChapter) {
      return null;
    }
    if (batchMode === "visible_all" && hasVisibleBatch) {
      return {
        count: visibleChapters.length,
        hint: `会按照当前节奏筛选，一次补齐当前可见的 ${visibleChapters.length} 章。`,
        request: {
          chapterIds: visibleChapters.map((chapter) => chapter.id),
          label: `当前可见的 ${visibleChapters.length} 章`,
        },
      };
    }
    if (batchMode === "volume_all" && hasVolumeBatch) {
      return {
        count: volumeChapters.length,
        hint: `会从第 1 章到第 ${volumeChapters.length} 章，连续补齐当前卷全部章节的细化资产。`,
        request: {
          chapterIds: volumeChapters.map((chapter) => chapter.id),
          label: `本卷全部 ${volumeChapters.length} 章`,
        },
      };
    }
    if (!hasCountBatch) {
      return null;
    }
    const count = Math.min(Math.max(batchCount, 2), remainingChapters.length);
    return {
      count,
      hint: `会从第${selectedChapter.chapterOrder}章开始，顺次细化接下来的 ${count} 章。`,
      request: {
        chapterIds: remainingChapters.slice(0, count).map((chapter) => chapter.id),
        label: `从第${selectedChapter.chapterOrder}章起连续 ${count} 章`,
      },
    };
  }, [
    batchCount,
    batchMode,
    hasCountBatch,
    hasVisibleBatch,
    hasVolumeBatch,
    remainingChapters,
    selectedChapter,
    selectedVolume,
    visibleChapters,
    volumeChapters,
  ]);

  const currentBundleRunning = Boolean(
    selectedChapter
    && isGeneratingChapterDetailBundle
    && generatingChapterDetailChapterId === selectedChapter.id,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base leading-none">Current chapter refinement</CardTitle>
              {selectedChapter ? (
                <>
                  <Badge variant="outline">Section{selectedChapter.chapterOrder}chapter</Badge>
                  {selectedChapterBeatLabel ? <Badge variant="secondary">{selectedChapterBeatLabel}</Badge> : null}
                  {renderChapterDetailStatusBadge(chapterDetailStatus)}
                </>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedChapter ? "First, complete the title, abstract, objectives, and task list; if the execution plan is missing when writing this chapter, the system will automatically complete the runtime plan based on this." : "Select a chapter in the chapter list on the left before starting to refine it."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedVolume && selectedChapter ? (
              <AiButton
                size="sm"
                onClick={() => onGenerateChapterDetailBundle(selectedVolume.id, selectedChapter.id)}
                disabled={isGeneratingChapterDetail || locked}
              >
                {currentBundleRunning ? "The current chapter is being refined..." : "Refine the current chapter"}
              </AiButton>
            ) : null}
            <Button size="sm" variant="outline" onClick={onToggleAdvanced}>
              {showChapterAdvanced ? "Collapse Advanced Settings" : "Expand Advanced Settings"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedVolume && selectedChapter ? (
          <>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Batch refinement</div>
                  <div className="text-xs leading-6 text-muted-foreground">
                    You can continuously refine by quantity starting from the current chapter, or you can directly complete the currently visible chapter or all chapters in this volume.
                                                        </div>
                </div>
                <AiButton
                  size="sm"
                  variant="secondary"
                  onClick={() => onGenerateChapterDetailBundle(selectedVolume.id, batchPlan?.request ?? { chapterIds: [] })}
                  disabled={isGeneratingChapterDetail || locked || !batchPlan}
                >
                  {isGeneratingChapterDetailBundle ? "Batch refinement in progress..." : `Batch refinement ${batchPlan ? ` ${batchPlan.count} Chapter` : ""}`}
                </AiButton>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <label className="space-y-2 text-sm">
                  <span className="text-xs text-muted-foreground">Scope</span> <SelectControl className="w-full rounded-xl border bg-background px-3 py-2 text-sm text-foreground"
                    value={batchMode}
                    onChange={(event) => setBatchMode(event.target.value as BatchMode)}
                  >
                    <option value="count" disabled={!hasCountBatch}>Refine continuously starting from the current chapter</option>
                    {hasVisibleBatch ? <option value="visible_all">Currently Visible Chapters</option> : null} {hasVolumeBatch ? <option value="volume_all">All chapters in this volume</option> : null} </SelectControl> </label> <label className="space-y-2 text-sm">
                  <span className="text-xs text-muted-foreground">{batchMode === "count" ? "Number of chapters" : "This scope"}</span>
                  {batchMode === "count" ? (
                    <Input
                      type="number"
                      min={hasCountBatch ? 2 : 1}
                      max={Math.max(remainingChapters.length, 1)}
                      value={batchCount}
                      onChange={(event) => setBatchCount(Number(event.target.value || 0))}
                      disabled={!hasCountBatch}
                    />
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                      {batchPlan ? `${batchPlan.count} 章` : "Not available"}
                    </div>
                  )}
                </label>
              </div>

              <div className="mt-2 text-xs leading-6 text-muted-foreground">
                {locked ? "Please generate the current volume's pacing first, then refine the entire chapter or batches." : batchPlan?.hint ?? "The current volume only has 1 chapter, refine the current chapter first."}
              </div>
            </div>

            <label className="space-y-2 text-sm">
              <span className="text-xs text-muted-foreground">Chapter title</span>
              <Input
                value={selectedChapter.title}
                onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "title", event.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-xs text-muted-foreground">Chapter summary</span>
              <textarea
                className={cn(textareaClassName, "min-h-[130px]")}
                value={selectedChapter.summary}
                onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "summary", event.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Chapter Objectives</span>
                <AiButton
                  size="sm"
                  variant="outline"
                  onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "purpose")}
                  disabled={isGeneratingChapterDetail || locked}
                >
                  {isGeneratingChapterDetail && generatingChapterDetailMode === "purpose" && generatingChapterDetailChapterId === selectedChapter.id ? "Fixing..." : "AI fixes"}
                </AiButton>
              </div>
              <textarea
                className={cn(textareaClassName, "min-h-[110px]")}
                value={selectedChapter.purpose ?? ""}
                onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "purpose", event.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</span>
                <AiButton
                  size="sm"
                  variant="outline"
                  onClick={() => onGenerateChapterDetail(selectedVolume.id, selectedChapter.id, "task_sheet")}
                  disabled={isGeneratingChapterDetail || locked}
                >
                  {isGeneratingChapterDetail && generatingChapterDetailMode === "task_sheet" && generatingChapterDetailChapterId === selectedChapter.id ? "Fixing..." : "AI fixes"}
                </AiButton>
              </div>
              <textarea
                className={cn(textareaClassName, "min-h-[130px]")}
                value={selectedChapter.taskSheet ?? ""}
                onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "taskSheet", event.target.value)}
              />
            </label>

            {showChapterAdvanced ? (
              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="text-sm font-medium">Advanced settings</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">conflict level</span>
                      {selectedChapter.conflictLevelSource === "user" && typeof selectedChapter.conflictLevel === "number" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          title="Unanchor and hand back AI optimization"
                          onClick={() => {
                            const conflictLevel = selectedChapter.conflictLevel;
                            if (typeof conflictLevel !== "number") {
                              return;
                            }
                            onChapterNumberChange(selectedVolume.id, selectedChapter.id, "conflictLevel", conflictLevel, {
                              conflictLevelSource: "ai",
                            });
                          }}
                        >
                          <UnlockKeyhole className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Return the AI
                                                                          </Button>
                      ) : null}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedChapter.conflictLevel ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value ? Number(event.target.value) : null;
                        onChapterNumberChange(selectedVolume.id, selectedChapter.id, "conflictLevel", nextValue, nextValue == null ? {} : {
                          conflictLevelSource: "user",
                        });
                      }}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-xs text-muted-foreground">reveal level</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedChapter.revealLevel ?? ""}
                      onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "revealLevel", event.target.value ? Number(event.target.value) : null)}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-xs text-muted-foreground">target word count</span>
                    <Input
                      type="number"
                      min={200}
                      step={100}
                      value={selectedChapter.targetWordCount ?? ""}
                      onChange={(event) => onChapterNumberChange(selectedVolume.id, selectedChapter.id, "targetWordCount", event.target.value ? Number(event.target.value) : null)}
                    />
                  </label>
                </div>

                <label className="space-y-2 text-sm">
                  <span className="text-xs text-muted-foreground">Prohibited matters</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[100px]")}
                    value={selectedChapter.mustAvoid ?? ""}
                    onChange={(event) => onChapterFieldChange(selectedVolume.id, selectedChapter.id, "mustAvoid", event.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-xs text-muted-foreground">Redeem association</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[100px]")}
                    value={selectedChapter.payoffRefs.join("\n")}
                    onChange={(event) => onChapterPayoffRefsChange(selectedVolume.id, selectedChapter.id, event.target.value)}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, -1)} disabled={selectedChapterIndex <= 0}>
                    move up
                                                        </Button>
                  <Button size="sm" variant="outline" onClick={() => onMoveChapter(selectedVolume.id, selectedChapter.id, 1)} disabled={selectedChapterIndex < 0 || selectedChapterIndex >= selectedVolume.chapters.length - 1}>
                    move down
                                                        </Button>
                  <Button size="sm" variant="outline" onClick={() => onRemoveChapter(selectedVolume.id, selectedChapter.id)} disabled={selectedVolume.chapters.length <= 1}>
                    delete
                                                        </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Conflict level, exposure level, word count, prohibitions, and redemption associations have been moved into advanced settings to avoid overwhelming the form right off the bat.
                                                </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                    </div>
        )}
      </CardContent>
    </Card>
  );
}
