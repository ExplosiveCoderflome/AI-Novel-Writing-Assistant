import type { DirectorLockScope } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { toast } from "@/components/ui/toast";
import {
  buildContinueAutoExecutionActionLabel,
  buildTakeoverDescription,
  buildTakeoverTitle,
  formatTakeoverCheckpoint,
} from "../novelEditTakeover.shared";
import type { NovelEditTakeoverState, NovelTaskDrawerState } from "../components/NovelEditView.types";

export function resolveDirectorConsistencyIssue(input: {
  checkpointType: string | null | undefined;
  characterCount: number;
  chapterCount: number;
}): "missing_characters" | "missing_chapters" | null {
  if (input.checkpointType === "front10_ready" || input.checkpointType === "chapter_batch_ready") {
    if (input.characterCount === 0) {
      return "missing_characters";
    }
    if (input.chapterCount === 0) {
      return "missing_chapters";
    }
  }
  return null;
}

interface MutationAction {
  isPending: boolean;
  run: () => void;
}

interface TitleRepairAction extends MutationAction {
  pendingTaskId: string;
  startRepair: (task: UnifiedTaskDetail) => void;
}

function showUnsavedVolumeDraftToast(): void {
  toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
}

export function buildNovelAutoDirectorTakeover(input: {
  task: UnifiedTaskDetail | null;
  novelTitle: string;
  activeTab: string;
  reviewScope: DirectorLockScope | null;
  reviewTab: string | null;
  autoExecutionScopeLabel: string;
  consistencyIssue: "missing_characters" | "missing_chapters" | null;
  activeChapterTitleWarning: { label: string; volumeId?: string | null } | null;
  hasUnsavedVolumeDraft: boolean;
  isDirectorExitActionExpanded: boolean;
  continueAutoDirector: MutationAction;
  continueAutoExecution: MutationAction;
  cancelAutoDirector: MutationAction;
  chapterTitleRepair: TitleRepairAction;
  openCandidateSelection: () => void;
  openChapterExecution: () => void;
  openQualityRepair: () => void;
  dismissTakeover: () => void;
  setIsDirectorExitActionExpanded: (expanded: boolean) => void;
  openTaskDrawer: () => void;
  openCharacterTab: () => void;
}): NovelEditTakeoverState | null {
  const task = input.task;
  if (!task) {
    return null;
  }
  const mode: NovelEditTakeoverState["mode"] = task.status === "failed" || task.status === "cancelled"
    ? "failed"
    : task.status === "waiting_approval" && task.checkpointType === "replan_required"
      ? "action_required"
      : task.status === "queued" || task.status === "running"
        ? "running"
        : "waiting";
  const actions: NonNullable<NovelEditTakeoverState["actions"]> = [];

  if (input.activeChapterTitleWarning) {
    actions.push({
      label: input.chapterTitleRepair.isPending && input.chapterTitleRepair.pendingTaskId === task.id
        ? "AI 修复中..."
        : input.activeChapterTitleWarning.label,
      onClick: () => {
        if (input.hasUnsavedVolumeDraft) {
          showUnsavedVolumeDraftToast();
          return;
        }
        input.chapterTitleRepair.startRepair(task);
      },
      variant: mode === "failed" ? "default" : "outline",
      disabled: input.chapterTitleRepair.isPending,
    });
  }

  if (mode === "waiting" && task.checkpointType === "candidate_selection_required") {
    actions.push({
      label: "去确认书级方向",
      onClick: input.openCandidateSelection,
      variant: "default",
    });
  } else if (
    (mode === "waiting" || mode === "action_required")
    && input.reviewTab
    && input.reviewTab !== input.activeTab
    && task.checkpointType !== "front10_ready"
    && task.checkpointType !== "chapter_batch_ready"
  ) {
    actions.push({
      label: "去当前审核阶段",
      onClick: () => input.openCharacterTab(),
      variant: "outline",
    });
  }

  if (mode === "waiting" && task.checkpointType === "front10_ready") {
    actions.push({
      label: buildContinueAutoExecutionActionLabel(input.autoExecutionScopeLabel, input.continueAutoExecution.isPending),
      onClick: input.continueAutoExecution.run,
      variant: "default",
      disabled: input.continueAutoExecution.isPending,
    });
    actions.push({
      label: "进入章节执行",
      onClick: input.openChapterExecution,
      variant: "outline",
    });
  } else if (mode === "waiting" && task.checkpointType === "workflow_completed") {
    actions.push({
      label: "进入章节执行",
      onClick: input.openChapterExecution,
      variant: "default",
    });
  } else if (mode === "action_required" && task.checkpointType === "replan_required") {
    actions.push({
      label: "打开质量修复",
      onClick: input.openQualityRepair,
      variant: "default",
    });
  } else if (mode === "waiting") {
    actions.push({
      label: input.continueAutoDirector.isPending ? "继续中..." : "继续自动导演",
      onClick: input.continueAutoDirector.run,
      variant: "default",
      disabled: input.continueAutoDirector.isPending,
    });
  }

  if (mode === "failed" && task.checkpointType === "chapter_batch_ready") {
    actions.push({
      label: buildContinueAutoExecutionActionLabel(input.autoExecutionScopeLabel, input.continueAutoExecution.isPending),
      onClick: input.continueAutoExecution.run,
      variant: "default",
      disabled: input.continueAutoExecution.isPending,
    });
    actions.push({
      label: "打开质量修复",
      onClick: input.openQualityRepair,
      variant: "outline",
    });
  }

  if (input.consistencyIssue) {
    actions.push({
      label: input.continueAutoDirector.isPending ? "修复中..." : "补齐导演产物",
      onClick: input.continueAutoDirector.run,
      variant: "default",
      disabled: input.continueAutoDirector.isPending,
    });
    if (input.consistencyIssue === "missing_characters") {
      actions.push({
        label: "去角色准备",
        onClick: input.openCharacterTab,
        variant: "outline",
      });
    }
  } else if (task.checkpointType === "front10_ready" && mode !== "waiting") {
    actions.push({
      label: "进入章节执行",
      onClick: input.openChapterExecution,
      variant: mode === "running" ? "outline" : "default",
    });
  }

  if (task.status === "queued" || task.status === "running") {
    if (input.isDirectorExitActionExpanded) {
      actions.push({
        label: "继续导演",
        onClick: () => input.setIsDirectorExitActionExpanded(false),
        variant: "outline",
        disabled: input.cancelAutoDirector.isPending,
      });
      actions.push({
        label: input.cancelAutoDirector.isPending ? "退出中..." : "退出导演模式",
        onClick: input.cancelAutoDirector.run,
        variant: "destructive",
        disabled: input.cancelAutoDirector.isPending,
      });
    } else {
      actions.push({
        label: "停止导演",
        onClick: () => input.setIsDirectorExitActionExpanded(true),
        variant: "destructive",
        disabled: input.cancelAutoDirector.isPending,
      });
    }
  } else if (
    task.status === "waiting_approval"
    || (task.status === "succeeded" && task.checkpointType === "workflow_completed")
  ) {
    actions.push({
      label: "完成并退出",
      onClick: input.dismissTakeover,
      variant: "secondary",
    });
  }

  actions.push({
    label: "任务中心",
    onClick: input.openTaskDrawer,
    variant: mode === "running" ? "outline" : "secondary",
  });

  return {
    mode,
    title: input.consistencyIssue === "missing_characters"
      ? `《${input.novelTitle}》导演产物未补齐角色准备`
      : input.consistencyIssue === "missing_chapters"
        ? `《${input.novelTitle}》导演产物未同步到章节执行区`
        : buildTakeoverTitle({
          mode,
          novelTitle: input.novelTitle,
          checkpointType: task.checkpointType,
          scopeLabel: input.autoExecutionScopeLabel,
        }),
    description: input.consistencyIssue === "missing_characters"
      ? "任务记录显示已完成开书交接，但当前项目里还没有角色资产，所以角色准备和章节执行都不完整。可以直接补齐导演产物，系统会继续修复。"
      : input.consistencyIssue === "missing_chapters"
        ? "任务记录显示前几章已经可开写，但当前章节执行区还是空的，说明导演产物还没有完整落库。可以直接补齐导演产物继续修复。"
        : buildTakeoverDescription({
          mode,
          checkpointType: task.checkpointType,
          reviewScope: input.reviewScope,
          scopeLabel: input.autoExecutionScopeLabel,
        }),
    progress: task.progress,
    currentAction: input.consistencyIssue === "missing_characters"
      ? "检测到角色准备仍为空，当前导演结果需要继续补齐。"
      : input.consistencyIssue === "missing_chapters"
        ? "检测到章节执行区为空，当前导演结果需要继续同步章节资源。"
        : mode === "running" && task.checkpointType === "chapter_batch_ready" && task.currentItemLabel?.includes("已暂停")
          ? `正在继续自动执行${input.autoExecutionScopeLabel}`
          : task.currentItemLabel ?? null,
    checkpointLabel: input.consistencyIssue
      ? "导演产物待补齐"
      : mode === "running" && task.checkpointType === "chapter_batch_ready"
        ? `${input.autoExecutionScopeLabel}自动执行中`
        : formatTakeoverCheckpoint(task.checkpointType, task),
    taskId: task.id,
    actions,
  };
}

export function buildNovelAutoDirectorTaskDrawerActions(input: {
  task: UnifiedTaskDetail | null;
  reviewTab: string | null;
  autoExecutionScopeLabel: string;
  consistencyIssue: "missing_characters" | "missing_chapters" | null;
  activeChapterTitleWarning: { label: string; volumeId?: string | null } | null;
  hasUnsavedVolumeDraft: boolean;
  continueAutoDirector: MutationAction;
  continueAutoExecution: MutationAction;
  cancelAutoDirector: MutationAction;
  retryWithCurrentModel: MutationAction;
  retryWithTaskModel: MutationAction;
  chapterTitleRepair: TitleRepairAction;
  openCandidateSelection: () => void;
  openReviewStage: () => void;
  openChapterExecution: () => void;
  openQualityRepair: () => void;
  openCharacterTabAndClose: () => void;
}): NovelTaskDrawerState["actions"] {
  const task = input.task;
  if (!task) {
    return [];
  }
  const actions: NovelTaskDrawerState["actions"] = [];

  if (input.activeChapterTitleWarning) {
    actions.push({
      label: input.chapterTitleRepair.isPending && input.chapterTitleRepair.pendingTaskId === task.id
        ? "AI 修复中..."
        : input.activeChapterTitleWarning.label,
      onClick: () => {
        if (input.hasUnsavedVolumeDraft) {
          showUnsavedVolumeDraftToast();
          return;
        }
        input.chapterTitleRepair.startRepair(task);
      },
      variant: "default",
      disabled: input.chapterTitleRepair.isPending,
    });
  }

  if (input.consistencyIssue) {
    actions.push({
      label: input.continueAutoDirector.isPending ? "补齐中..." : "补齐导演产物",
      onClick: input.continueAutoDirector.run,
      variant: "default",
      disabled: input.continueAutoDirector.isPending,
    });
    if (input.consistencyIssue === "missing_characters") {
      actions.push({
        label: "去角色准备",
        onClick: input.openCharacterTabAndClose,
        variant: "outline",
      });
    }
  } else if (task.status === "waiting_approval" && task.checkpointType === "front10_ready") {
    actions.push({
      label: buildContinueAutoExecutionActionLabel(input.autoExecutionScopeLabel, input.continueAutoExecution.isPending),
      onClick: input.continueAutoExecution.run,
      variant: "default",
      disabled: input.continueAutoExecution.isPending,
    });
    actions.push({
      label: "进入章节执行",
      onClick: input.openChapterExecution,
      variant: "outline",
    });
  } else if (task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required") {
    actions.push({
      label: "去确认书级方向",
      onClick: input.openCandidateSelection,
      variant: "default",
    });
  } else if (task.status === "waiting_approval" && task.checkpointType === "replan_required") {
    actions.push({
      label: "打开质量修复",
      onClick: input.openQualityRepair,
      variant: "default",
    });
  } else if (
    task.status === "waiting_approval"
    && input.reviewTab
    && task.checkpointType !== "front10_ready"
    && task.checkpointType !== "chapter_batch_ready"
  ) {
    actions.push({
      label: "去当前审核阶段",
      onClick: input.openReviewStage,
      variant: "default",
    });
    actions.push({
      label: input.continueAutoDirector.isPending ? "继续中..." : "继续自动导演",
      onClick: input.continueAutoDirector.run,
      variant: "outline",
      disabled: input.continueAutoDirector.isPending,
    });
  } else if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
    actions.push({
      label: buildContinueAutoExecutionActionLabel(input.autoExecutionScopeLabel, input.continueAutoExecution.isPending),
      onClick: input.continueAutoExecution.run,
      variant: "default",
      disabled: input.continueAutoExecution.isPending,
    });
    actions.push({
      label: "打开质量修复",
      onClick: input.openQualityRepair,
      variant: "outline",
    });
  } else if (task.checkpointType === "front10_ready" || task.checkpointType === "workflow_completed") {
    actions.push({
      label: "进入章节执行",
      onClick: input.openChapterExecution,
      variant: "default",
    });
  }

  if (task.status === "failed" || task.status === "cancelled") {
    actions.push({
      label: input.retryWithCurrentModel.isPending ? "切换中..." : "用当前模型重试",
      onClick: input.retryWithCurrentModel.run,
      variant: "default",
      disabled: input.retryWithCurrentModel.isPending,
    });
    actions.push({
      label: input.retryWithTaskModel.isPending ? "重试中..." : "用原模型重试",
      onClick: input.retryWithTaskModel.run,
      variant: "outline",
      disabled: input.retryWithTaskModel.isPending,
    });
  }

  if (task.status === "queued" || task.status === "running" || task.status === "waiting_approval") {
    actions.push({
      label: input.cancelAutoDirector.isPending ? "取消中..." : "取消任务",
      onClick: input.cancelAutoDirector.run,
      variant: "destructive",
      disabled: input.cancelAutoDirector.isPending,
    });
  }

  return actions;
}
