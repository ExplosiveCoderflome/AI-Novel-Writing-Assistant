import type { AgentRunStatus } from "@ai-novel/shared/types/agent";
import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskStep, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { agentRuntime } from "../../../agents";
import { AppError } from "../../../middleware/errorHandler";

export class AgentRunTaskAdapter {
  toSummary(item: {
    id: string;
    novelId: string | null;
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
      sourceRoute: `/chat?runId=${item.id}${item.novelId ? `&novelId=${item.novelId}` : ""}`,
    };
  }

  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const rows = await prisma.agentRun.findMany({
      where: {
        ...(input.status ? { status: input.status as AgentRunStatus } : {}),
        ...(input.keyword
          ? {
            OR: [
              { goal: { contains: input.keyword } },
              { id: { contains: input.keyword } },
            ],
          }
          : {}),
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
    const detail = await agentRuntime.getRunDetail(id);
    if (!detail) {
      return null;
    }
    const summary = this.toSummary({
      id: detail.run.id,
      novelId: detail.run.novelId ?? null,
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
      provider: null,
      model: null,
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
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    const result = await agentRuntime.retryRun(id);
    const detail = await this.detail(result.run.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    await agentRuntime.cancelRun(id);
    const detail = await this.detail(id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }
}
