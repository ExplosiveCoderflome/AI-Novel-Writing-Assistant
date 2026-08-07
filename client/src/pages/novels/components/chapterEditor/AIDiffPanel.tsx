import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";

interface AIDiffPanelProps {
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  isApplying: boolean;
  onSelectCandidate: (candidateId: string) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export default function AIDiffPanel(props: AIDiffPanelProps) {
  const {
    session,
    activeCandidate,
    isApplying,
    onSelectCandidate,
    onChangeViewMode,
    onAccept,
    onReject,
    onRegenerate,
  } = props;

  const isIdle = session.status === "idle";
  const statusText = isIdle
    ? "After selecting the text, you can initiate partial AI rewriting"
    : session.status === "loading"
      ? "Building candidate release"
      : session.status === "error"
        ? session.errorMessage || "Build failed"
        : session.requestLabel || "View pending rewrites";

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:min-h-0">
      <div className="shrink-0 space-y-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">AI rewrites the results</div>
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

        {session.status === "ready" ? (
          <div className="flex flex-wrap gap-2">
            {(session.candidates ?? []).map((candidate) => (
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
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isIdle ? (
          <>
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
              The results panel on the right is fixed. You can first select a paragraph in the text, and then initiate "optimize expression, expand, streamline, strengthen emotion, strengthen conflict, or customize instructions" from the floating toolbar.
                                      </div>
            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">Waiting for rewriting</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                After initiating a rewrite, 2 to 3 candidate versions, a summary of the rewrite, and a paragraph comparison are displayed here.
                                            </div>
            </div>
          </>
        ) : null}

        {session.status === "loading" ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            Generating 2 to 3 candidate versions based on the selected text, please wait.
                                </div>
        ) : null}

        {session.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {session.errorMessage || "Candidate generation failed, please try again."}
          </div>
        ) : null}

        {session.status === "ready" && activeCandidate ? (
          <>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{activeCandidate.label}</div>
                {activeCandidate.semanticTags && activeCandidate.semanticTags.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {activeCandidate.semanticTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {activeCandidate.summary ? (
                <div className="text-sm leading-6 text-muted-foreground">{activeCandidate.summary}</div>
              ) : null}
            </div>

            {session.viewMode === "block" ? (
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                The middle text area is showing paragraph patch comparison. The original text will be retained in light red blocks, and the rewritten text will be in light green blocks in the same position, making it easier to directly judge whether to adopt it according to the reading order of the novel.
                                            </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                The middle text area is showing the detail mark diff, which is suitable for confirming the specific deletion position; if you prefer to read along the novel, it will be easier to switch back to "Paragraph Comparison".
                                                </div>
            )}
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
          {isApplying ? "In application..." : "Accept all"}
        </Button>
      </div>
    </div>
  );
}
