import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import {
  DIRECTOR_AUTO_APPROVAL_POINTS,
  resolveDirectorAutoApprovalPointForCheckpoint,
  type DirectorAutoApprovalPointCode,
} from "@ai-novel/shared/types/autoDirectorApproval";
import { prisma } from "../../../db/prisma";
import { appendMilestone, parseSeedPayload } from "../../novel/workflow/novelWorkflow.shared";
import { AutoDirectorFollowUpNotificationService } from "./AutoDirectorFollowUpNotificationService";

export interface AutoDirectorAutoApprovalRecordRow {
  id: string;
  taskId: string;
  novelId: string;
  approvalPointCode: string;
  approvalPointLabel: string;
  checkpointType: string;
  checkpointSummary: string | null;
  summary: string;
  stage: string | null;
  scopeLabel: string | null;
  eventId: string;
  createdAt: Date;
}

export interface RecordAutoDirectorAutoApprovalInput {
  taskId: string;
  novelId: string;
  novelTitle?: string | null;
  checkpointType: NovelWorkflowCheckpoint;
  checkpointSummary?: string | null;
  stage?: string | null;
  scopeLabel?: string | null;
  occurredAt?: Date;
}

interface AutoApprovalTaskSeedPayload {
  autoExecution?: {
    scopeLabel?: unknown;
  } | null;
}

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021";
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

function buildEventId(input: {
  taskId: string;
  checkpointType: NovelWorkflowCheckpoint;
  approvalPointCode: DirectorAutoApprovalPointCode;
  occurredAt: Date;
}): string {
  return [
    input.taskId,
    "auto_director.auto_approved",
    input.checkpointType,
    input.approvalPointCode,
    input.occurredAt.toISOString(),
  ].join(":");
}

function buildSummary(input: {
  checkpointType: NovelWorkflowCheckpoint;
  approvalPointLabel: string;
  checkpointSummary?: string | null;
}): string {
  const checkpointSummary = input.checkpointSummary?.trim();
  if (input.checkpointType === "replan_required") {
    if (checkpointSummary) {
      return `AI 已记录重规划提醒，并继续推进。${checkpointSummary}`;
    }
    return "AI 已记录重规划提醒，并继续推进。";
  }
  if (checkpointSummary) {
    return `AI 已自动通过「${input.approvalPointLabel}」，并继续推进。${checkpointSummary}`;
  }
  return `AI 已自动通过「${input.approvalPointLabel}」，并继续推进。`;
}

export function getAutoApprovalPointLabel(code: DirectorAutoApprovalPointCode): string {
  return DIRECTOR_AUTO_APPROVAL_POINTS.find((point) => point.code === code)?.label ?? code;
}

export async function recordAutoDirectorAutoApproval(
  input: RecordAutoDirectorAutoApprovalInput,
): Promise<AutoDirectorAutoApprovalRecordRow | null> {
  const approvalPointCode = resolveDirectorAutoApprovalPointForCheckpoint(input.checkpointType);
  if (!approvalPointCode) {
    return null;
  }
  const occurredAt = input.occurredAt ?? new Date();
  const approvalPointLabel = getAutoApprovalPointLabel(approvalPointCode);
  const summary = buildSummary({
    checkpointType: input.checkpointType,
    approvalPointLabel,
    checkpointSummary: input.checkpointSummary,
  });
  const eventId = buildEventId({
    taskId: input.taskId,
    checkpointType: input.checkpointType,
    approvalPointCode,
    occurredAt,
  });

  try {
    await appendAutoApprovalMilestone({
      taskId: input.taskId,
      checkpointType: input.checkpointType,
      summary,
    });
    const record = await prisma.autoDirectorAutoApprovalRecord.upsert({
      where: { eventId },
      update: {},
      create: {
        taskId: input.taskId,
        novelId: input.novelId,
        approvalPointCode,
        approvalPointLabel,
        checkpointType: input.checkpointType,
        checkpointSummary: input.checkpointSummary?.trim() || null,
        summary,
        stage: input.stage?.trim() || null,
        scopeLabel: input.scopeLabel?.trim() || null,
        eventId,
        createdAt: occurredAt,
      },
    });
    await pruneOlderAutoDirectorAutoApprovalRecords(input.novelId);

    await new AutoDirectorFollowUpNotificationService().notifyAutoApproved({
      taskId: input.taskId,
      novelId: input.novelId,
      novelTitle: input.novelTitle?.trim() || input.novelId,
      checkpointType: input.checkpointType,
      checkpointSummary: input.checkpointSummary ?? null,
      approvalPointCode,
      approvalPointLabel,
      stage: input.stage ?? null,
      summary,
      occurredAt,
    });

    return record;
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return null;
    }
    throw error;
  }
}

async function appendAutoApprovalMilestone(input: {
  taskId: string;
  checkpointType: NovelWorkflowCheckpoint;
  summary: string;
}): Promise<void> {
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      milestonesJson: true,
    },
  });
  if (!task) {
    return;
  }
  await prisma.novelWorkflowTask.update({
    where: { id: input.taskId },
    data: {
      milestonesJson: appendMilestone(task.milestonesJson, input.checkpointType, input.summary),
    },
  });
}

export async function recordAutoDirectorAutoApprovalFromTask(input: {
  taskId: string;
  checkpointType: NovelWorkflowCheckpoint;
  checkpointSummary?: string | null;
  occurredAt?: Date;
}): Promise<AutoDirectorAutoApprovalRecordRow | null> {
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: input.taskId },
    include: {
      novel: {
        select: {
          title: true,
        },
      },
    },
  });
  if (!task?.novelId) {
    return null;
  }
  const seedPayload = parseSeedPayload<AutoApprovalTaskSeedPayload>(task.seedPayloadJson);
  const scopeLabel = seedPayload?.autoExecution?.scopeLabel;
  return recordAutoDirectorAutoApproval({
    taskId: input.taskId,
    novelId: task.novelId,
    novelTitle: task.novel?.title ?? null,
    checkpointType: input.checkpointType,
    checkpointSummary: input.checkpointSummary ?? task.checkpointSummary,
    stage: task.currentStage,
    scopeLabel: typeof scopeLabel === "string" ? scopeLabel : null,
    occurredAt: input.occurredAt,
  });
}

async function pruneOlderAutoDirectorAutoApprovalRecords(novelId: string): Promise<void> {
  const staleRows = await prisma.autoDirectorAutoApprovalRecord.findMany({
    where: { novelId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 10,
    select: { id: true },
  });
  if (staleRows.length === 0) {
    return;
  }
  await prisma.autoDirectorAutoApprovalRecord.deleteMany({
    where: {
      id: {
        in: staleRows.map((row) => row.id),
      },
    },
  });
}

export async function loadRecentAutoDirectorAutoApprovalRecords(
  novelIds: string[],
): Promise<AutoDirectorAutoApprovalRecordRow[]> {
  const uniqueNovelIds = Array.from(new Set(novelIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueNovelIds.length === 0) {
    return [];
  }
  try {
    const rowsByNovel = await Promise.all(
      uniqueNovelIds.map((novelId) => prisma.autoDirectorAutoApprovalRecord.findMany({
        where: { novelId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
      })),
    );
    return rowsByNovel
      .flat()
      .sort((left, right) => {
        const createdAtDiff = right.createdAt.getTime() - left.createdAt.getTime();
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }
        return right.id.localeCompare(left.id);
      });
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}
