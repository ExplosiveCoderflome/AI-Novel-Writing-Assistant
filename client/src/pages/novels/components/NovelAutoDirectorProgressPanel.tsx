import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import {
  DIRECTOR_CANDIDATE_SETUP_STEPS,
} from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import AITakeoverContainer, { type AITakeoverMode } from "@/components/workflow/AITakeoverContainer";

type DirectorExecutionViewMode = "execution_progress" | "execution_failed";

interface NovelAutoDirectorProgressPanelProps {
  mode: DirectorExecutionViewMode;
  task: UnifiedTaskDetail | null;
  taskId: string;
  titleHint?: string;
  fallbackError?: string | null;
  onBackgroundContinue: () => void;
  onOpenTaskCenter: () => void;
}

type DirectorStepVisualStatus = "pending" | "running" | "completed" | "failed";
type DirectorStepDefinition = {
  key: string;
  label: string;
};

const DIRECTOR_EXECUTION_STEPS: DirectorStepDefinition[] = [
  { key: "novel_create", label: "创建项目" },
  { key: "book_contract", label: "Book Contract + 故事宏观规划" },
  { key: "character_setup", label: "角色准备" },
  { key: "volume_strategy", label: "卷战略 + 卷骨架" },
  { key: "beat_sheet", label: "第 1 卷节奏板 + 章节列表" },
  { key: "chapter_detail_bundle", label: "前 10 章细化" },
];

const DIRECTOR_CANDIDATE_SETUP_STEP_KEYS = new Set<string>(
  DIRECTOR_CANDIDATE_SETUP_STEPS.map((step) => step.key),
);

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

function formatCheckpoint(checkpoint: NovelWorkflowCheckpoint | null | undefined): string {
  if (checkpoint === "candidate_selection_required") {
    return "等待确认书级方向";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract 已就绪";
  }
  if (checkpoint === "character_setup_required") {
    return "角色准备待审核";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "卷战略已就绪";
  }
  if (checkpoint === "front10_ready") {
    return "前 10 章可开写";
  }
  if (checkpoint === "chapter_batch_ready") {
    return "章节批量资源已就绪";
  }
  if (checkpoint === "replan_required") {
    return "需要重规划";
  }
  if (checkpoint === "workflow_completed") {
    return "主流程完成";
  }
  return "暂无";
}

function isCandidateSetupFlow(task: UnifiedTaskDetail | null): boolean {
  return DIRECTOR_CANDIDATE_SETUP_STEP_KEYS.has(task?.currentItemKey ?? "");
}

function resolveDirectorExecutionStepIndex(task: UnifiedTaskDetail | null): number {
  const itemKey = task?.currentItemKey ?? "";
  if (
    task?.checkpointType === "front10_ready"
    || itemKey === "chapter_detail_bundle"
    || itemKey === "chapter_execution"
  ) {
    return 5;
  }
  if (itemKey === "beat_sheet" || itemKey === "chapter_list" || itemKey === "chapter_sync") {
    return 4;
  }
  if (
    task?.checkpointType === "character_setup_required"
    || itemKey === "character_setup"
    || itemKey === "character_cast_apply"
  ) {
    return 2;
  }
  if (
    task?.checkpointType === "volume_strategy_ready"
    || itemKey === "volume_strategy"
    || itemKey === "volume_skeleton"
  ) {
    return 3;
  }
  if (
    task?.checkpointType === "book_contract_ready"
    || itemKey === "book_contract"
    || itemKey === "story_macro"
    || itemKey === "constraint_engine"
  ) {
    return 1;
  }
  return 0;
}

function resolveCandidateSetupStepIndex(task: UnifiedTaskDetail | null): number {
  const itemKey = task?.currentItemKey ?? "";
  const foundIndex = DIRECTOR_CANDIDATE_SETUP_STEPS.findIndex((step) => step.key === itemKey);
  return foundIndex >= 0 ? foundIndex : 0;
}

function resolveDirectorStepStatuses(
  task: UnifiedTaskDetail | null,
  mode: DirectorExecutionViewMode,
  steps: ReadonlyArray<DirectorStepDefinition>,
): DirectorStepVisualStatus[] {
  if (task?.checkpointType === "front10_ready" || task?.status === "succeeded") {
    return steps.map(() => "completed");
  }

  const currentIndex = isCandidateSetupFlow(task)
    ? resolveCandidateSetupStepIndex(task)
    : resolveDirectorExecutionStepIndex(task);
  return steps.map((_, index) => {
    if (index < currentIndex) {
      return "completed";
    }
    if (index === currentIndex) {
      return mode === "execution_failed" ? "failed" : "running";
    }
    return "pending";
  });
}

function stepClasses(status: DirectorStepVisualStatus): string {
  if (status === "completed") {
    return "border-emerald-500/40 bg-emerald-500/10";
  }
  if (status === "running") {
    return "border-sky-400/60 bg-sky-50";
  }
  if (status === "failed") {
    return "border-destructive/40 bg-destructive/5";
  }
  return "border-border/70 bg-background";
}

function stepBadgeClasses(status: DirectorStepVisualStatus): string {
  if (status === "completed") {
    return "bg-emerald-600 text-white";
  }
  if (status === "running") {
    return "bg-sky-600 text-white";
  }
  if (status === "failed") {
    return "bg-destructive text-destructive-foreground";
  }
  return "bg-muted text-muted-foreground";
}

function stepStatusLabel(status: DirectorStepVisualStatus): string {
  if (status === "completed") {
    return "已完成";
  }
  if (status === "running") {
    return "进行中";
  }
  if (status === "failed") {
    return "失败";
  }
  return "待推进";
}

export default function NovelAutoDirectorProgressPanel({
  mode,
  task,
  taskId,
  titleHint,
  fallbackError,
  onBackgroundContinue,
  onOpenTaskCenter,
}: NovelAutoDirectorProgressPanelProps) {
  const currentAction = task?.currentItemLabel?.trim()
    || (mode === "execution_failed" ? "导演任务执行中断" : "正在准备导演任务");
  const taskTitle = task?.title?.trim() || titleHint?.trim() || "新小说项目";
  const milestones = Array.isArray(task?.meta.milestones)
    ? task.meta.milestones as Array<{ checkpointType: NovelWorkflowCheckpoint; summary: string; createdAt: string }>
    : [];
  const candidateSetupFlow = isCandidateSetupFlow(task);
  const stepDefinitions = candidateSetupFlow
    ? DIRECTOR_CANDIDATE_SETUP_STEPS
    : DIRECTOR_EXECUTION_STEPS;
  const steps = resolveDirectorStepStatuses(task, mode, stepDefinitions);
  const failureMessage = task?.lastError?.trim() || fallbackError?.trim() || "导演任务执行失败，但没有记录明确错误。";
  const containerMode: AITakeoverMode = mode === "execution_failed"
    ? "failed"
    : !task
      ? "loading"
      : task.status === "waiting_approval"
        ? "waiting"
        : "running";
  const description = candidateSetupFlow
    ? (
      mode === "execution_failed"
        ? "候选方向生成链已中断，你可以先去任务中心查看详情，再决定是否重试。"
        : "系统会先整理项目设定、对齐书级 framing，再生成两套书级方案和对应标题组。"
    )
    : (
      mode === "execution_failed"
        ? "任务已经停在最近一步，你可以先去任务中心查看详情，再决定是否恢复。"
        : task?.status === "waiting_approval"
          ? "当前导演流程已经停在审核点，你可以先检查产物，再决定是否继续自动推进。"
          : "可离开当前页面，任务会继续运行，并且可以在任务中心恢复查看。"
    );
  const actions = [
    ...(mode === "execution_progress" && task?.status !== "waiting_approval"
      ? [{
        label: "后台继续",
        onClick: onBackgroundContinue,
        variant: "outline" as const,
      }]
      : []),
    {
      label: "去任务中心查看",
      onClick: onOpenTaskCenter,
      variant: "default" as const,
    },
  ];

  return (
    <div className="space-y-4">
      <AITakeoverContainer
        mode={containerMode}
        title={mode === "execution_failed"
          ? (candidateSetupFlow ? "候选方案生成失败" : "导演执行失败")
          : candidateSetupFlow
            ? "正在生成导演候选方案"
            : `正在导演《${taskTitle}》`}
        description={description}
        progress={task ? task.progress : null}
        currentAction={currentAction}
        checkpointLabel={formatCheckpoint(task?.checkpointType)}
        taskId={taskId || task?.id}
        actions={actions}
      >
        <div className={`grid gap-3 ${candidateSetupFlow ? "md:grid-cols-4" : "md:grid-cols-6"}`}>
          {stepDefinitions.map((step, index) => (
            <div key={step.key} className={`rounded-xl border p-3 ${stepClasses(steps[index] ?? "pending")}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${stepBadgeClasses(steps[index] ?? "pending")}`}>
                  {index + 1}
                </span>
                <span className="text-[11px] text-muted-foreground">{stepStatusLabel(steps[index] ?? "pending")}</span>
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">{step.label}</div>
            </div>
          ))}
        </div>

        {mode === "execution_failed" ? (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="font-medium">失败摘要</div>
            <div className="mt-1">{failureMessage}</div>
            {task?.recoveryHint ? (
              <div className="mt-2 text-xs text-destructive/80">恢复建议：{task.recoveryHint}</div>
            ) : null}
          </div>
        ) : null}
      </AITakeoverContainer>

      <div className="rounded-xl border bg-background/70 p-4">
        <div className="text-sm font-medium text-foreground">里程碑历史</div>
        {milestones.length > 0 ? (
          <div className="mt-3 space-y-3">
            {milestones
              .slice()
              .reverse()
              .map((item) => (
                <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-lg border bg-muted/15 p-3">
                  <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.summary}</div>
                  <div className="mt-1 text-xs text-muted-foreground">记录时间：{formatDate(item.createdAt)}</div>
                </div>
              ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">
            任务已创建，正在等待第一个稳定里程碑写入。
          </div>
        )}
      </div>
    </div>
  );
}
