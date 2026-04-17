import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { buildWorkflowExplainability, buildWorkflowResumeAction } from "./novelWorkflowExplainability";
import type { DirectorWorkflowSeedPayload } from "../novel/director/novelDirectorHelpers";
import { parseSeedPayload } from "../novel/workflow/novelWorkflow.shared";

export function buildNovelWorkflowNextActionLabel(
  status: TaskStatus,
  checkpointType: NovelWorkflowCheckpoint | null,
  executionScopeLabel?: string | null,
): string | null {
  const resumeAction = buildWorkflowResumeAction(status, checkpointType, executionScopeLabel);
  if (!resumeAction) {
    return null;
  }
  if (status === "waiting_approval" && checkpointType === "front10_ready") {
    return "进入已准备章节";
  }
  return resumeAction;
}

interface NovelWorkflowListSummaryRow {
  id: string;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  lastError: string | null;
  updatedAt: Date;
  seedPayloadJson?: string | null;
}

export function mapNovelAutoDirectorTaskSummary(
  row: NovelWorkflowListSummaryRow,
): NovelAutoDirectorTaskSummary {
  const checkpointType = row.checkpointType as NovelWorkflowCheckpoint | null;
  const status = row.status as TaskStatus;
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson);
  const executionScopeLabel = seedPayload?.autoExecution?.scopeLabel?.trim() || null;
  const explainability = buildWorkflowExplainability({
    status,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    checkpointType,
    lastError: row.lastError,
    executionScopeLabel,
  });
  return {
    id: row.id,
    status,
    progress: row.progress,
    currentStage: row.currentStage,
    currentItemLabel: row.currentItemLabel,
    executionScopeLabel,
    displayStatus: explainability.displayStatus,
    blockingReason: explainability.blockingReason,
    resumeAction: explainability.resumeAction,
    lastHealthyStage: explainability.lastHealthyStage,
    checkpointType,
    checkpointSummary: row.checkpointSummary,
    nextActionLabel: buildNovelWorkflowNextActionLabel(status, checkpointType, executionScopeLabel),
    updatedAt: row.updatedAt.toISOString(),
  };
}
