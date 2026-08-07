import type { ReactNode } from "react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StructuredTabViewProps } from "./NovelEditView.types";
import { formatBeatDisplayLabel } from "./structuredOutlineWorkspace.shared";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeatSheet = StructuredTabViewProps["beatSheets"][number];
type StructuredBeat = StructuredBeatSheet["beats"][number];

interface StructuredBeatSheetCardProps {
  selectedVolume: StructuredVolume;
  selectedVolumeChapters: StructuredChapter[];
  selectedBeatSheet: StructuredBeatSheet | null;
  selectedBeat: StructuredBeat | null;
  visibleChapters: StructuredChapter[];
  refinedChapterCount: number;
  visibleRefinedChapterCount: number;
  readiness: StructuredTabViewProps["readiness"];
  isGeneratingBeatSheet: boolean;
  onGenerateBeatSheet: StructuredTabViewProps["onGenerateBeatSheet"];
  chapterListPanel?: ReactNode;
  chapterDetailPanel?: ReactNode;
}

function renderMetric(label: string, value: string) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function StructuredBeatSheetCard(props: StructuredBeatSheetCardProps) {
  const {
    selectedVolume,
    selectedVolumeChapters,
    selectedBeatSheet,
    selectedBeat,
    visibleChapters,
    refinedChapterCount,
    visibleRefinedChapterCount,
    readiness,
    isGeneratingBeatSheet,
    onGenerateBeatSheet,
    chapterListPanel,
    chapterDetailPanel,
  } = props;

  const hasExistingBeatSheet = Boolean(selectedBeatSheet);
  const volumeTitle = selectedVolume.title?.trim() || `第${selectedVolume.sortOrder}卷`;
  const volumeSummary = selectedVolume.mainPromise?.trim()
    || selectedVolume.summary?.trim()
    || "First locate the current rhythm in the chapter navigation grouped by rhythm below, and then continue to refine the corresponding chapters.";
  const generateButtonLabel = isGeneratingBeatSheet
    ? (hasExistingBeatSheet ? "Regenerating..." : "Generating...")
    : (hasExistingBeatSheet ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Generate current volume rhythm board");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">Current volume rhythm</CardTitle>
            <div className="text-sm text-muted-foreground">First look at the current focus area, then switch the rhythm in the chapter navigation grouped by rhythm below and select chapters for refinement.</div>
          </div>
          <AiButton
            variant="outline"
            onClick={() => onGenerateBeatSheet(selectedVolume.id)}
            disabled={isGeneratingBeatSheet || !readiness.canGenerateBeatSheet}
          >
            {generateButtonLabel}
          </AiButton>
        </div>
      </CardHeader>
      <CardContent>
        {selectedBeatSheet ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] xl:items-start">
            {chapterListPanel ? <div className="min-w-0">{chapterListPanel}</div> : <div />}

            <div className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 lg:p-5">
                {selectedBeat ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Current focus interval</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{formatBeatDisplayLabel(selectedBeat)}</Badge>
                        <Badge variant="secondary">{selectedBeat.chapterSpanHint}</Badge>
                        <Badge variant="outline">{visibleChapters.length}chapter</Badge>
                        <Badge variant="outline">{visibleRefinedChapterCount}/{Math.max(visibleChapters.length, 1)} Refined</Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/90 p-4">
                      <div className="text-sm font-medium text-foreground">What is this paragraph responsible for promoting?</div>
                      <div className="mt-2 text-sm leading-7 text-foreground">{selectedBeat.summary}</div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">This paragraph must be delivered</div>
                      {selectedBeat.mustDeliver.length > 0 ? (
                        <ol className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-4">
                          {selectedBeat.mustDeliver.map((item, index) => (
                            <li
                              key={`${selectedBeat.key}-deliverable-${index}`}
                              className="flex items-start gap-3 text-sm text-foreground"
                            >
                              <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                              <span className="leading-6">{item}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                          There are no clear deliverables in this paragraph. It is recommended to go back to the rhythm generation results to add more specific fulfillment goals.
                                                                              </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Current volume overview</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{volumeTitle}</Badge>
                        <Badge variant="outline">{selectedVolumeChapters.length}chapter</Badge>
                        <Badge variant="outline">{selectedBeatSheet.beats.length}rhythm section</Badge>
                        <Badge variant="outline">{refinedChapterCount}/{Math.max(selectedVolumeChapters.length, 1)} Refined</Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/90 p-4">
                      <div className="text-sm font-medium text-foreground">Core Commitments of this Volume</div>
                      <div className="mt-2 text-sm leading-7 text-foreground">{volumeSummary}</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {renderMetric("Current chapter number", `${selectedVolumeChapters.length}章`)}
                      {renderMetric("Number of rhythm sections", `${selectedBeatSheet.beats.length}个`)}
                      {renderMetric("Chapters have been refined", `${refinedChapterCount}章`)}
                    </div>
                  </div>
                )}
              </div>

              {chapterDetailPanel}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                    </div>
        )}
      </CardContent>
    </Card>
  );
}
