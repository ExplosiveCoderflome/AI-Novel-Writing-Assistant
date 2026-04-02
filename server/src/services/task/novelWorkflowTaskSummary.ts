import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";

export function buildNovelWorkflowNextActionLabel(
  status: TaskStatus,
  checkpointType: NovelWorkflowCheckpoint | null,
): string | null {
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
      return "进入前 10 章开写";
    }
    if (checkpointType === "chapter_batch_ready") {
      return "继续章节执行";
    }
    if (checkpointType === "replan_required") {
      return "处理重规划";
    }
    return "继续小说主流程";
  }
  if (status === "failed" || status === "cancelled") {
    return "从最近检查点恢复";
  }
  if (status === "running" || status === "queued") {
    return "查看当前进度";
  }
  return null;
}

interface NovelWorkflowListSummaryRow {
  id: string;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  updatedAt: Date;
}

export function mapNovelAutoDirectorTaskSummary(
  row: NovelWorkflowListSummaryRow,
): NovelAutoDirectorTaskSummary {
  const checkpointType = row.checkpointType as NovelWorkflowCheckpoint | null;
  const status = row.status as TaskStatus;
  return {
    id: row.id,
    status,
    progress: row.progress,
    currentStage: row.currentStage,
    currentItemLabel: row.currentItemLabel,
    checkpointType,
    checkpointSummary: row.checkpointSummary,
    nextActionLabel: buildNovelWorkflowNextActionLabel(status, checkpointType),
    updatedAt: row.updatedAt.toISOString(),
  };
}
