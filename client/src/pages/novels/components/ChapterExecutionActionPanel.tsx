import type { SSEFrame } from "@ai-novel/shared/types/api";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { AuditReport, Chapter, StoryStateSnapshot } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ChapterExecutionStatusFlow from "./ChapterExecutionStatusFlow";
import {
  chapterHasPreparationAssets,
  chapterStatusLabel,
  chapterSuggestedActionLabel,
  PrimaryActionButton,
  type PrimaryAction,
  type ChapterExecutionBackgroundActivity,
  resolveDisplayedChapterStatus,
  resolveChapterExecutionFlow,
} from "./chapterExecution.shared";
import SelectControl from "@/components/common/SelectControl";

interface ChapterExecutionActionPanelProps {
  novelId: string;
  selectedChapter: Chapter | undefined;
  hasCharacters: boolean;
  strategy: {
    runMode: "fast" | "polish";
    wordSize: "short" | "medium" | "long";
    conflictLevel: number;
    pace: "slow" | "balanced" | "fast";
    aiFreedom: "low" | "medium" | "high";
  };
  onStrategyChange: (
    field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom",
    value: string | number,
  ) => void;
  onApplyStrategy: () => void;
  isApplyingStrategy: boolean;
  onGenerateSelectedChapter: () => void;
  onRewriteChapter: () => void;
  onExpandChapter: () => void;
  onCompressChapter: () => void;
  onSummarizeChapter: () => void;
  onGenerateTaskSheet: () => void;
  onGenerateSceneCards: () => void;
  onGenerateChapterPlan: () => void;
  onReplanChapter: () => void;
  onRunFullAudit: () => void;
  onCheckContinuity: () => void;
  onCheckCharacterConsistency: () => void;
  onCheckPacing: () => void;
  onAutoRepair: () => void;
  onStrengthenConflict: () => void;
  onEnhanceEmotion: () => void;
  onUnifyStyle: () => void;
  onAddDialogue: () => void;
  onAddDescription: () => void;
  isGeneratingTaskSheet: boolean;
  isGeneratingSceneCards: boolean;
  isSummarizingChapter: boolean;
  reviewActionKind?: "full_audit" | "continuity" | "character_consistency" | "pacing" | null;
  repairActionKind?: "autoRepair" | "expand" | "compress" | "strengthenConflict" | "enhanceEmotion" | "unifyStyle" | "addDialogue" | "addDescription" | null;
  generationActionKind?: "rewrite" | null;
  isReviewingChapter: boolean;
  isRepairingChapter: boolean;
  isGeneratingChapterPlan: boolean;
  isReplanningChapter: boolean;
  isRunningFullAudit: boolean;
  isStreaming: boolean;
  streamingChapterId?: string | null;
  repairStreamingChapterId?: string | null;
  chapterAuditReports: AuditReport[];
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterStateSnapshot?: StoryStateSnapshot | null;
  backgroundSyncActivities?: ChapterExecutionBackgroundActivity[];
  chapterRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  repairRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
}

function resolvePrimaryAction(params: {
  novelId: string;
  selectedChapter?: Chapter;
  hasCharacters: boolean;
  isGeneratingChapterPlan: boolean;
  isRunningFullAudit: boolean;
  isSelectedChapterStreaming: boolean;
  isSelectedChapterRepairing: boolean;
  onGenerateChapterPlan: () => void;
  onRunFullAudit: () => void;
  onAutoRepair: () => void;
  onGenerateSelectedChapter: () => void;
}): PrimaryAction {
  const {
    novelId,
    selectedChapter,
    hasCharacters,
    isGeneratingChapterPlan,
    isRunningFullAudit,
    isSelectedChapterStreaming,
    isSelectedChapterRepairing,
    onGenerateChapterPlan,
    onRunFullAudit,
    onAutoRepair,
    onGenerateSelectedChapter,
  } = params;

  if (!selectedChapter) {
    return {
      label: "Please select a chapter first",
      reason: "First select the chapter you want to advance from the left side, and then the system will know what to do for you next.",
      variant: "default",
      disabled: true,
    };
  }

  if (selectedChapter.chapterStatus === "needs_repair") {
    return {
      label: "Open chapter editor",
      reason: "This chapter already has text. Even if a problem is found in the review, it should not block the continued editing; you can enter the editor first, or fix it with one click below.",
      variant: "default",
      href: `/novels/${novelId}/chapters/${selectedChapter.id}`,
    };
  }

  if (
    (selectedChapter.chapterStatus === "pending_review"
      && selectedChapter.generationState !== "reviewed"
      && selectedChapter.generationState !== "approved")
    || selectedChapter.generationState === "drafted"
  ) {
    return {
      label: isRunningFullAudit ? "Running full review..." : "Run a full review",
      reason: "The main text has been published. I will review it completely before deciding whether to repair it or continue to rewrite it.",
      variant: "default",
      ai: true,
      onClick: onRunFullAudit,
      disabled: isRunningFullAudit,
    };
  }

  if (selectedChapter.chapterStatus === "unplanned" || !chapterHasPreparationAssets(selectedChapter)) {
    return {
      label: isGeneratingChapterPlan ? "Generating execution plan..." : "Generate execution plan first",
      reason: "This chapter still lacks clear goals and task lists. It is easier to write down the execution plan first.",
      variant: "default",
      ai: true,
      onClick: onGenerateChapterPlan,
      disabled: isGeneratingChapterPlan,
    };
  }

  if (!selectedChapter.content?.trim() || selectedChapter.chapterStatus === "pending_generation") {
    return {
      label: isSelectedChapterStreaming ? "Writing this chapter..." : "write this chapter",
      reason: "It's enough to prepare the information. The most worthwhile thing to do now is to directly generate the text of this chapter.",
      variant: "default",
      ai: true,
      onClick: onGenerateSelectedChapter,
      disabled: !hasCharacters || isSelectedChapterStreaming,
    };
  }

  return {
    label: "Open chapter editor",
    reason: "This chapter already has text. It would be more efficient to directly enter the editor to handle refinement and recovery.",
    variant: "default",
    href: `/novels/${novelId}/chapters/${selectedChapter.id}`,
  };
}

export default function ChapterExecutionActionPanel(props: ChapterExecutionActionPanelProps) {
  const {
    novelId,
    selectedChapter,
    hasCharacters,
    strategy,
    onStrategyChange,
    onApplyStrategy,
    isApplyingStrategy,
    onGenerateSelectedChapter,
    onRewriteChapter,
    onExpandChapter,
    onCompressChapter,
    onSummarizeChapter,
    onGenerateTaskSheet,
    onGenerateSceneCards,
    onGenerateChapterPlan,
    onReplanChapter,
    onRunFullAudit,
    onCheckContinuity,
    onCheckCharacterConsistency,
    onCheckPacing,
    onAutoRepair,
    onStrengthenConflict,
    onEnhanceEmotion,
    onUnifyStyle,
    onAddDialogue,
    onAddDescription,
    isGeneratingTaskSheet,
    isGeneratingSceneCards,
    isSummarizingChapter,
    reviewActionKind,
    repairActionKind,
    generationActionKind,
    isReviewingChapter,
    isRepairingChapter,
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
    isStreaming,
    streamingChapterId,
    repairStreamingChapterId,
    chapterAuditReports,
    chapterRuntimePackage,
    latestStateSnapshot,
    chapterStateSnapshot,
    backgroundSyncActivities,
    chapterRunStatus,
    repairRunStatus,
  } = props;

  const isSelectedChapterStreaming = Boolean(selectedChapter && isStreaming && streamingChapterId === selectedChapter.id);
  const isSelectedChapterRepairing = Boolean(selectedChapter && isRepairingChapter && repairStreamingChapterId === selectedChapter.id);
  const isExecutionContractPending = isGeneratingTaskSheet || isGeneratingSceneCards;
  const runtimePackage = chapterRuntimePackage?.chapterId === selectedChapter?.id ? chapterRuntimePackage : null;
  const displayedStatus = selectedChapter ? resolveDisplayedChapterStatus(selectedChapter) : undefined;

  const selectedChapterLabel = selectedChapter
    ? `第${selectedChapter.order}章 ${selectedChapter.title || "Unnamed chapter"}`
    : "Please select a chapter";

  const primaryAction = resolvePrimaryAction({
    novelId,
    selectedChapter: selectedChapter
      ? {
        ...selectedChapter,
        chapterStatus: displayedStatus ?? selectedChapter.chapterStatus,
      }
      : undefined,
    hasCharacters,
    isGeneratingChapterPlan,
    isRunningFullAudit,
    isSelectedChapterStreaming,
    isSelectedChapterRepairing,
    onGenerateChapterPlan,
    onRunFullAudit,
    onAutoRepair,
    onGenerateSelectedChapter,
  });
  const executionFlow = resolveChapterExecutionFlow({
    selectedChapter,
    chapterAuditReports,
    chapterRuntimePackage: runtimePackage,
    chapterStateSnapshot,
    latestStateSnapshot,
    chapterRunStatus,
    repairRunStatus,
    isStreaming,
    streamingChapterId,
    isRepairStreaming: isRepairingChapter,
    repairStreamingChapterId,
    isRunningFullAudit,
    backgroundActivities: backgroundSyncActivities,
  });

  const showQuickEditorAction = Boolean(selectedChapter && primaryAction.label !== "Open chapter editor");
  const showQuickAuditAction = Boolean(selectedChapter && primaryAction.label !== "Run a full review" && primaryAction.label !== "Running full review...");
  const showQuickRepairAction = Boolean(
    selectedChapter
      && displayedStatus === "needs_repair"
      && primaryAction.label !== "Automatically fix problems"
      && primaryAction.label !== "Automatically repairing...",
  );

  return (
    <Card className="self-start overflow-hidden border-border/70 lg:sticky lg:top-4">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 to-background pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">AI execution platform</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            By default, only the currently most recommended step is retained. Other actions are still there, but they have been retreated to the folding area below to avoid cluttering the right buttons.
                                </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-3">
          <div className="text-xs text-muted-foreground">Current operation object</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{selectedChapterLabel}</div>
          {selectedChapter ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{chapterStatusLabel(displayedStatus ?? selectedChapter.chapterStatus)}</Badge>
              <Badge variant="outline">{chapterSuggestedActionLabel(selectedChapter)}</Badge>
            </div>
          ) : null}
        </div>
        <ChapterExecutionStatusFlow
          stages={executionFlow.stages}
          currentStageKey={executionFlow.currentStage.key}
          currentStageNote={executionFlow.currentStage.note}
        />
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <div className="text-xs text-muted-foreground">The most recommended actions at the moment</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{primaryAction.reason}</div>
          <div className="mt-3">
            <PrimaryActionButton action={primaryAction} className="w-full" />
          </div>
          <div className="mt-3 grid gap-2">
            {showQuickEditorAction ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/novels/${novelId}/chapters/${selectedChapter!.id}`}>Open chapter editor</Link>
              </Button>
            ) : null}
            {showQuickAuditAction ? (
              <AiButton className="w-full" variant="outline" onClick={onRunFullAudit} disabled={!selectedChapter || isReviewingChapter}>
                {isRunningFullAudit ? "Running a full audit..." : "Running a full audit"}
              </AiButton>
            ) : null}
            {showQuickRepairAction ? (
              <AiButton className="w-full" variant="secondary" onClick={onAutoRepair} disabled={!selectedChapter || isSelectedChapterRepairing}>
                {isSelectedChapterRepairing && repairActionKind === "autoRepair" ? "Automatically repairing..." : "Automatically repairing issues"}
              </AiButton>
            ) : null}
          </div>
          <div className="mt-3 text-xs leading-6 text-muted-foreground">
            If you're not sure what to order, give priority to the recommended actions here. More detailed supplementary capabilities are still below.
                                </div>
        </div>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Asset completion and special inspection
                                </summary>
          <div className="mt-3 grid gap-2">
            <AiButton size="sm" variant="outline" onClick={onGenerateTaskSheet} disabled={!selectedChapter || isExecutionContractPending}>
              {isGeneratingTaskSheet ? "Generating task sheet..." : "Generating task sheet"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onGenerateSceneCards} disabled={!selectedChapter || isExecutionContractPending}>
              {isGeneratingSceneCards ? "Generating scene breakdown..." : "Generating scene breakdown"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onSummarizeChapter} disabled={!selectedChapter || isSummarizingChapter}>
              {isSummarizingChapter ? "Generating summary..." : "Generating summary"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onReplanChapter} disabled={!selectedChapter || isReplanningChapter}>
              {isReplanningChapter ? "Adjusting subsequent plans..." : "Adjusting subsequent chapter plans"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckContinuity} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "continuity" ? "Checking continuity..." : "Checking continuity"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckCharacterConsistency} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "character_consistency" ? "Checking character consistency..." : "Checking character consistency"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckPacing} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "pacing" ? "Checking pacing..." : "Checking pacing"}
            </AiButton>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Polish and enhance
                                </summary>
          <div className="mt-3 grid gap-2">
            <AiButton size="sm" variant="outline" onClick={onRewriteChapter} disabled={!hasCharacters || !selectedChapter || isSelectedChapterStreaming}>
              {isSelectedChapterStreaming && generationActionKind === "rewrite" ? "Rewriting this chapter..." : "Rewriting this chapter"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onExpandChapter} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "expand" ? "Expanding this chapter..." : "Expanding this chapter"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCompressChapter} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "compress" ? "Compressing this chapter..." : "Compressing this chapter"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onStrengthenConflict} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "strengthenConflict" ? "Strengthening Conflict..." : "Strengthening Conflict"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onEnhanceEmotion} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "enhanceEmotion" ? "Enhancing Emotion..." : "Enhancing Emotion"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onUnifyStyle} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "unifyStyle" ? "Unifying writing style..." : "Unifying writing style"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onAddDialogue} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "addDialogue" ? "Adding dialogue..." : "Adding dialogue"}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onAddDescription} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "addDescription" ? "Adding description..." : "Adding description"}
            </AiButton>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            Advanced Writing Strategies
                                </summary>
          <div className="mt-2 text-xs leading-6 text-muted-foreground">
            When in doubt, keep the default value. Only make manual adjustments if you know for sure that this chapter needs faster pace, more conflict, or more freedom.
                                </div>
          <div className="mt-3 grid gap-3">
            <label htmlFor="chapter-strategy-run-mode" className="space-y-1 text-xs text-muted-foreground">
              <span>operating mode</span>
              <SelectControl
                id="chapter-strategy-run-mode"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.runMode}
                onChange={(event) => onStrategyChange("runMode", event.target.value)}
              >
                <option value="fast">Quick</option>
                <option value="polish">Refinement</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-word-size" className="space-y-1 text-xs text-muted-foreground">
              <span>space</span>
              <SelectControl
                id="chapter-strategy-word-size"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.wordSize}
                onChange={(event) => onStrategyChange("wordSize", event.target.value)}
              >
                <option value="short">short</option>
                <option value="medium">middle</option>
                <option value="long">long</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-conflict" className="space-y-1 text-xs text-muted-foreground">
              <span>conflict intensity</span>
              <input
                id="chapter-strategy-conflict"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                type="number"
                min={0}
                max={100}
                value={strategy.conflictLevel}
                onChange={(event) => onStrategyChange("conflictLevel", Number(event.target.value || 0))}
              />
            </label>
            <label htmlFor="chapter-strategy-pace" className="space-y-1 text-xs text-muted-foreground">
              <span>Rhythm</span>
              <SelectControl
                id="chapter-strategy-pace"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.pace}
                onChange={(event) => onStrategyChange("pace", event.target.value)}
              >
                <option value="slow">slow</option>
                <option value="balanced">balanced</option>
                <option value="fast">quick</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-ai-freedom" className="space-y-1 text-xs text-muted-foreground">
              <span>AI freedom</span>
              <SelectControl
                id="chapter-strategy-ai-freedom"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.aiFreedom}
                onChange={(event) => onStrategyChange("aiFreedom", event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">middle</option>
                <option value="high">high</option>
              </SelectControl>
            </label>
            <Button className="w-full" size="sm" onClick={onApplyStrategy} disabled={isApplyingStrategy || !selectedChapter}>
              {isApplyingStrategy ? "Applying strategy..." : "Applying strategy to current chapter"}
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
