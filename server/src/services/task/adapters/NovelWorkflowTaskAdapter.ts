import type {
  NovelWorkflowCheckpoint,
} from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import type { ResourceRef } from "@ai-novel/shared/types/agent";
import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { NovelDirectorService } from "../../novel/director/NovelDirectorService";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../novel/director/novelDirectorHelpers";
import { isAutoDirectorRecoveryInProgress } from "../../novel/workflow/novelWorkflowRecoveryHeuristics";
import {
  buildNovelCreateResumeTarget,
  parseMilestones,
  parseSeedPayload,
  parseResumeTarget,
  resumeTargetToRoute,
} from "../../novel/workflow/novelWorkflow.shared";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
} from "../taskSupport";
import { toTaskTokenUsageSummary } from "../taskTokenUsageSummary";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
import { buildNovelWorkflowDetailSteps } from "../novelWorkflowDetailSteps";
import { buildWorkflowExplainability } from "../novelWorkflowExplainability";
import { buildNovelWorkflowNextActionLabel } from "../novelWorkflowTaskSummary";

function buildOwnerLabel(row: {
  novel?: { title: string } | null;
  title: string;
}): string {
  return row.novel?.title?.trim() || row.title.trim() || "小说主任务";
}

function parseLinkedPipelineJobId(seedPayloadJson?: string | null): string | null {
  if (!seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(seedPayloadJson) as {
      autoExecution?: {
        pipelineJobId?: unknown;
      };
    };
    return typeof parsed.autoExecution?.pipelineJobId === "string"
      && parsed.autoExecution.pipelineJobId.trim()
      ? parsed.autoExecution.pipelineJobId.trim()
      : null;
  } catch {
    return null;
  }
}

function hasCandidateSelectionPhase(seedPayloadJson?: string | null): boolean {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
  if (!seedPayload) {
    return false;
  }
  if (seedPayload.candidateStage) {
    return true;
  }
  const phase = seedPayload.directorSession && typeof seedPayload.directorSession === "object"
    ? (seedPayload.directorSession as { phase?: unknown }).phase
    : null;
  return phase === "candidate_selection";
}

export function normalizeWorkflowResumeTargetForCandidateSelection(input: {
  id: string;
  checkpointType: string | null;
  currentItemKey: string | null;
  resumeTargetJson: string | null;
  seedPayloadJson?: string | null;
}) {
  const parsed = parseResumeTarget(input.resumeTargetJson);
  const isCandidateSelectionTask = input.checkpointType === "candidate_selection_required"
    || input.currentItemKey === "auto_director"
    || input.currentItemKey?.startsWith("candidate_") === true
    || hasCandidateSelectionPhase(input.seedPayloadJson);
  if (!isCandidateSelectionTask) {
    return parsed;
  }
  return buildNovelCreateResumeTarget(input.id, "director");
}

function mapSummary(row: {
  id: string;
  title: string;
  lane: string;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  resumeTargetJson: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  heartbeatAt: Date | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCallCount: number;
  lastTokenRecordedAt: Date | null;
  novelId: string | null;
  novel?: { title: string } | null;
  seedPayloadJson?: string | null;
}): UnifiedTaskSummary {
  const status = row.status as TaskStatus;
  const isRecoveryInProgress = isAutoDirectorRecoveryInProgress({
    status,
    lastError: row.lastError,
  });
  const lastError = isRecoveryInProgress ? null : row.lastError;
  const resumeTarget = normalizeWorkflowResumeTargetForCandidateSelection({
    id: row.id,
    checkpointType: row.checkpointType,
    currentItemKey: row.currentItemKey,
    resumeTargetJson: row.resumeTargetJson,
    seedPayloadJson: row.seedPayloadJson,
  });
  const sourceRoute = resumeTargetToRoute(resumeTarget);
  const ownerLabel = buildOwnerLabel(row);
  const checkpointType = row.checkpointType as NovelWorkflowCheckpoint | null;
  const linkedPipelineJobId = parseLinkedPipelineJobId(row.seedPayloadJson);
  const targetResources: ResourceRef[] = [{
    type: "task",
    id: row.id,
    label: row.title,
    route: sourceRoute,
  }];
  if (linkedPipelineJobId && row.novelId) {
    targetResources.push({
      type: "generation_job" as const,
      id: linkedPipelineJobId,
      label: "章节流水线",
      route: `/novels/${row.novelId}/edit`,
    });
  }
  const explainability = buildWorkflowExplainability({
    status,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    checkpointType,
    lastError: row.lastError,
  });
  return {
    id: row.id,
    kind: "novel_workflow",
    title: row.title,
    status,
    progress: row.progress,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    currentItemLabel: row.currentItemLabel,
    displayStatus: explainability.displayStatus,
    blockingReason: explainability.blockingReason,
    resumeAction: explainability.resumeAction,
    lastHealthyStage: explainability.lastHealthyStage,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    ownerId: row.novelId ?? row.id,
    ownerLabel,
    sourceRoute,
    checkpointType,
    checkpointSummary: row.checkpointSummary,
    resumeTarget,
    nextActionLabel: buildNovelWorkflowNextActionLabel(status, checkpointType),
    failureCode: status === "failed" ? "NOVEL_WORKFLOW_FAILED" : null,
    failureSummary: status === "failed"
      ? normalizeFailureSummary(lastError, "小说主流程中断，但没有记录明确错误。")
      : null,
    recoveryHint: buildTaskRecoveryHint("novel_workflow", status),
    tokenUsage: toTaskTokenUsageSummary({
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      llmCallCount: row.llmCallCount,
      lastTokenRecordedAt: row.lastTokenRecordedAt,
    }),
    sourceResource: row.novelId
      ? {
        type: "novel",
        id: row.novelId,
        label: ownerLabel,
        route: sourceRoute,
      }
      : {
        type: "task",
        id: row.id,
        label: row.title,
        route: sourceRoute,
      },
    targetResources,
  };
}

export class NovelWorkflowTaskAdapter {
  private readonly workflowService = new NovelWorkflowService();
  private readonly novelDirectorService = new NovelDirectorService();

  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const archivedIds = await getArchivedTaskIds("novel_workflow");
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        ...(archivedIds.length
          ? {
            id: {
              notIn: archivedIds,
            },
          }
          : {}),
        lane: "auto_director",
        ...(input.status ? { status: input.status } : {}),
        ...(input.keyword
          ? {
            OR: [
              { title: { contains: input.keyword } },
              { id: { contains: input.keyword } },
              { novel: { title: { contains: input.keyword } } },
            ],
          }
          : {}),
      },
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });
    const healed = await Promise.all(
      rows.map((row) => this.workflowService.healAutoDirectorTaskState(row.id, row)),
    );
    const normalizedRows = healed.some(Boolean)
      ? await prisma.novelWorkflowTask.findMany({
        where: {
          ...(archivedIds.length
            ? {
              id: {
                notIn: archivedIds,
              },
            }
            : {}),
          lane: "auto_director",
          ...(input.status ? { status: input.status } : {}),
          ...(input.keyword
            ? {
              OR: [
                { title: { contains: input.keyword } },
                { id: { contains: input.keyword } },
                { novel: { title: { contains: input.keyword } } },
              ],
            }
            : {}),
        },
        include: {
          novel: {
            select: {
              title: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.take,
      })
      : rows;

    const visibleRows = normalizedRows.filter((row) => {
      if (row.lane !== "manual_create" || !row.novelId) {
        return true;
      }
      return !normalizedRows.some((candidate) =>
        candidate.id !== row.id
        && candidate.novelId === row.novelId
        && candidate.lane === "auto_director"
        && ["queued", "running", "waiting_approval", "succeeded"].includes(candidate.status)
        && candidate.updatedAt >= row.updatedAt);
    });

    return visibleRows.map((row) => mapSummary(row));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("novel_workflow", id)) {
      return null;
    }
    await this.workflowService.healAutoDirectorTaskState(id);

    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id },
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }

    const summary = mapSummary(row);
    const resumeTarget = normalizeWorkflowResumeTargetForCandidateSelection({
      id: row.id,
      checkpointType: row.checkpointType,
      currentItemKey: row.currentItemKey,
      resumeTargetJson: row.resumeTargetJson,
      seedPayloadJson: row.seedPayloadJson,
    });
    const milestones = parseMilestones(row.milestonesJson);
    let seedPayload: Record<string, unknown> | null = null;
    if (row.seedPayloadJson?.trim()) {
      try {
        seedPayload = JSON.parse(row.seedPayloadJson) as Record<string, unknown>;
      } catch {
        seedPayload = {
          rawSeedPayload: row.seedPayloadJson,
        };
      }
    }
    const workflowSeedPayload = seedPayload as DirectorWorkflowSeedPayload | null;
    const directorSession = workflowSeedPayload && typeof workflowSeedPayload.directorSession === "object"
      ? workflowSeedPayload.directorSession
      : null;
    const boundLlm = getDirectorLlmOptionsFromSeedPayload(workflowSeedPayload);

    return {
      ...summary,
      provider: boundLlm?.provider ?? null,
      model: boundLlm?.model ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.attemptCount}/${row.maxAttempts}`,
      meta: {
        lane: row.lane,
        checkpointType: row.checkpointType,
        checkpointSummary: row.checkpointSummary,
        resumeTarget,
        directorSession,
        llm: boundLlm
          ? {
            provider: boundLlm.provider ?? null,
            model: boundLlm.model ?? null,
            temperature: boundLlm.temperature ?? null,
          }
          : null,
        seedPayload,
        milestones,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      },
      steps: buildNovelWorkflowDetailSteps({
        lane: row.lane,
        novelId: row.novelId,
        status: summary.status,
        currentItemKey: row.currentItemKey,
        checkpointType: row.checkpointType as NovelWorkflowCheckpoint | null,
        directorSessionPhase: directorSession && typeof directorSession === "object"
          ? (directorSession as { phase?: unknown }).phase
          : null,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
      }),
      failureDetails: row.lastError,
    };
  }

  async retry(input: {
    id: string;
    llmOverride?: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">;
    resume?: boolean;
  }): Promise<UnifiedTaskDetail> {
    const { id, llmOverride, resume } = input;
    if (await isTaskArchived("novel_workflow", id)) {
      throw new AppError("Task not found.", 404);
    }
    const row = await this.workflowService.getTaskById(id);
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (row.lane === "auto_director" && llmOverride) {
      await this.workflowService.applyAutoDirectorLlmOverride(id, llmOverride);
    }
    await this.workflowService.retryTask(id);
    if (row.lane === "auto_director" && resume) {
      await this.novelDirectorService.continueTask(id);
    }
    const detail = await this.detail(id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("novel_workflow", id)) {
      throw new AppError("Task not found.", 404);
    }
    await this.workflowService.cancelTask(id);
    const detail = await this.detail(id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("novel_workflow", id)) {
      return null;
    }

    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!row) {
      throw new AppError("Task not found.", 404);
    }
    if (!isArchivableTaskStatus(row.status as TaskStatus)) {
      throw new AppError("Only completed, failed, or cancelled tasks can be archived.", 400);
    }
    await recordTaskArchive("novel_workflow", id);
    return null;
  }
}
