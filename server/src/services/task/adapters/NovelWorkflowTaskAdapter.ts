import type {
  NovelWorkflowCheckpoint,
} from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { NovelDirectorService } from "../../novel/director/NovelDirectorService";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import {
  getDirectorInputFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "../../novel/director/novelDirectorHelpers";
import {
  parseMilestones,
  parseResumeTarget,
  resumeTargetToRoute,
} from "../../novel/workflow/novelWorkflow.shared";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
} from "../taskSupport";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
import { buildNovelWorkflowDetailSteps } from "../novelWorkflowDetailSteps";

function buildNextActionLabel(status: TaskStatus, checkpointType: NovelWorkflowCheckpoint | null): string | null {
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

function buildOwnerLabel(row: {
  novel?: { title: string } | null;
  title: string;
}): string {
  return row.novel?.title?.trim() || row.title.trim() || "小说主任务";
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
  novelId: string | null;
  novel?: { title: string } | null;
}): UnifiedTaskSummary {
  const resumeTarget = parseResumeTarget(row.resumeTargetJson);
  const sourceRoute = resumeTargetToRoute(resumeTarget);
  const ownerLabel = buildOwnerLabel(row);
  const checkpointType = row.checkpointType as NovelWorkflowCheckpoint | null;
  return {
    id: row.id,
    kind: "novel_workflow",
    title: row.title,
    status: row.status as TaskStatus,
    progress: row.progress,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    currentItemLabel: row.currentItemLabel,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    ownerId: row.novelId ?? row.id,
    ownerLabel,
    sourceRoute,
    checkpointType,
    checkpointSummary: row.checkpointSummary,
    resumeTarget,
    nextActionLabel: buildNextActionLabel(row.status as TaskStatus, checkpointType),
    failureCode: row.status === "failed" ? "NOVEL_WORKFLOW_FAILED" : null,
    failureSummary: row.status === "failed"
      ? normalizeFailureSummary(row.lastError, "小说主流程中断，但没有记录明确错误。")
      : row.lastError,
    recoveryHint: buildTaskRecoveryHint("novel_workflow", row.status as TaskStatus),
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
    targetResources: [{
      type: "task",
      id: row.id,
      label: row.title,
      route: sourceRoute,
    }],
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

    return rows.map((row) => mapSummary(row));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("novel_workflow", id)) {
      return null;
    }

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
    const resumeTarget = parseResumeTarget(row.resumeTargetJson);
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
    const directorInput = getDirectorInputFromSeedPayload(workflowSeedPayload);

    return {
      ...summary,
      provider: directorInput?.provider ?? null,
      model: directorInput?.model ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.attemptCount}/${row.maxAttempts}`,
      meta: {
        lane: row.lane,
        checkpointType: row.checkpointType,
        checkpointSummary: row.checkpointSummary,
        resumeTarget,
        directorSession,
        llm: directorInput
          ? {
            provider: directorInput.provider ?? null,
            model: directorInput.model ?? null,
            temperature: directorInput.temperature ?? null,
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
