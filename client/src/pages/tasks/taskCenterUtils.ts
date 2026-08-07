import type {
  AutoDirectorAction,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import type {
  NovelWorkflowMilestoneType,
  NovelWorkflowResumeTarget,
} from "@ai-novel/shared/types/novelWorkflow";
import type { WorkspaceTone } from "@/components/workspace";
import type { TaskQueueSeverity } from "@/components/taskQueue";

export const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
export const ARCHIVABLE_STATUSES = new Set<TaskStatus>(["succeeded", "failed", "cancelled"]);

export type TaskSortMode = "default" | "updated_desc" | "updated_asc" | "heartbeat_desc" | "heartbeat_asc";

type TaskQueuePresentationInput = Pick<
  UnifiedTaskSummary,
  | "status"
  | "pendingManualRecovery"
  | "checkpointType"
  | "noticeCode"
  | "noticeSummary"
  | "failureCode"
  | "failureSummary"
  | "lastError"
>;

const PIPELINE_QUALITY_REVIEW_CODE = "PIPELINE_QUALITY_REVIEW";
const PIPELINE_REPLAN_REQUIRED_CODE = "PIPELINE_REPLAN_REQUIRED";
const CHAPTER_TITLE_DIVERSITY_CODE = "CHAPTER_TITLE_DIVERSITY";

export function isTaskReplanRequired(task: TaskQueuePresentationInput): boolean {
  return task.checkpointType === "replan_required"
    || task.noticeCode === PIPELINE_REPLAN_REQUIRED_CODE
    || task.failureCode === PIPELINE_REPLAN_REQUIRED_CODE;
}

export function isTaskFailureQualityReminder(task: TaskQueuePresentationInput): boolean {
  return task.failureCode === PIPELINE_QUALITY_REVIEW_CODE
    || task.failureCode === CHAPTER_TITLE_DIVERSITY_CODE;
}

export function isTaskQueueQualityReminder(task: TaskQueuePresentationInput): boolean {
  return task.noticeCode === PIPELINE_QUALITY_REVIEW_CODE
    || task.noticeCode === CHAPTER_TITLE_DIVERSITY_CODE
    || isTaskFailureQualityReminder(task);
}

export function getTaskNoticeSeverity(task: TaskQueuePresentationInput): TaskQueueSeverity {
  if (isTaskReplanRequired(task)) return "blocking";
  if (isTaskQueueQualityReminder(task)) return "quality";
  return "normal";
}

export function getTaskNoticeTitle(task: TaskQueuePresentationInput): string {
  if (isTaskReplanRequired(task)) return "Needs re-planning";
  if (isTaskQueueQualityReminder(task)) return "Quality reminder";
  return "Task reminder";
}

export function getTaskListPriority(task: TaskQueuePresentationInput): number {
  const tone = getTaskQueueTone(task);
  if (tone === "danger") return 0;
  if (tone === "warning") return 1;
  if (tone === "info") return 2;
  return 3;
}

export function isTaskMustHandle(task: TaskQueuePresentationInput): boolean {
  return getTaskQueueTone(task) === "danger";
}

export function getTaskQueueTone(task: TaskQueuePresentationInput): WorkspaceTone {
  if (task.pendingManualRecovery || isTaskReplanRequired(task)) {
    return "danger";
  }
  if (task.status === "failed" && !isTaskFailureQualityReminder(task)) {
    return "danger";
  }
  if (isTaskQueueQualityReminder(task)) {
    return "warning";
  }
  if (task.status === "failed") {
    return "danger";
  }
  if (task.failureCode || task.failureSummary) {
    return "warning";
  }
  if (task.status === "waiting_approval" || task.status === "running" || task.noticeCode || task.noticeSummary) {
    return "info";
  }
  if (task.status === "succeeded") {
    return "success";
  }
  return "neutral";
}

export function getTaskQueueLevelLabel(task: TaskQueuePresentationInput): string {
  const tone = getTaskQueueTone(task);
  if (isTaskReplanRequired(task)) return "Needs re-planning";
  if (task.pendingManualRecovery) return "Need to restore";
  if (tone === "danger") return task.status === "failed" ? "Task failed" : "block";
  if (tone === "warning" && isTaskQueueQualityReminder(task)) return "Quality reminder";
  if (tone === "warning") return "To be operated";
  if (tone === "info") return task.status === "waiting_approval" ? "To be operated" : "in progress";
  if (tone === "success") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  return "Common tasks";
}

export function getTaskQueueSeverity(task: TaskQueuePresentationInput): TaskQueueSeverity {
  const tone = getTaskQueueTone(task);
  if (tone === "danger") return "blocking";
  if (isTaskQueueQualityReminder(task)) return "quality";
  return "normal";
}

export function getTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return new Date(value).getTime();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "None yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "None yet";
  }
  return date.toLocaleString();
}

export function formatTokenCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

export function formatKind(kind: TaskKind): string {
  if (kind === "book_analysis") {
    return "Book split analysis";
  }
  if (kind === "novel_workflow") {
    return "Novel creation";
  }
  if (kind === "novel_pipeline") {
    return "Novel assembly line";
  }
  if (kind === "knowledge_document") {
    return "Knowledge base index";
  }
  if (kind === "style_extraction") {
    return "Writing extraction";
  }
  if (kind === "agent_run") {
    return "Agent running";
  }
  return "Image generation";
}

export function formatCheckpoint(checkpoint: NovelWorkflowMilestoneType | null | undefined, scopeLabel?: string | null): string {
  const resolvedScopeLabel = scopeLabel?.trim() || "Previous 10 chapters";
  if (checkpoint === "rewrite_snapshot_created") {
    return "Backup created before rewriting";
  }
  if (checkpoint === "candidate_selection_required") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract is ready";
  }
  if (checkpoint === "character_setup_required") {
    return "Role preparation pending review";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "Volume strategy is ready";
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolvedScopeLabel}自动执行已暂停`;
  }
  if (checkpoint === "step_review_required") {
    return "Current step to be checked";
  }
  if (checkpoint === "replan_required") {
    return "Needs re-planning";
  }
  if (checkpoint === "workflow_completed") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  return "None yet";
}

export function formatResumeTarget(target: NovelWorkflowResumeTarget | null | undefined): string {
  if (!target) {
    return "None yet";
  }
  if (target.route === "/novels/create") {
    return target.mode === "director" ? "Create Page/AI Auto Director" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (target.stage === "story_macro") {
    return "Novel editing page / story macro planning";
  }
  if (target.stage === "character") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (target.stage === "outline") {
    return "Novel Editor Page/Volume Strategy";
  }
  if (target.stage === "structured") {
    return "Novel editing page/rhythm breaking chapter";
  }
  if (target.stage === "chapter") {
    return "Novel editing page/chapter execution";
  }
  if (target.stage === "pipeline") {
    return "Novel editing page / quality repair";
  }
  return "Novel editing page/project settings";
}

export function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (status === "running") {
    return "Running";
  }
  if (status === "waiting_approval") {
    return "Waiting for approval";
  }
  if (status === "succeeded") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (status === "failed") {
    return "fail";
  }
  return "Canceled";
}

export function toStatusVariant(status: TaskStatus): "default" | "outline" | "secondary" | "destructive" {
  if (status === "running") {
    return "default";
  }
  if (status === "waiting_approval") {
    return "secondary";
  }
  if (status === "queued") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

export function serializeListParams(input: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
}): string {
  return JSON.stringify({
    kind: input.kind || null,
    status: input.status || null,
    keyword: input.keyword.trim() || null,
  });
}

export function createIdempotencyKey(taskId: string, actionCode: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${taskId}:${actionCode}:${globalThis.crypto.randomUUID()}`;
  }
  return `${taskId}:${actionCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function formatFollowUpPriority(priority: "P0" | "P1" | "P2"): string {
  if (priority === "P0") {
    return "P0 Immediate Processing";
  }
  if (priority === "P1") {
    return "P1 should be handled as soon as possible.";
  }
  return "P2 can be processed later.";
}

export function followUpActionVariant(action: AutoDirectorAction): "default" | "outline" {
  return action.kind === "navigation" || action.riskLevel !== "low" ? "outline" : "default";
}
