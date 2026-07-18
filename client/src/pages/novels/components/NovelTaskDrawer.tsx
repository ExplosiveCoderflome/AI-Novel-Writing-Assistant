import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
﻿import type {
  NovelWorkflowMilestone,
  NovelWorkflowMilestoneType,
} from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorBookAutomationAction } from "@ai-novel/shared/types/directorRuntime";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import type { CharacterResourceProposalSummary } from "@ai-novel/shared/types/characterResource";
import type { AutoDirectorAction } from "@ai-novel/shared/types/autoDirectorFollowUp";
import AICockpit from "@/components/autoDirector/AICockpit";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import TaskCenterManualEditImpactCard from "@/pages/tasks/components/TaskCenterManualEditImpactCard";
import TaskCenterRuntimePolicyCard from "@/pages/tasks/components/TaskCenterRuntimePolicyCard";
import type { NovelTaskDrawerState } from "./NovelEditView.types";

type DrawerTask = NonNullable<NovelTaskDrawerState["task"]>;

function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_e5ac1d20");
  }
  if (status === "running") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_d679aea3");
  }
  if (status === "waiting_approval") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_f6324c78");
  }
  if (status === "succeeded") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_fad5222c");
  }
  if (status === "failed") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_acd5cb84");
  }
  return t("gen.pages.novels.components.NovelTaskDrawer.gen_2111ccbb");
}

function formatTaskStatus(task: DrawerTask): string {
  if (task.pendingManualRecovery) {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_b0e31037");
  }
  return formatStatus(task.status);
}

function toStatusVariant(status: TaskStatus): "default" | "outline" | "secondary" | "destructive" {
  if (status === "running") {
    return "default";
  }
  if (status === "failed") {
    return "destructive";
  }
  if (status === "queued" || status === "waiting_approval") {
    return "secondary";
  }
  return "outline";
}

function toTaskStatusVariant(task: DrawerTask): "default" | "outline" | "secondary" | "destructive" {
  if (task.pendingManualRecovery) {
    return "secondary";
  }
  return toStatusVariant(task.status);
}

function formatCheckpoint(checkpoint: NovelWorkflowMilestoneType | null | undefined, scopeLabel?: string | null): string {
  const resolvedScopeLabel = scopeLabel?.trim() || t("gen.pages.novels.components.NovelTaskDrawer.gen_dd4d6c1f");
  if (checkpoint === "rewrite_snapshot_created") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_40c91bfe");
  }
  if (checkpoint === "candidate_selection_required") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_dbc67929");
  }
  if (checkpoint === "book_contract_ready") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_BookContra_ppep");
  }
  if (checkpoint === "character_setup_required") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_67358797");
  }
  if (checkpoint === "volume_strategy_ready") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_2282ccfa");
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolvedScopeLabel}自动执行已暂停`;
  }
  if (checkpoint === "step_review_required") {
    return "当前步骤待检查";
  }
  if (checkpoint === "workflow_completed") {
    return t("gen.pages.novels.components.NovelTaskDrawer.mainProcessComplete");
  }
  return t("gen.pages.novels.components.NovelTaskDrawer.gen_f61f4cf6");
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_f61f4cf6");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_f61f4cf6");
  }
  return date.toLocaleString();
}

function formatTokenCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

function formatStepStatus(status: "idle" | "running" | "succeeded" | "failed" | "cancelled"): string {
  if (status === "running") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_fb852fc6");
  }
  if (status === "succeeded") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_fad5222c");
  }
  if (status === "failed") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_acd5cb84");
  }
  if (status === "cancelled") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_2111ccbb");
  }
  return t("gen.pages.novels.components.NovelTaskDrawer.gen_047109de");
}

function formatRiskLevel(riskLevel: CharacterResourceProposalSummary["riskLevel"]): string {
  if (riskLevel === "high") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_4433e710");
  }
  if (riskLevel === "medium") {
    return t("gen.pages.novels.components.NovelTaskDrawer.gen_90ed1236");
  }
  return t("gen.pages.novels.components.NovelTaskDrawer.lowRisk");
}

function formatProposalSource(proposal: CharacterResourceProposalSummary): string {
  return proposal.sourceType === "chapter_background_sync" ? t("gen.pages.novels.components.NovelTaskDrawer.gen_fe203861") : t("gen.pages.novels.components.NovelTaskDrawer.gen_0e7c9c97");
}

function followUpActionVariant(action: AutoDirectorAction): "default" | "outline" {
  return action.kind === "mutation" && action.riskLevel !== "high" ? "default" : "outline";
}

function formatFollowUpPriority(priority: "P0" | "P1" | "P2"): string {
  if (priority === "P0") {
    return t("gen.pages.novels.components.NovelTaskDrawer.p0ProcessImmediately");
  }
  if (priority === "P1") {
    return t("gen.pages.novels.components.NovelTaskDrawer.p1ProcessSoon");
  }
  return t("gen.pages.novels.components.NovelTaskDrawer.gen_P2稍后处理_z628");
}

function readProposalPayloadText(
  proposal: CharacterResourceProposalSummary,
  key: string,
): string {
  const value = proposal.payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function ResourceProposalCard(props: {
  proposal: CharacterResourceProposalSummary;
  onOpenSource?: (proposal: CharacterResourceProposalSummary) => void;
  onConfirm?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
  confirmingProposalId?: string;
  rejectingProposalId?: string;
}) {
  const {
    proposal,
    onOpenSource,
    onConfirm,
    onReject,
    confirmingProposalId = "",
    rejectingProposalId = "",
  } = props;
  const resourceName = readProposalPayloadText(proposal, "resourceName") || t("gen.pages.novels.components.NovelTaskDrawer.gen_4360c49d");
  const holderName = readProposalPayloadText(proposal, "holderCharacterName");
  const narrativeImpact = readProposalPayloadText(proposal, "narrativeImpact");
  const isConfirming = confirmingProposalId === proposal.id;
  const isRejecting = rejectingProposalId === proposal.id;

  return (
    <div className="space-y-3 rounded-xl border bg-background/80 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{resourceName}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {holderName ? `${holderName}相关资源` : t("gen.pages.novels.components.NovelTaskDrawer.gen_80b3004c")}
          </div>
        </div>
        <Badge variant={proposal.riskLevel === "high" ? "destructive" : "secondary"}>
          {formatRiskLevel(proposal.riskLevel)}
        </Badge>
      </div>
      <div className="text-sm leading-6 text-muted-foreground">{proposal.summary}</div>
      {narrativeImpact ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          确认后影响：{narrativeImpact}
        </div>
      ) : null}
      {proposal.evidence[0] ? (
        <div className="text-xs leading-5 text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_eaa0bd1c")}</div>
      ) : null}
      {proposal.validationNotes[0] ? (
        <div className="text-xs leading-5 text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_19895a34")}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{formatProposalSource(proposal)}</Badge>
        {proposal.chapterId ? <Badge variant="outline">{t("gen.pages.novels.components.NovelTaskDrawer.gen_ca1e1b10")}</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {proposal.chapterId ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenSource?.(proposal)}>
            查看来源
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() => onConfirm?.(proposal.id)}
          disabled={isConfirming || !onConfirm}
        >
          {isConfirming ? t("gen.pages.novels.components.NovelTaskDrawer.gen_1fb26ee2") : t("gen.pages.novels.components.NovelTaskDrawer.gen_eee6f46f")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onReject?.(proposal.id)}
          disabled={isRejecting || !onReject}
        >
          {isRejecting ? t("gen.pages.novels.components.NovelTaskDrawer.gen_2fb90b05") : t("gen.pages.novels.components.NovelTaskDrawer.gen_19c691f8")}
        </Button>
      </div>
    </div>
  );
}

export default function NovelTaskDrawer({
  open,
  onOpenChange,
  task,
  snapshot,
  runtimeSnapshot,
  projection,
  currentUiModel,
  actions,
  onProjectionAction,
  resourceProposals = [],
  onOpenResourceProposalSource,
  onConfirmResourceProposal,
  onRejectResourceProposal,
  confirmingResourceProposalId = "",
  rejectingResourceProposalId = "",
  followUp,
  onFollowUpAction,
  executingFollowUpAction = false,
  runtimeHardBlocked = false,
  runtimeBlockedReason = null,
  overrideModel,
  onOverrideModelChange,
  onRetryWithOverrideModel,
  retryWithOverrideModelPending = false,
  canRetryWithOverrideModel = false,
  onRetryWithTaskModel,
  retryWithTaskModelPending = false,
  capabilities,
  onOpenFullTaskCenter,
}: NovelTaskDrawerState) {
  const milestones = Array.isArray(task?.meta.milestones)
    ? task.meta.milestones as NovelWorkflowMilestone[]
    : [];
  const displayState = snapshot?.displayState ?? null;
  const dashboardView = snapshot?.dashboardView ?? null;
  const projectedProgressPercent = dashboardView?.progressPercent
    ?? displayState?.progressPercent
    ?? projection?.runtimeProjection?.progressBreakdown?.totalPercent;
  const workflowProgressFraction = typeof task?.progress === "number" && Number.isFinite(task.progress)
    ? task.progress
    : null;
  const progressPercent = Math.max(0, Math.min(100, Math.round(
    workflowProgressFraction !== null
      ? workflowProgressFraction * 100
      : typeof projectedProgressPercent === "number"
        ? projectedProgressPercent
        : 0,
  )));
  const tokenUsage = task?.tokenUsage ?? null;
  const primaryAction = projection?.primaryAction ?? null;
  const primaryActionLabel = (
    (primaryAction?.type === "continue" || primaryAction?.type === "auto_execute_range")
    && projection?.displayState === "needs_confirmation"
  )
    ? t("gen.pages.novels.components.NovelTaskDrawer.gen_eca060fa")
    : primaryAction?.label;
  const runProjectedAction = (action: DirectorBookAutomationAction) => {
    const matchedAction = actions.find((item) => {
      if (item.label === action.label) {
        return true;
      }
      if (action.type === "continue") {
        return item.label.includes(t("gen.pages.novels.components.NovelTaskDrawer.gen_27ca568b"));
      }
      if (action.type === "auto_execute_range") {
        return item.label.includes(t("gen.pages.novels.components.NovelTaskDrawer.gen_df39e421"));
      }
      if (action.type === "confirm_candidate") {
        return item.label.includes(t("gen.pages.novels.components.NovelTaskDrawer.chapterDirection"));
      }
      if (action.type === "open_quality_repair") {
        return item.label.includes(t("gen.pages.novels.components.NovelTaskDrawer.gen_9b00f20b"));
      }
      if (action.type === "open_chapter") {
        return item.label.includes(t("gen.pages.novels.components.NovelTaskDrawer.gen_663bbefc"));
      }
      return false;
    });
    matchedAction?.onClick();
  };
  const handleProjectionAction = (action: DirectorBookAutomationAction) => {
    if (onProjectionAction) {
      onProjectionAction(action);
      return;
    }
    runProjectedAction(action);
  };
  const canShowRuntimePolicy = capabilities?.canAdjustRuntimePolicy !== false && Boolean(task?.id && runtimeSnapshot);
  const canShowManualImpact = capabilities?.canInspectManualEditImpact !== false && Boolean(task);
  const canShowRetryWithOverrideModel = capabilities?.canRetryWithOverrideModel === true;
  const canShowFollowUp = capabilities?.availableFollowUps !== false && Boolean(followUp);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[520px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 border-l bg-background p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>{t("gen.pages.novels.components.NovelTaskDrawer.gen_2eceed7d")}</DialogTitle>
          <DialogDescription>
            查看本书 AI 推进记录、快捷处理动作和排查信息。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {task || projection ? (
            <AICockpit
              projection={projection}
              mode="focusedNovel"
              fallbackSummary={dashboardView?.currentAction || displayState?.currentAction || task?.blockingReason || task?.currentItemLabel || t("gen.pages.novels.components.NovelTaskDrawer.gen_f867f208")}
              fallbackStatusLabel={dashboardView?.statusLabel ?? (task ? formatTaskStatus(task) : t("gen.pages.novels.components.NovelTaskDrawer.gen_ea4a363d"))}
              showDetailsAction={false}
              onAction={(_projection, action) => handleProjectionAction(action)}
            />
          ) : null}

          {resourceProposals.length > 0 ? (
            <section className="space-y-3 rounded-2xl border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-700/50 dark:bg-amber-950/15">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_4346160b")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    这些判断会影响后续章节能使用哪些关键资源。
                  </div>
                </div>
                <Badge variant="secondary">{t("gen.pages.novels.components.NovelTaskDrawer.resourceProposalCount")}</Badge>
              </div>
              <div className="space-y-2">
                {resourceProposals.slice(0, 4).map((proposal) => (
                  <ResourceProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onOpenSource={onOpenResourceProposalSource}
                    onConfirm={onConfirmResourceProposal}
                    onReject={onRejectResourceProposal}
                    confirmingProposalId={confirmingResourceProposalId}
                    rejectingProposalId={rejectingResourceProposalId}
                  />
                ))}
              </div>
              {resourceProposals.length > 4 ? (
                <div className="text-xs text-muted-foreground">
                  还有 {resourceProposals.length - 4} 条资源变化，可在对应章节继续处理。
                </div>
              ) : null}
            </section>
          ) : null}

          {task ? (
            <>
              <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-semibold text-foreground">{task.title}</div>
                  <Badge variant={toTaskStatusVariant(task)}>{formatTaskStatus(task)}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.NovelTaskDrawer.progressPrefix")} {progressPercent}%</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_ea328dc7")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{dashboardView?.stageLabel ?? displayState?.stageLabel ?? task.currentStage ?? "暂无"}</div>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_b5e4737c")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{dashboardView?.currentAction ?? displayState?.currentAction ?? task.currentItemLabel ?? "暂无"}</div>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_067d1583")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{displayState?.checkpointLabel ?? formatCheckpoint(task.checkpointType, task.executionScopeLabel)}</div>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_9a36d2f3")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{formatDate(task.heartbeatAt)}</div>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                {task.checkpointSummary ? (
                  <div className="rounded-xl border bg-background/80 p-3 text-sm text-muted-foreground">
                    {task.checkpointSummary}
                  </div>
                ) : null}
                {task.lastError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <div className="font-medium">{t("gen.pages.novels.components.NovelTaskDrawer.gen_a2b83df0")}</div>
                    <div className="mt-1">{task.lastError}</div>
                    {task.recoveryHint ? (
                      <div className="mt-2 text-xs text-destructive/80">{t("gen.pages.novels.components.NovelTaskDrawer.recoveryHintPrefix")}{task.recoveryHint}</div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {canShowFollowUp && followUp ? (
                <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_0cc8fa93")}</div>
                    <Badge variant="outline">{followUp.reasonLabel}</Badge>
                    <Badge variant={followUp.priority === "P0" ? "destructive" : "secondary"}>
                      {formatFollowUpPriority(followUp.priority)}
                    </Badge>
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">{followUp.followUpSummary}</div>
                  {followUp.blockingReason ? (
                    <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_1fe796ea")}</div>
                  ) : null}
                  {followUp.currentModel ? (
                    <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_d1e47356")}</div>
                  ) : null}
                  {runtimeHardBlocked && runtimeBlockedReason ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {runtimeBlockedReason}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {followUp.availableActions.map((action) => (
                      <Button
                        key={action.code}
                        type="button"
                        size="sm"
                        variant={followUpActionVariant(action)}
                        onClick={() => onFollowUpAction?.(action)}
                        disabled={executingFollowUpAction || (runtimeHardBlocked && action.kind !== "navigation")}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}

              {canShowRuntimePolicy && task ? (
                <section className="space-y-3">
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_8cc5c30b")}</div>
                  <TaskCenterRuntimePolicyCard taskId={task.id} snapshot={runtimeSnapshot} />
                </section>
              ) : null}

              {canShowManualImpact && task ? (
                <section className="space-y-3">
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_deafa76f")}</div>
                  <TaskCenterManualEditImpactCard task={task} />
                </section>
              ) : null}

              {canShowRetryWithOverrideModel && overrideModel && onOverrideModelChange ? (
                <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
                  <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_使用其他模型重试_rnjo")}</div>
                  <LLMSelector
                    value={overrideModel}
                    onChange={onOverrideModelChange}
                    compact
                    showBadge={false}
                    showHelperText={false}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={onRetryWithOverrideModel}
                      disabled={retryWithOverrideModelPending || !canRetryWithOverrideModel}
                    >
                      {retryWithOverrideModelPending ? t("gen.pages.novels.components.NovelTaskDrawer.gen_a66c5c6d") : t("gen.pages.novels.components.NovelTaskDrawer.retrySelectedModel")}
                    </Button>
                    {onRetryWithTaskModel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onRetryWithTaskModel}
                        disabled={retryWithTaskModelPending}
                      >
                        {retryWithTaskModelPending ? t("gen.pages.novels.components.NovelTaskDrawer.gen_a66c5c6d") : t("gen.pages.novels.components.NovelTaskDrawer.gen_96fb9361")}
                      </Button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="space-y-3">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_ee2fff7a")}</div>
                {actions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.label}
                        type="button"
                        size="sm"
                        variant={action.variant ?? "default"}
                        disabled={action.disabled}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                    当前没有可直接执行的快捷动作。
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_c4d4c376")}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.taskBindingModel")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {task.provider ?? t("gen.pages.novels.components.NovelTaskDrawer.gen_f61f4cf6")} / {task.model ?? t("gen.pages.novels.components.NovelTaskDrawer.gen_f61f4cf6")}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_bfd5823d")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {currentUiModel.provider} / {currentUiModel.model}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      当前温度：{currentUiModel.temperature}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.tokenStatistics")}</div>
                {tokenUsage ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-background/80 p-3">
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_2398ac4d")}</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{formatTokenCount(tokenUsage.llmCallCount)}</div>
                    </div>
                    <div className="rounded-xl border bg-background/80 p-3">
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_461f619e")}</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{formatTokenCount(tokenUsage.totalTokens)}</div>
                    </div>
                    <div className="rounded-xl border bg-background/80 p-3">
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_5986a637")}</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{formatTokenCount(tokenUsage.promptTokens)}</div>
                    </div>
                    <div className="rounded-xl border bg-background/80 p-3">
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_171cf50a")}</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{formatTokenCount(tokenUsage.completionTokens)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        最近记录：{formatDate(tokenUsage.lastRecordedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                    当前任务还没有累计到可展示的 token 用量；一旦模型开始返回 usage，这里会自动刷新。
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_d96a7b07")}</div>
                <div className="space-y-2">
                  {(displayState?.steps ?? task.steps).map((step) => (
                    <div key={step.key} className="flex items-center justify-between rounded-xl border bg-background/80 px-3 py-2">
                      <div className="text-sm text-foreground">{step.label}</div>
                      <Badge variant="outline">{"isCurrent" in step
                        ? (step.status === "attention"
                          ? "\u9700\u5904\u7406"
                          : step.status === "running"
                            ? "\u8fdb\u884c\u4e2d"
                            : step.status === "completed"
                              ? "\u5df2\u5b8c\u6210"
                              : "\u5f85\u63a8\u8fdb")
                        : formatStepStatus(step.status)}</Badge>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_8e910f68")}</div>
                {milestones.length > 0 ? (
                  <div className="space-y-2">
                    {milestones
                      .slice()
                      .reverse()
                      .map((milestone) => (
                        <div key={`${milestone.checkpointType}:${milestone.createdAt}`} className="rounded-xl border bg-background/80 p-3">
                          <div className="font-medium text-foreground">{formatCheckpoint(milestone.checkpointType)}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{milestone.summary}</div>
                          <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelTaskDrawer.gen_a9d69ae6")}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                    当前还没有可显示的里程碑记录。
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
              当前小说还没有可见的自动导演任务。你可以继续手动创作，或在后台任务中心查看其他任务。
            </section>
          )}
        </div>

        <div className="space-y-2 border-t border-border/70 px-5 py-4">
          {primaryAction ? (
            <Button type="button" className="w-full" onClick={() => handleProjectionAction(primaryAction)}>
              {primaryActionLabel || t("gen.pages.novels.components.NovelTaskDrawer.gen_a53fb331")}
            </Button>
          ) : null}
          {task?.sourceRoute ? (
            <Button asChild type="button" variant="outline" className="w-full">
              <Link to={task.sourceRoute}>{t("gen.pages.novels.components.NovelTaskDrawer.gen_492476d9")}</Link>
            </Button>
          ) : null}
          <Button type="button" variant={primaryAction ? "ghost" : "outline"} className="w-full" onClick={onOpenFullTaskCenter}>
            打开后台任务中心
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
