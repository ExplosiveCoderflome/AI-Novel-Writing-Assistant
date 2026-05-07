import type { TaskStatus } from "@ai-novel/shared/types/task";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { AutoDirectorFollowUpNotificationService } from "../../task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService";
import type { AutoDirectorEventWorkflowSnapshot } from "../../task/autoDirectorFollowUps/autoDirectorFollowUpEventBuilder";
import type { NovelWorkflowTaskUpdateArgs } from "./workflowTaskPersistence";

export interface WorkflowTaskNotificationRow {
  id: string;
  novelId: string | null;
  lane: string;
  status: string;
  progress?: number | null;
  currentStage: string | null;
  checkpointType: string | null;
  checkpointSummary?: string | null;
  currentItemLabel?: string | null;
  pendingManualRecovery: boolean;
  updatedAt: Date;
  seedPayloadJson?: string | null;
  novel?: {
    title?: string | null;
  } | null;
}

export function toAutoDirectorEventSnapshot(
  row: WorkflowTaskNotificationRow | null,
): AutoDirectorEventWorkflowSnapshot | null {
  if (!row || row.lane !== "auto_director") {
    return null;
  }
  return {
    id: row.id,
    novelId: row.novelId,
    status: row.status as TaskStatus,
    progress: row.progress ?? null,
    currentStage: row.currentStage,
    checkpointType: row.checkpointType as NovelWorkflowCheckpoint | null,
    checkpointSummary: row.checkpointSummary ?? null,
    currentItemLabel: row.currentItemLabel ?? null,
    pendingManualRecovery: row.pendingManualRecovery,
    updatedAt: row.updatedAt,
    seedPayloadJson: row.seedPayloadJson ?? null,
    novel: row.novel ?? null,
  };
}

export async function notifyAutoDirectorTaskTransition(
  notificationService: AutoDirectorFollowUpNotificationService,
  input: {
    before: WorkflowTaskNotificationRow | null;
    after: WorkflowTaskNotificationRow | null;
  },
): Promise<void> {
  await notificationService.handleTaskTransition({
    before: toAutoDirectorEventSnapshot(input.before),
    after: toAutoDirectorEventSnapshot(input.after),
  });
}

export async function updateWorkflowTaskWithNotifications<T extends WorkflowTaskNotificationRow>(
  notificationService: AutoDirectorFollowUpNotificationService,
  input: {
    before: T;
    data: NovelWorkflowTaskUpdateArgs["data"];
  },
): Promise<T> {
  const next = await withSqliteRetry(
    () => prisma.novelWorkflowTask.update({
      where: { id: input.before.id },
      data: input.data,
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
    }),
    { label: "novelWorkflowTask.update" },
  ) as unknown as T;
  await notifyAutoDirectorTaskTransition(notificationService, {
    before: input.before,
    after: next,
  });
  return next;
}
