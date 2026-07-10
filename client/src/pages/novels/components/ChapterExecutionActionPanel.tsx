import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      label: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_7f46c7f9"),
      reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_fad1164a"),
      variant: "default",
      disabled: true,
    };
  }

  if (selectedChapter.chapterStatus === "needs_repair") {
    return {
      label: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_a90ec8b1"),
      reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_87c7bd63"),
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
      label: isRunningFullAudit ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_1791183e") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_b2b7d019"),
      reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_f322e9a6"),
      variant: "default",
      ai: true,
      onClick: onRunFullAudit,
      disabled: isRunningFullAudit,
    };
  }

  if (selectedChapter.chapterStatus === "unplanned" || !chapterHasPreparationAssets(selectedChapter)) {
    return {
      label: isGeneratingChapterPlan ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_3584a9d9") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_c6bdbb8e"),
      reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_614aa02e"),
      variant: "default",
      ai: true,
      onClick: onGenerateChapterPlan,
      disabled: isGeneratingChapterPlan,
    };
  }

  if (!selectedChapter.content?.trim() || selectedChapter.chapterStatus === "pending_generation") {
    return {
      label: isSelectedChapterStreaming ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_c5a3c631") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_dc9c1e62"),
      reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_da1d4960"),
      variant: "default",
      ai: true,
      onClick: onGenerateSelectedChapter,
      disabled: !hasCharacters || isSelectedChapterStreaming,
    };
  }

  return {
    label: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_a90ec8b1"),
    reason: t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_464b3f75"),
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
    ? `第${selectedChapter.order}章 ${selectedChapter.title || t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_db55d102")}`
    : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_cde5cc98");

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

  const showQuickEditorAction = Boolean(selectedChapter && primaryAction.label !== t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_a90ec8b1"));
  const showQuickAuditAction = Boolean(selectedChapter && primaryAction.label !== t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_b2b7d019") && primaryAction.label !== t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_1791183e"));
  const showQuickRepairAction = Boolean(
    selectedChapter
      && displayedStatus === "needs_repair"
      && primaryAction.label !== t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_09f7167f")
      && primaryAction.label !== t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_87166347"),
  );

  return (
    <Card className="self-start overflow-hidden border-border/70 lg:sticky lg:top-4">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 to-background pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("gen.pages.novels.components.ChapterExecutionActionPanel.aiExecutionDesk")}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            默认只保留当前最推荐的一步。其他动作还在，但都退到下面的折叠区，避免右侧按钮堆满。
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-3">
          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_e63fe9ef")}</div>
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
          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_f2a2904e")}</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{primaryAction.reason}</div>
          <div className="mt-3">
            <PrimaryActionButton action={primaryAction} className="w-full" />
          </div>
          <div className="mt-3 grid gap-2">
            {showQuickEditorAction ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/novels/${novelId}/chapters/${selectedChapter!.id}`}>{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_a90ec8b1")}</Link>
              </Button>
            ) : null}
            {showQuickAuditAction ? (
              <AiButton className="w-full" variant="outline" onClick={onRunFullAudit} disabled={!selectedChapter || isReviewingChapter}>
                {isRunningFullAudit ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_1791183e") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_b2b7d019")}
              </AiButton>
            ) : null}
            {showQuickRepairAction ? (
              <AiButton className="w-full" variant="secondary" onClick={onAutoRepair} disabled={!selectedChapter || isSelectedChapterRepairing}>
                {isSelectedChapterRepairing && repairActionKind === "autoRepair" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_87166347") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_09f7167f")}
              </AiButton>
            ) : null}
          </div>
          <div className="mt-3 text-xs leading-6 text-muted-foreground">
            如果你不确定该点什么，优先用这里的推荐动作。更细的补充能力都还在下方。
          </div>
        </div>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            资产补全与专项检查
          </summary>
          <div className="mt-3 grid gap-2">
            <AiButton size="sm" variant="outline" onClick={onGenerateTaskSheet} disabled={!selectedChapter || isExecutionContractPending}>
              {isGeneratingTaskSheet ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_9d296c77") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_1a742abd")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onGenerateSceneCards} disabled={!selectedChapter || isExecutionContractPending}>
              {isGeneratingSceneCards ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_e3c96a66") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_6b1143e4")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onSummarizeChapter} disabled={!selectedChapter || isSummarizingChapter}>
              {isSummarizingChapter ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_f29a225b") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_674e018c")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onReplanChapter} disabled={!selectedChapter || isReplanningChapter}>
              {isReplanningChapter ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_19dd7256") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_ee7c109b")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckContinuity} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "continuity" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_9e6d0a42") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_d990f8d8")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckCharacterConsistency} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "character_consistency" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_1f619228") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_adf472e7")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCheckPacing} disabled={!selectedChapter || isReviewingChapter}>
              {isReviewingChapter && reviewActionKind === "pacing" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_67164c5d") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_fc2ad421")}
            </AiButton>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            润色增强
          </summary>
          <div className="mt-3 grid gap-2">
            <AiButton size="sm" variant="outline" onClick={onRewriteChapter} disabled={!hasCharacters || !selectedChapter || isSelectedChapterStreaming}>
              {isSelectedChapterStreaming && generationActionKind === "rewrite" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_d71ac76a") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_33feb7a6")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onExpandChapter} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "expand" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_05c3a342") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_c07f09c1")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onCompressChapter} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "compress" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_bd2062e5") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_264a9641")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onStrengthenConflict} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "strengthenConflict" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_a7d40af6") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_4f0071ff")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onEnhanceEmotion} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "enhanceEmotion" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_9684e365") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_7b6547bb")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onUnifyStyle} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "unifyStyle" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_2756f913") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_5a4291bb")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onAddDialogue} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "addDialogue" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_3c01c4f9") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_231d57a6")}
            </AiButton>
            <AiButton size="sm" variant="outline" onClick={onAddDescription} disabled={!selectedChapter || isSelectedChapterRepairing}>
              {isSelectedChapterRepairing && repairActionKind === "addDescription" ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_d86d4eb5") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_86e2289b")}
            </AiButton>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
            高级写作策略
          </summary>
          <div className="mt-2 text-xs leading-6 text-muted-foreground">
            不确定时先保持默认值。只有你明确知道这一章需要更快节奏、更强冲突或更高自由度时，再手动调整。
          </div>
          <div className="mt-3 grid gap-3">
            <label htmlFor="chapter-strategy-run-mode" className="space-y-1 text-xs text-muted-foreground">
              <span>{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_44c4aaa1")}</span>
              <SelectControl
                id="chapter-strategy-run-mode"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.runMode}
                onChange={(event) => onStrategyChange("runMode", event.target.value)}
              >
                <option value="fast">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_f63762a0")}</option>
                <option value="polish">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_41ed42e6")}</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-word-size" className="space-y-1 text-xs text-muted-foreground">
              <span>{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_cdbcaa9c")}</span>
              <SelectControl
                id="chapter-strategy-word-size"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.wordSize}
                onChange={(event) => onStrategyChange("wordSize", event.target.value)}
              >
                <option value="short">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_b58b94d8")}</option>
                <option value="medium">{t("gen.pages.novels.components.ChapterExecutionActionPanel.mid")}</option>
                <option value="long">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_092acb9c")}</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-conflict" className="space-y-1 text-xs text-muted-foreground">
              <span>{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_3e85c65a")}</span>
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
              <span>{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_dd608458")}</span>
              <SelectControl
                id="chapter-strategy-pace"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.pace}
                onChange={(event) => onStrategyChange("pace", event.target.value)}
              >
                <option value="slow">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_e0b665f2")}</option>
                <option value="balanced">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_f07d8f75")}</option>
                <option value="fast">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_8fcedbfd")}</option>
              </SelectControl>
            </label>
            <label htmlFor="chapter-strategy-ai-freedom" className="space-y-1 text-xs text-muted-foreground">
              <span>{t("gen.pages.novels.components.ChapterExecutionActionPanel.aiFreedomDegree")}</span>
              <SelectControl
                id="chapter-strategy-ai-freedom"
                className="w-full rounded-xl border bg-background p-2 text-sm text-foreground"
                value={strategy.aiFreedom}
                onChange={(event) => onStrategyChange("aiFreedom", event.target.value)}
              >
                <option value="low">{t("gen.pages.novels.components.ChapterExecutionActionPanel.low")}</option>
                <option value="medium">{t("gen.pages.novels.components.ChapterExecutionActionPanel.mid")}</option>
                <option value="high">{t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_4296d7d2")}</option>
              </SelectControl>
            </label>
            <Button className="w-full" size="sm" onClick={onApplyStrategy} disabled={isApplyingStrategy || !selectedChapter}>
              {isApplyingStrategy ? t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_b55d59e2") : t("gen.pages.novels.components.ChapterExecutionActionPanel.gen_ed14b566")}
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
