import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
  );
}

export default function ResourceRiskPanel(props: ChapterExecutionInsightsSidebarProps) {
  const {
    selectedChapter,
    chapterResourceContext,
    isLoadingChapterResourceContext = false,
    resourceWorkflowMode = "manual",
    pendingCharacterResourceProposals = [],
    onExtractChapterResources,
    isExtractingChapterResources = false,
    onConfirmCharacterResourceProposal,
    onRejectCharacterResourceProposal,
    confirmingCharacterResourceProposalId = "",
    rejectingCharacterResourceProposalId = "",
    chapterRuntimePackage,
  } = props;

  const isAutoDirectorMode = resourceWorkflowMode === "auto_director";
  const modeHint = isAutoDirectorMode
    ? t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_a966a219")
    : t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_a9a8932a");
  const openConflicts = chapterRuntimePackage?.context.openConflicts ?? [];
  const blockingIssues = chapterRuntimePackage?.audit.openIssues ?? [];
  const failureSummary = chapterRuntimePackage?.failureClassification?.summary?.trim() ?? "";
  const timelineCheck = chapterRuntimePackage?.timelineCheck ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_9c4a1c29")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_d3fc4d95")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{modeHint}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={isAutoDirectorMode ? "secondary" : "outline"}>{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.autoSyncMode")}</Badge>
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
            {isExtractingChapterResources ? t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_4fbee3c2") : t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_0cf7dab8")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_1622e768")}</div>
          <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_b99dfde1")}</span>
              <span className="font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.failureSummaryText")}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_29340986")}</span>
              <span className="font-medium text-foreground">{openConflicts.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_7732a536")}</span>
              <span className="font-medium text-foreground">{blockingIssues.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_4404a8da")}</span>
              <span className="font-medium text-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_timelineCh_jfka")}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_25afd065")}</div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {selectedChapter ? `第${selectedChapter.order}章 ${selectedChapter.title || t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_db55d102")}` : t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_2d731639")}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {chapterResourceContext?.summary ?? t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_04a85b24")}
          </div>
        </div>
      </div>

      {isLoadingChapterResourceContext ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
          资源边界读取中。
        </div>
      ) : null}

      <div className="space-y-3">
        <ResourceGroup title={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_f0bfd88f")} items={chapterResourceContext?.availableItems ?? []} emptyText={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_4e9da175")} />
        <ResourceGroup title={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_06714161")} items={chapterResourceContext?.setupNeededItems ?? []} emptyText={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_ffd7ecda")} />
        <ResourceGroup title={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.cannotUseEarly")} items={chapterResourceContext?.blockedItems ?? []} emptyText={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_6f13448d")} />
        <ResourceGroup title={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_36f31695")} items={chapterResourceContext?.highRiskCommittedItems ?? []} emptyText={t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_32c6fec4")} />

        {pendingCharacterResourceProposals.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_cbb976fd")}</div>
            {pendingCharacterResourceProposals.slice(0, 2).map((proposal) => (
              <div key={proposal.id} className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium leading-5">{proposal.summary}</div>
                  <Badge variant="outline">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.proposalSourceText")}</Badge>
                </div>
                {proposal.evidence[0] ? <div className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">{t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_eaa0bd1c")}</div> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onConfirmCharacterResourceProposal?.(proposal.id)} disabled={confirmingCharacterResourceProposalId === proposal.id}>
                    {confirmingCharacterResourceProposalId === proposal.id ? t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_1fb26ee2") : t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_e83a256e")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRejectCharacterResourceProposal?.(proposal.id)}
                    disabled={rejectingCharacterResourceProposalId === proposal.id}
                  >
                    {rejectingCharacterResourceProposalId === proposal.id ? t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_2fb90b05") : t("gen.pages.novels.components.chapterInsights.ResourceRiskPanel.gen_c0d5d68f")}
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
