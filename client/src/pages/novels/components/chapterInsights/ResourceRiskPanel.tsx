import { RefreshCw } from "lucide-react";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import type { ChapterExecutionInsightsSidebarProps } from "./chapterInsights.types";
import { getTimelineCheckLabel } from "./TimelinePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function ResourceGroup(props: {
  title: string;
  items: CharacterResourceLedgerItem[];
  emptyText: string;
}) {
  const { title, items, emptyText } = props;
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-md border border-border/60 bg-muted/15 p-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{item.name}</span>
                <Badge variant="outline">{item.status}</Badge>
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{emptyText}</div>
      )}
    </div>
  ); } export default function ResourceRiskPanel(props: ChapterExecutionInsightsSidebarProps) { const { selectedChapter, chapterResourceContext, isLoadingChapterResourceContext = false, resourceWorkflowMode = "manual", pendingCharacterResourceProposals = [], onExtractChapterResources, isExtractingChapterResources = false, onConfirmCharacterResourceProposal, onRejectCharacterResourceProposal, confirmingCharacterResourceProposalId = "", rejectingCharacterResourceProposalId = "", chapterRuntimePackage, } = props; const isAutoDirectorMode = resourceWorkflowMode === "auto_director"; const modeHint = isAutoDirectorMode ? "Automatic director will synchronize regular resource changes, only leaving high-risk changes for you to judge." : "After revising the main text, you can review the resource changes for this chapter. The results of confirmation will affect subsequent writing."; const openConflicts = chapterRuntimePackage?.context.openConflicts ?? []; const blockingIssues = chapterRuntimePackage?.audit.openIssues ?? []; const failureSummary = chapterRuntimePackage?.failureClassification?.summary?.trim() ?? ""; const timelineCheck = chapterRuntimePackage?.timelineCheck ?? null; return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Resources and Risks</div>
            <div className="mt-1 text-sm font-medium text-foreground">Key resources and risk warnings in this chapter</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{modeHint}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={isAutoDirectorMode ? "secondary" : "outline"}>{isAutoDirectorMode ? "Automatic Synchronization" : "Manual Review"}</Badge>
            {pendingCharacterResourceProposals.length > 0 ? <Badge variant="secondary">{pendingCharacterResourceProposals.length}</Badge> : null}
          </div>
        </div>
        {!isAutoDirectorMode ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExtractChapterResources?.()}
            disabled={isExtractingChapterResources || !onExtractChapterResources}
            className="mt-3 w-full justify-center gap-2"
          >
            <RefreshCw className={isExtractingChapterResources ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {isExtractingChapterResources ? "Under review..." : "Reviewing resources for this chapter"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-xs font-medium text-muted-foreground">Risk summary</div>
          <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>Failure classification</span>
              <span className="font-medium text-foreground">{failureSummary || "None"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>open conflict</span>
              <span className="font-medium text-foreground">{openConflicts.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>blocking problem</span>
              <span className="font-medium text-foreground">{blockingIssues.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>timeline</span>
              <span className="font-medium text-foreground">{timelineCheck ? getTimelineCheckLabel(timelineCheck.status) : "Not detected"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-xs font-medium text-muted-foreground">Current Chapter</div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {selectedChapter ? `第${selectedChapter.order}章 ${selectedChapter.title || "Unnamed chapter"}` : "No chapter selected"}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {chapterResourceContext?.summary ?? "After selecting a chapter, you will be prompted with resources that are available, require foreshadowing, and cannot be used directly in this chapter."}
          </div>
        </div>
      </div>

      {isLoadingChapterResourceContext ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
          Resource boundaries are being read.
                          </div>
      ) : null}

      <div className="space-y-3">
        <ResourceGroup title="Available resources" items={chapterResourceContext?.availableItems ?? []} emptyText="There are no available resources that require special dependence." />
        <ResourceGroup title="Need to pave the way" items={chapterResourceContext?.setupNeededItems ?? []} emptyText="There are no resources that must be laid down first." />
        <ResourceGroup title="Cannot be used in advance" items={chapterResourceContext?.blockedItems ?? []} emptyText="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
        <ResourceGroup title="High risk has been accounted for" items={chapterResourceContext?.highRiskCommittedItems ?? []} emptyText="There are no high-risk accounted resources that need to be used with caution." />

        {pendingCharacterResourceProposals.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs font-medium text-muted-foreground">Resource changes that need to be judged</div>
            {pendingCharacterResourceProposals.slice(0, 2).map((proposal) => (
              <div key={proposal.id} className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium leading-5">{proposal.summary}</div>
                  <Badge variant="outline">{proposal.sourceType === "chapter_background_sync" ? "Automatic synchronization discovery" : "Manual review discovery"}</Badge>
                </div>
                {proposal.evidence[0] ? <div className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">evidence:{proposal.evidence[0]}</div> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onConfirmCharacterResourceProposal?.(proposal.id)} disabled={confirmingCharacterResourceProposalId === proposal.id}>
                    {confirmingCharacterResourceProposalId === proposal.id ? "Confirming..." : "confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRejectCharacterResourceProposal?.(proposal.id)}
                    disabled={rejectingCharacterResourceProposalId === proposal.id}
                  >
                    {rejectingCharacterResourceProposalId === proposal.id ? "Processing..." : "Ignore"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
