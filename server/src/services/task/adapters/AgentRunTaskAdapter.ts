import type { AgentRunStatus } from "@ai-novel/shared/types/agent";
import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskStep, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { agentRuntime } from "../../../agents";
import { AppError } from "../../../middleware/errorHandler";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
} from "../taskSupport";
import { buildAgentRunTaskCenterVisibilityWhere } from "../taskVisibility";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";

export class AgentRunTaskAdapter {
  toSummary(item: {
    id: string;
    novelId: string | null;
    chapterId?: string | null;
    goal: string;
    status: AgentRunStatus;
    currentStep: string | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }, stepCount = 0): UnifiedTaskSummary {
    const progress = item.status === "succeeded"
      ? 1
      : item.status === "failed" || item.status === "cancelled"
        ? 1
        : item.status === "waiting_approval"
          ? 0.75
          : item.status === "running"
            ? 0.5
            : 0.1;
    return {
      id: item.id,
      kind: "agent_run",
      title: item.goal.slice(0, 80) || "Agent run",
      status: item.status as TaskStatus,
      progress,
      currentStage: item.currentStep,
      currentItemLabel: `steps:${stepCount}`,
      attemptCount: 0,
      maxAttempts: 0,
      lastError: item.error,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      heartbeatAt: item.status === "running" || item.status === "waiting_approval" ? item.updatedAt.toISOString() : null,
      ownerId: item.novelId ?? item.id,
      ownerLabel: item.novelId ? `Novel ${item.novelId}` : "Global chat",
      sourceRoute: `/creative-hub?runId=${item.id}${item.novelId ? `&novelId=${item.novelId}` : ""}`,
      failureCode: item.status === "failed" ? "AGENT_RUN_FAILED" : null,
      failureSummary: item.status === "failed"
        ? normalizeFailureSummary(item.error, "运行失败，但没有记录明确错误。")
        : item.status === "waiting_approval"
          ? "当前运行在等待审批。"
          : item.error,
      recoveryHint: buildTaskRecoveryHint("agent_run", item.status as TaskStatus),
      sourceResource: item.novelId
        ? {
          type: "novel",
          id: item.novelId,
          label: `小说 ${item.novelId}`,
          route: `/novels/${item.novelId}/edit`,
        }
        : {
          type: "agent_run",
          id: item.id,
          label: "全局运行",
          route: `/creative-hub?runId=${item.id}`,
        },
      targetResources: item.chapterId
        ? [{
          type: "chapter",
          id: item.chapterId,
          label: item.currentStep ?? "章节目标",
          route: item.novelId ? `/novels/${item.novelId}/edit` : `/creative-hub?runId=${item.id}`,
        }]
        : [],
    };
  }

  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const archivedIds = await getArchivedTaskIds("agent_run");
    const rows = await prisma.agentRun.findMany({
      where: {
        ...(archivedIds.length
          ? {
            id: {
              notIn: archivedIds,
            },
          }
          : {}),
        ...(input.status ? { status: input.status as AgentRunStatus } : {}),
        ...(input.keyword
          ? {
            OR: [
              { goal: { contains: input.keyword } },
              { id: { contains: input.keyword } },
            ],
          }
          : {}),
        ...buildAgentRunTaskCenterVisibilityWhere(),
      },
      include: {
        steps: {
          select: { id: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });
    return rows.map((item) => this.toSummary(item, item.steps.length));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("agent_run", id)) {
      return null;
    }

    const detail = await agentRuntime.getRunDetail(id);
    if (!detail) {
      return null;
    }
    const summary = this.toSummary({
      id: detail.run.id,
      novelId: detail.run.novelId ?? null,
      chapterId: detail.run.chapterId ?? null,
      goal: detail.run.goal,
      status: detail.run.status,
      currentStep: detail.run.currentStep ?? null,
      error: detail.run.error ?? null,
      createdAt: new Date(detail.run.createdAt),
      updatedAt: new Date(detail.run.updatedAt),
    }, detail.steps.length);

    const steps: UnifiedTaskStep[] = detail.steps.map((step) => ({
      key: step.id,
      label: `${step.agentName}.${step.stepType}`,
      status:
        step.status === "pending"
          ? "idle"
          : step.status === "running"
            ? "running"
            : step.status === "failed"
              ? "failed"
              : step.status === "cancelled"
                ? "cancelled"
                : "succeeded",
      startedAt: step.createdAt,
      updatedAt: step.createdAt,
    }));

    return {
      ...summary,
      provider: detail.steps.find((step) => step.provider)?.provider ?? null,
      model: detail.steps.find((step) => step.model)?.model ?? null,
      startedAt: detail.run.startedAt ?? null,
      finishedAt: detail.run.finishedAt ?? null,
      retryCountLabel: "0/0",
      meta: {
        runId: detail.run.id,
        novelId: detail.run.novelId,
        sessionId: detail.run.sessionId,
        approvals: detail.approvals,
      },
      steps,
      failureDetails: detail.diagnostics?.failureDetails
        ?? detail.steps.filter((step) => step.status === "failed").at(-1)?.error
        ?? detail.run.error
        ?? null,
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("agent_run", id)) {
      throw new AppError("Task not found.", 404);
    }

    const result = await agentRuntime.retryRun(id);
    const detail = await this.detail(result.run.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("agent_run", id)) {
      throw new AppError("Task not found.", 404);
    }

    await agentRuntime.cancelRun(id);
    const detail = await this.detail(id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("agent_run", id)) {
      return null;
    }

    const run = await prisma.agentRun.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });
    if (!run) {
      throw new AppError("Task not found.", 404);
    }
    if (!isArchivableTaskStatus(run.status as TaskStatus)) {
      throw new AppError("Only completed, failed, or cancelled tasks can be archived.", 400);
    }

    await recordTaskArchive("agent_run", id);
    return null;
  }
}
