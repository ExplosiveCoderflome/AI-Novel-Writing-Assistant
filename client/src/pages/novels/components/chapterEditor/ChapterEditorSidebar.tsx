import type { Chapter, ChapterEditorDiagnosticCard, ChapterEditorWorkspaceResponse } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";

interface ChapterEditorSidebarProps {
  chapter: Chapter;
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  wordCount: number;
  saveStatusLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  selectedDiagnosticId: string | null;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onSave: () => void;
  onFocusDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onRunDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
}

function MetaChip(props: { label: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
      {props.label}
    </span>
  );
}

function LoadingBar(props: { widthClassName?: string }) {
  return (
    <div className={`h-3 animate-pulse rounded-full bg-muted ${props.widthClassName ?? "w-full"}`} />
  );
}

export default function ChapterEditorSidebar(props: ChapterEditorSidebarProps) {
  const {
    chapter,
    workspace,
    workspaceStatus,
    wordCount,
    saveStatusLabel,
    isDirty,
    isSaving,
    selectedDiagnosticId,
    onBack,
    onOpenVersionHistory,
    onSave,
    onFocusDiagnostic,
    onRunDiagnostic,
  } = props;

  const recommendedTask = workspace?.recommendedTask ?? null;
  const macroContext = workspace?.macroContext ?? null;
  const isWorkspaceLoading = workspaceStatus === "loading";
  const isWorkspaceError = workspaceStatus === "error";

  return (
    <div className="min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            {onBack ? (
              <div>
                <Button size="sm" variant="outline" onClick={onBack}>
                  Return to chapter execution page
                                                  </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="text-lg font-semibold leading-7 text-foreground">
                Section {chapter.order} chapter · {chapter.title?.trim() || "Unnamed chapter"}
              </div>

              <div className="flex flex-wrap gap-2">
                <MetaChip label={`${wordCount} 字`} />
                <MetaChip label={saveStatusLabel} />
                <MetaChip label={isWorkspaceLoading ? "LLM analysis in progress" : `问题 ${workspace?.chapterMeta.openIssueCount ?? 0}`} />
              </div>

              {isWorkspaceLoading ? (
                <div className="space-y-2 pt-1">
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-4/5" />
                </div>
              ) : workspace?.chapterMeta.styleSummary ? (
                <div className="text-sm leading-6 text-muted-foreground">
                  Current writing assets:{workspace.chapterMeta.styleSummary}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                size="sm"
                onClick={onSave}
                disabled={!isDirty || isSaving}
                className="w-full"
              >
                {isSaving ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "keep"}
              </Button>
              {onOpenVersionHistory ? (
                <Button size="sm" variant="outline" onClick={onOpenVersionHistory} className="w-full">
                  Version entrance
                                                  </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">Macro positioning</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading ? "AI analysis in progress" : workspace?.refreshReason ?? "Real-time generation"}
            </span>
          </div>

          {isWorkspaceLoading ? (
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div>The AI ​​is analyzing the chapter's placement within the volume, pacing suggestions, and chapter tasks.</div>
              <div className="space-y-3">
                <LoadingBar widthClassName="w-2/3" />
                <LoadingBar widthClassName="w-full" />
                <LoadingBar widthClassName="w-5/6" />
                <LoadingBar widthClassName="w-4/5" />
              </div>
            </div>
          ) : macroContext ? (
            <div className="space-y-4 text-sm leading-6">
              <div>
                <div className="mb-1 font-medium text-foreground">This chapter's position in this volume</div>
                <div className="text-muted-foreground">
                  {macroContext.volumeTitle} · {macroContext.volumePositionLabel} · {macroContext.volumePhaseLabel}
                </div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">Current tempo suggestions</div>
                <div className="text-muted-foreground">{macroContext.paceDirective}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">Main tasks of this chapter</div>
                <div className="text-muted-foreground">{macroContext.chapterMission}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">Connection between previous and following chapters</div>
                <div className="space-y-2 text-muted-foreground">
                  <div>Continuing from the previous chapter:{macroContext.previousChapterBridge}</div>
                  <div>Go to the next chapter:{macroContext.nextChapterBridge}</div>
                </div>
              </div>
            </div>
          ) : isWorkspaceError ? (
            <div className="text-sm leading-6 text-muted-foreground">
              The macro positioning fails to load temporarily. You can still edit the text first or directly initiate AI correction on the right side.
                                              </div>
          ) : (
            <div className="text-sm leading-6 text-muted-foreground">
              In-volume positioning and pacing suggestions for this chapter are being prepared.
                                                  </div>
          )}
        </div>

        <div className="min-h-0 shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">Pending issue card</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading
                ? "AI is sorting out"
                : recommendedTask
                  ? `当前推荐：${recommendedTask.title}`
                  : "Waiting for issue card"} </span> </div> <div className="space-y-3"> {isWorkspaceLoading ? ( <> <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground"> ​​AI is sorting out priority correction items by chapter issues, volume position, and pacing goals. Please wait. </div> {[0, 1].map((item) => ( <div key={item} className="rounded-2xl border border-border/70 bg-muted/10 p-3"> <div className="space-y-3"> <LoadingBar widthClassName="w-2/5" /> <LoadingBar widthClassName="w-1/3" /> <LoadingBar widthClassName="w-full" /> <LoadingBar widthClassName="w-5/6" /> <div className="flex gap-2 pt-1"> <div className="h-8 w-24 animate-pulse rounded-full bg-muted" /> <div className="h-8 w-32 animate-pulse rounded-full bg-muted" /> </div> </div> </div> ))} </> ) : workspace && workspace.diagnosticCards.length > 0 ? workspace.diagnosticCards.map((card) => { const isSelected = selectedDiagnosticId === card.id; const isRecommended = recommendedTask?.title === card.title && recommendedTask.recommendedAction === card.recommendedAction; return ( <div key={card.id} className={`rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-sky-300 bg-sky-50/70"
                      : isRecommended
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-border/70 bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{card.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {card.paragraphLabel || "whole chapter"} · {card.severity}
                      </div>
                    </div>
                    {isRecommended ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                        Recommended to take
                                                        </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-sm leading-6 text-muted-foreground">{card.problemSummary}</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/80">{card.whyItMatters}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => onFocusDiagnostic(card)}
                    >
                      {isSelected ? "Cancel selection" : "Select the main text"}
                    </Button>
                    <Button size="sm" onClick={() => onRunDiagnostic(card)}>
                      Processed directly with AI
                                                  </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
                {isWorkspaceError ? "The issue card has temporarily failed to load. You can enter your revision comments directly on the right, or manually select the segment to initiate a correction." : workspace ? "AI has not yet compiled a clear issue card. You can enter your revision comments directly on the right, or manually select the segment to initiate a correction." : "Loading the workspace for this chapter."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
