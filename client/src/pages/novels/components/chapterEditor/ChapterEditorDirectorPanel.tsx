import type {
  ChapterEditorCandidate,
  ChapterEditorDiagnosticCard,
  ChapterEditorRevisionScope,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";

interface ChapterEditorDirectorPanelProps {
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  selectedDiagnosticCard: ChapterEditorDiagnosticCard | null;
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  revisionScope: ChapterEditorRevisionScope;
  revisionInstruction: string;
  canRunSelectionRevision: boolean;
  currentTargetDescription: string;
  isGenerating: boolean;
  isApplying: boolean;
  onInstructionChange: (next: string) => void;
  onScopeChange: (scope: ChapterEditorRevisionScope) => void;
  onRunRecommended: () => void;
  onRunSelectedDiagnostic: () => void;
  onRunFreeform: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

function LoadingBar(props: { widthClassName?: string; heightClassName?: string }) {
  return (
    <div className={`${props.heightClassName ?? "h-3"} animate-pulse rounded-full bg-muted ${props.widthClassName ?? "w-full"}`} />
  );
}

export default function ChapterEditorDirectorPanel(props: ChapterEditorDirectorPanelProps) {
  const {
    workspace,
    workspaceStatus,
    selectedDiagnosticCard,
    session,
    activeCandidate,
    revisionScope,
    revisionInstruction,
    canRunSelectionRevision,
    currentTargetDescription,
    isGenerating,
    isApplying,
    onInstructionChange,
    onScopeChange,
    onRunRecommended,
    onRunSelectedDiagnostic,
    onRunFreeform,
    onSelectCandidate,
    onChangeViewMode,
    onAccept,
    onReject,
    onRegenerate,
  } = props;

  const isIdle = session.status === "idle";
  const recommendedTask = workspace?.recommendedTask ?? null;
  const isWorkspaceLoading = workspaceStatus === "loading";
  const statusText = isIdle
    ? isWorkspaceLoading
      ? "AI is analyzing the macro positioning and priority correction tasks of this chapter."
      : "The AI ​​will first consider the location of this chapter in the volume and then decide how to revise it."
    : session.status === "loading"
      ? session.requestLabel || "Building candidate release"
      : session.status === "error"
        ? session.errorMessage || "Build failed"
        : session.resolvedIntent?.reasoningSummary || "View pending rewrites";

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:min-h-0">
      <div className="shrink-0 space-y-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">AI correction director panel</div>
            <div className="text-xs text-muted-foreground">{statusText}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={session.viewMode === "block" ? "default" : "outline"}
              onClick={() => onChangeViewMode("block")}
              disabled={isIdle}
            >
              Paragraph comparison
                                      </Button>
            <Button
              size="sm"
              variant={session.viewMode === "inline" ? "default" : "outline"}
              onClick={() => onChangeViewMode("inline")}
              disabled={isIdle}
            >
              detail mark
                                      </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={revisionScope === "selection" ? "default" : "outline"}
            onClick={() => onScopeChange("selection")}
          >
            clip mode
                                </Button>
          <Button
            size="sm"
            variant={revisionScope === "chapter" ? "default" : "outline"}
            onClick={() => onScopeChange("chapter")}
          >
            Whole chapter mode
                                </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isIdle ? (
          <>
            {isWorkspaceLoading ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4">
                <div className="text-sm font-medium text-foreground">AI is sorting out the current chapter</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  The chapter's position in the volume, priority correction tasks, and segments that can be processed directly are being analyzed. You can wait a few seconds before starting.
                                                  </div>
                <div className="mt-4 space-y-3">
                  <LoadingBar widthClassName="w-2/3" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-5/6" />
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">The most recommended actions at the moment</div>
              {isWorkspaceLoading ? (
                <div className="mt-3 space-y-3">
                  <LoadingBar widthClassName="w-1/2" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-4/5" />
                  <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">
                    {recommendedTask
                      ? `${recommendedTask.title}。${recommendedTask.summary}`
                      : "AI has not yet generated recommended tasks. You can directly tell AI your modification ideas."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={onRunRecommended} disabled={!recommendedTask || isGenerating}>
                      {isGenerating ? "Processing..." : "Handle recommendation tasks directly"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {selectedDiagnosticCard ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                <div className="text-sm font-medium text-foreground">{selectedDiagnosticCard.title}</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedDiagnosticCard.problemSummary}
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/80">
                  {selectedDiagnosticCard.whyItMatters}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={onRunSelectedDiagnostic}
                    disabled={selectedDiagnosticCard.recommendedScope === "selection" && !canRunSelectionRevision}
                  >
                    Use AI directly to process this question card
                                                        </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">Tell AI how to change</div>
              {isWorkspaceLoading ? (
                <div className="mt-3 space-y-3">
                  <LoadingBar widthClassName="w-1/3" />
                  <div className="min-h-[140px] animate-pulse rounded-2xl border border-border bg-background" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-5/6" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Current goals:{currentTargetDescription}
                  </div>
                  <textarea
                    className="mt-3 min-h-[140px] w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none"
                    placeholder={revisionScope === "selection"
                      ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                      : "For example: make this chapter more depressing as a whole, but don't change the plot facts, and make it closer to the stressful stage in the volume."}
                    value={revisionInstruction}
                    onChange={(event) => onInstructionChange(event.target.value)}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {revisionScope === "selection"
                        ? "The snippet mode will give priority to the text you manually selected; if there is no manual selection, the snippet positioned by the current question card will be used."
                        : "The whole chapter mode will generate candidates based on the entire chapter content, but you still need to compare them before accepting them."}
                    </div>
                    <Button
                      size="sm"
                      onClick={onRunFreeform}
                      disabled={isGenerating || revisionInstruction.trim().length === 0 || (revisionScope === "selection" && !canRunSelectionRevision)}
                    >
                      {isGenerating ? "Generating..." : "Initiate AI correction"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}

        {session.status === "loading" ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            The AI is generating 2 to 3 candidate versions based on the macro positioning of the chapter and your revision requirements.
                                </div>
        ) : null}

        {session.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {session.errorMessage || "Candidate generation failed, please try again."}
          </div>
        ) : null}

        {session.status === "ready" && activeCandidate ? (
          <>
            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">Modification target understood by AI</div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <div>Target:{session.resolvedIntent?.editGoal}</div>
                <div>Tone:{session.resolvedIntent?.toneShift}</div>
                <div>Rhythm:{session.resolvedIntent?.paceAdjustment}</div>
                <div>conflict:{session.resolvedIntent?.conflictAdjustment}</div>
                <div>mood:{session.resolvedIntent?.emotionAdjustment}</div>
                <div>illustrate:{session.resolvedIntent?.reasoningSummary}</div>
              </div>
              {session.macroAlignmentNote ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm leading-6 text-emerald-900">
                  Alignment with chapter/volume goals:{session.macroAlignmentNote}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {session.candidates?.map((candidate) => (
                <Button
                  key={candidate.id}
                  size="sm"
                  variant={candidate.id === session.activeCandidateId ? "default" : "outline"}
                  onClick={() => onSelectCandidate(candidate.id)}
                >
                  {candidate.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{activeCandidate.label}</div>
              {activeCandidate.summary ? (
                <div className="text-sm leading-6 text-muted-foreground">{activeCandidate.summary}</div>
              ) : null}
              {activeCandidate.rationale ? (
                <div className="text-sm leading-6 text-foreground/80">Why change this:{activeCandidate.rationale}</div>
              ) : null}
              {activeCandidate.riskNotes && activeCandidate.riskNotes.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-sm leading-6 text-amber-900">
                  Need to pay attention to:{activeCandidate.riskNotes.join("；")}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-4">
        <Button size="sm" variant="outline" onClick={onReject} disabled={isIdle || session.status === "loading" || isApplying}>
          reject all
                          </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isIdle || session.status === "loading" || isApplying}>
          regenerate
                          </Button>
        <Button size="sm" onClick={onAccept} disabled={session.status !== "ready" || !activeCandidate || isApplying}>
          {isApplying ? "Applying..." : "accept all"}
        </Button>
      </div>
    </div>
  );
}
