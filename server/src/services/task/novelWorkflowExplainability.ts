import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { isAutoDirectorRecoveryInProgress } from "../novel/workflow/novelWorkflowRecoveryHeuristics";
import { normalizeFailureSummary } from "./taskSupport";
import { NOVEL_WORKFLOW_STAGE_LABELS } from "../novel/workflow/novelWorkflow.shared";

interface WorkflowExplainabilityInput {
  status: TaskStatus;
  currentStage?: string | null;
  currentItemKey?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | null;
  lastError?: string | null;
  executionScopeLabel?: string | null;
}

export interface WorkflowExplainabilitySummary {
  displayStatus: string | null;
  blockingReason: string | null;
  resumeAction: string | null;
  lastHealthyStage: string | null;
}

const WORKFLOW_ITEM_STAGE_MAP: Partial<Record<string, NovelWorkflowStage>> = {
  project_setup: "project_setup",
  auto_director: "auto_director",
  candidate_seed_alignment: "auto_director",
  candidate_project_framing: "auto_director",
  candidate_direction_batch: "auto_director",
  candidate_title_pack: "auto_director",
  novel_create: "project_setup",
  book_contract: "story_macro",
  story_macro: "story_macro",
  constraint_engine: "story_macro",
  character_setup: "character_setup",
  character_cast_apply: "character_setup",
  volume_strategy: "volume_strategy",
  volume_skeleton: "volume_strategy",
  beat_sheet: "structured_outline",
  chapter_list: "structured_outline",
  chapter_sync: "structured_outline",
  chapter_detail_bundle: "structured_outline",
  structured_outline: "structured_outline",
  chapter_execution: "chapter_execution",
  quality_repair: "quality_repair",
};

const CHECKPOINT_DISPLAY_STATUS: Record<NovelWorkflowCheckpoint, string> = {
  candidate_selection_required: "等待确认书级方向",
  book_contract_ready: "Book Contract 已就绪",
  character_setup_required: "角色准备待审核",
  volume_strategy_ready: "卷战略待审核",
  front10_ready: "前 10 章已可进入章节执行",
  chapter_batch_ready: "前 10 章自动执行已暂停",
  replan_required: "等待处理重规划",
  workflow_completed: "自动导演已完成",
};

const CHECKPOINT_BLOCKING_REASON: Record<NovelWorkflowCheckpoint, string> = {
  candidate_selection_required: "需要先确认书级方向，自动导演才能继续推进后续主链。",
  book_contract_ready: "Book Contract 已生成，需先确认核心承诺后再继续后续规划。",
  character_setup_required: "角色准备已生成，需先审核角色阵容后再继续推进。",
  volume_strategy_ready: "卷战略与卷骨架已就绪，需先确认卷级推进方案后再继续。",
  front10_ready: "前 10 章细化已准备完成，你可以进入章节执行，或继续让系统自动执行前 10 章。",
  chapter_batch_ready: "前 10 章自动执行在批量阶段暂停了，建议先看结果，再决定是否继续自动执行剩余章节。",
  replan_required: "审计结果要求先处理重规划，后续章节才能继续推进。",
  workflow_completed: "默认主流程已跑通，你可以直接进入章节执行继续写作。",
};

const CHECKPOINT_LAST_HEALTHY_STAGE: Record<NovelWorkflowCheckpoint, NovelWorkflowStage> = {
  candidate_selection_required: "auto_director",
  book_contract_ready: "story_macro",
  character_setup_required: "character_setup",
  volume_strategy_ready: "volume_strategy",
  front10_ready: "structured_outline",
  chapter_batch_ready: "chapter_execution",
  replan_required: "quality_repair",
  workflow_completed: "quality_repair",
};

function getExecutionScopeLabel(input: WorkflowExplainabilityInput, fallback = "前 10 章"): string {
  return input.executionScopeLabel?.trim() || fallback;
}

function buildAutoExecutionPreparedStatus(input: WorkflowExplainabilityInput): string {
  return `${getExecutionScopeLabel(input)}已可进入章节执行`;
}

function buildAutoExecutionRunningStatus(input: WorkflowExplainabilityInput): string {
  return `${getExecutionScopeLabel(input)}自动执行中`;
}

function buildAutoExecutionPausedStatus(input: WorkflowExplainabilityInput): string {
  return `${getExecutionScopeLabel(input)}自动执行已暂停`;
}

function buildAutoExecutionCancelledStatus(input: WorkflowExplainabilityInput): string {
  return `${getExecutionScopeLabel(input)}自动执行已取消`;
}

function buildAutoExecutionResumeAction(input: WorkflowExplainabilityInput): string {
  return `继续自动执行${getExecutionScopeLabel(input)}`;
}

function buildAutoExecutionPreparedReason(input: WorkflowExplainabilityInput): string {
  const scopeLabel = getExecutionScopeLabel(input);
  return `${scopeLabel}细化已准备完成，你可以进入章节执行，或继续让系统自动执行${scopeLabel}。`;
}

function buildAutoExecutionPausedReason(input: WorkflowExplainabilityInput): string {
  return `${getExecutionScopeLabel(input)}自动执行在批量阶段暂停了，建议先看结果，再决定是否继续自动执行当前范围。`;
}

function getStageLabel(stage: NovelWorkflowStage | null | undefined): string | null {
  return stage ? (NOVEL_WORKFLOW_STAGE_LABELS[stage] ?? stage) : null;
}

function getLastHealthyStage(input: WorkflowExplainabilityInput): string | null {
  if (input.checkpointType) {
    return getStageLabel(CHECKPOINT_LAST_HEALTHY_STAGE[input.checkpointType]);
  }
  const mappedStage = input.currentItemKey ? WORKFLOW_ITEM_STAGE_MAP[input.currentItemKey] : null;
  if (mappedStage) {
    return getStageLabel(mappedStage);
  }
  return input.currentStage?.trim() || null;
}

function getCurrentStageLabel(input: WorkflowExplainabilityInput): string | null {
  const mappedStage = input.currentItemKey ? WORKFLOW_ITEM_STAGE_MAP[input.currentItemKey] : null;
  if (mappedStage) {
    return getStageLabel(mappedStage);
  }
  if (input.currentStage && input.currentStage in NOVEL_WORKFLOW_STAGE_LABELS) {
    return getStageLabel(input.currentStage as NovelWorkflowStage);
  }
  return input.currentStage?.trim() || null;
}

export function buildWorkflowResumeAction(
  status: TaskStatus,
  checkpointType: NovelWorkflowCheckpoint | null,
  executionScopeLabel?: string | null,
): string | null {
  const explainabilityInput = { status, checkpointType, executionScopeLabel } satisfies WorkflowExplainabilityInput;
  if (status === "waiting_approval") {
    if (checkpointType === "candidate_selection_required") {
      return "继续确认书级方向";
    }
    if (checkpointType === "book_contract_ready") {
      return "查看 Book Contract";
    }
    if (checkpointType === "character_setup_required") {
      return "去审核角色准备";
    }
    if (checkpointType === "volume_strategy_ready") {
      return "查看卷战略";
    }
    if (checkpointType === "front10_ready") {
      return buildAutoExecutionResumeAction(explainabilityInput);
    }
    if (checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionResumeAction(explainabilityInput);
    }
    if (checkpointType === "replan_required") {
      return "处理重规划";
    }
    if (checkpointType === "workflow_completed") {
      return "进入章节执行";
    }
    return "继续小说主流程";
  }
  if (status === "failed" || status === "cancelled") {
    if (checkpointType === "front10_ready") {
      return buildAutoExecutionResumeAction(explainabilityInput);
    }
    if (checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionResumeAction(explainabilityInput);
    }
    if (checkpointType === "workflow_completed") {
      return "进入章节执行";
    }
    return "从最近检查点恢复";
  }
  if (status === "running" || status === "queued") {
    return "查看当前进度";
  }
  if (status === "succeeded" && checkpointType === "workflow_completed") {
    return "进入章节执行";
  }
  return null;
}

function buildDisplayStatus(input: WorkflowExplainabilityInput): string | null {
  if (isAutoDirectorRecoveryInProgress(input)) {
    const currentStageLabel = getCurrentStageLabel(input);
    return currentStageLabel
      ? `${currentStageLabel}恢复中`
      : "自动导演恢复中";
  }
  if (
    (input.status === "queued" || input.status === "running")
    && (input.checkpointType === "front10_ready" || input.checkpointType === "chapter_batch_ready")
  ) {
    return buildAutoExecutionRunningStatus(input);
  }
  if (input.status === "waiting_approval") {
    if (input.checkpointType === "front10_ready") {
      return buildAutoExecutionPreparedStatus(input);
    }
    if (input.checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionPausedStatus(input);
    }
    return input.checkpointType
      ? CHECKPOINT_DISPLAY_STATUS[input.checkpointType]
      : "等待继续小说主流程";
  }
  if (input.status === "running") {
    const currentStageLabel = getCurrentStageLabel(input);
    return currentStageLabel
      ? `${currentStageLabel}进行中`
      : "自动导演进行中";
  }
  if (input.status === "queued") {
    return "自动导演排队中";
  }
  if (input.status === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionPausedStatus(input);
    }
    return "自动导演执行失败";
  }
  if (input.status === "cancelled") {
    if (input.checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionCancelledStatus(input);
    }
    return "自动导演已取消";
  }
  if (input.checkpointType === "workflow_completed") {
    return "自动导演已完成";
  }
  return input.status === "succeeded" ? "小说主流程已完成" : null;
}

function buildBlockingReason(input: WorkflowExplainabilityInput): string | null {
  if (isAutoDirectorRecoveryInProgress(input)) {
    return input.lastError?.trim() || "自动导演任务正在从服务重启中恢复。";
  }
  if (input.status === "running" || input.status === "succeeded") {
    return null;
  }
  if (input.status === "queued") {
    return "任务已进入队列，正在等待工作线程和模型资源可用。";
  }
  if (input.status === "waiting_approval") {
    if (input.checkpointType === "front10_ready") {
      return buildAutoExecutionPreparedReason(input);
    }
    if (input.checkpointType === "chapter_batch_ready") {
      return buildAutoExecutionPausedReason(input);
    }
    return input.checkpointType
      ? CHECKPOINT_BLOCKING_REASON[input.checkpointType]
      : "当前流程已停在安全检查点，处理完当前阶段后才能继续。";
  }
  if (input.status === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `${getExecutionScopeLabel(input)}自动执行在批量阶段中断了，建议从最近健康阶段继续恢复。`;
    }
    return normalizeFailureSummary(input.lastError, "当前阶段执行失败，建议从最近检查点恢复。");
  }
  if (input.status === "cancelled") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `${getExecutionScopeLabel(input)}自动执行已取消，如需继续可从最近健康阶段恢复。`;
    }
    return "任务已取消，如仍需继续，可从最近检查点恢复。";
  }
  return null;
}

export function buildWorkflowExplainability(input: WorkflowExplainabilityInput): WorkflowExplainabilitySummary {
  return {
    displayStatus: buildDisplayStatus(input),
    blockingReason: buildBlockingReason(input),
    resumeAction: buildWorkflowResumeAction(input.status, input.checkpointType ?? null, input.executionScopeLabel),
    lastHealthyStage: getLastHealthyStage(input),
  };
}
