import type {
  AgentApproval,
  AgentRun,
  AgentRunDetail,
  AgentRunMetrics,
  AgentStep,
  AgentToolErrorCode,
} from "@ai-novel/shared/types/agent";
import {
  AgentApprovalStatus,
  AgentRunStatus,
  AgentStepStatus,
  AgentStepType,
} from "@prisma/client";
import { prisma } from "../db/prisma";

function toAgentRun(row: {
  id: string;
  novelId: string | null;
  sessionId: string;
  goal: string;
  entryAgent: string;
  status: AgentRunStatus;
  currentStep: string | null;
  currentAgent: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  metadataJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AgentRun {
  return {
    id: row.id,
    novelId: row.novelId,
    sessionId: row.sessionId,
    goal: row.goal,
    entryAgent: row.entryAgent,
    status: row.status,
    currentStep: row.currentStep,
    currentAgent: row.currentAgent,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAgentStep(row: {
  id: string;
  runId: string;
  seq: number;
  agentName: string;
  stepType: AgentStepType;
  status: AgentStepStatus;
  parentStepId: string | null;
  idempotencyKey: string | null;
  inputJson: string | null;
  outputJson: string | null;
  error: string | null;
  errorCode: string | null;
  provider: string | null;
  model: string | null;
  tokenUsageJson: string | null;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: Date;
}): AgentStep {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    agentName: row.agentName,
    stepType: row.stepType,
    status: row.status,
    parentStepId: row.parentStepId,
    idempotencyKey: row.idempotencyKey,
    inputJson: row.inputJson,
    outputJson: row.outputJson,
    error: row.error,
    errorCode: row.errorCode as AgentToolErrorCode | null,
    provider: row.provider,
    model: row.model,
    tokenUsageJson: row.tokenUsageJson,
    costUsd: row.costUsd,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAgentApproval(row: {
  id: string;
  runId: string;
  stepId: string | null;
  approvalType: string;
  targetType: string;
  targetId: string;
  diffSummary: string;
  status: AgentApprovalStatus;
  expiresAt: Date | null;
  decisionNote: string | null;
  decider: string | null;
  decidedAt: Date | null;
  payloadJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AgentApproval {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    approvalType: row.approvalType,
    targetType: row.targetType,
    targetId: row.targetId,
    diffSummary: row.diffSummary,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    decider: row.decider,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    payloadJson: row.payloadJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class AgentTraceStore {
  async createRun(input: {
    sessionId: string;
    goal: string;
    novelId?: string;
    entryAgent: string;
    metadataJson?: string;
  }): Promise<AgentRun> {
    const row = await prisma.agentRun.create({
      data: {
        sessionId: input.sessionId,
        goal: input.goal,
        novelId: input.novelId ?? null,
        entryAgent: input.entryAgent,
        status: "queued",
        metadataJson: input.metadataJson ?? null,
      },
    });
    return toAgentRun(row);
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    const row = await prisma.agentRun.findUnique({
      where: { id: runId },
    });
    return row ? toAgentRun(row) : null;
  }

  async listRuns(filters: {
    status?: AgentRunStatus;
    novelId?: string;
    sessionId?: string;
    limit?: number;
  }): Promise<AgentRun[]> {
    const rows = await prisma.agentRun.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.novelId ? { novelId: filters.novelId } : {}),
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(filters.limit ?? 50, 100)),
    });
    return rows.map((row) => toAgentRun(row));
  }

  async getRunDetail(runId: string): Promise<AgentRunDetail | null> {
    const row = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        steps: {
          orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
        },
        approvals: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!row) {
      return null;
    }
    const steps = row.steps.map((step) => toAgentStep(step));
    const approvals = row.approvals.map((approval) => toAgentApproval(approval));
    return {
      run: toAgentRun(row),
      steps,
      approvals,
      metrics: this.computeMetrics(steps, approvals, row),
    };
  }

  async updateRun(runId: string, patch: {
    status?: AgentRunStatus;
    currentStep?: string | null;
    currentAgent?: string | null;
    error?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    metadataJson?: string | null;
  }): Promise<AgentRun> {
    const row = await prisma.agentRun.update({
      where: { id: runId },
      data: patch,
    });
    return toAgentRun(row);
  }

  async nextStepSeq(runId: string): Promise<number> {
    const row = await prisma.agentStep.findFirst({
      where: { runId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    return (row?.seq ?? 0) + 1;
  }

  async findToolResultByIdempotencyKey(runId: string, idempotencyKey: string): Promise<AgentStep | null> {
    if (!idempotencyKey.trim()) {
      return null;
    }
    const row = await prisma.agentStep.findFirst({
      where: {
        runId,
        idempotencyKey,
        stepType: "tool_result",
        status: { in: ["succeeded", "failed"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? toAgentStep(row) : null;
  }

  async addStep(input: {
    runId: string;
    seq?: number;
    agentName: string;
    stepType: AgentStepType;
    status?: AgentStepStatus;
    parentStepId?: string;
    idempotencyKey?: string;
    inputJson?: string;
    outputJson?: string;
    error?: string;
    errorCode?: AgentToolErrorCode;
    provider?: string;
    model?: string;
    tokenUsageJson?: string;
    costUsd?: number;
    durationMs?: number;
  }): Promise<AgentStep> {
    const seq = typeof input.seq === "number" ? input.seq : await this.nextStepSeq(input.runId);
    const row = await prisma.agentStep.create({
      data: {
        runId: input.runId,
        seq,
        agentName: input.agentName,
        stepType: input.stepType,
        status: input.status ?? "succeeded",
        parentStepId: input.parentStepId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        inputJson: input.inputJson ?? null,
        outputJson: input.outputJson ?? null,
        error: input.error ?? null,
        errorCode: input.errorCode ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        tokenUsageJson: input.tokenUsageJson ?? null,
        costUsd: input.costUsd ?? null,
        durationMs: input.durationMs ?? null,
      },
    });
    return toAgentStep(row);
  }

  async addApproval(input: {
    runId: string;
    stepId?: string;
    approvalType: string;
    targetType: string;
    targetId: string;
    diffSummary: string;
    expiresAt?: Date;
    payloadJson?: string;
  }): Promise<AgentApproval> {
    const row = await prisma.agentApproval.create({
      data: {
        runId: input.runId,
        stepId: input.stepId ?? null,
        approvalType: input.approvalType,
        targetType: input.targetType,
        targetId: input.targetId,
        diffSummary: input.diffSummary,
        expiresAt: input.expiresAt ?? null,
        payloadJson: input.payloadJson ?? null,
      },
    });
    return toAgentApproval(row);
  }

  async resolveApproval(input: {
    runId: string;
    approvalId: string;
    action: "approve" | "reject";
    note?: string;
    decider?: string;
  }): Promise<AgentApproval> {
    const current = await prisma.agentApproval.findFirst({
      where: {
        id: input.approvalId,
        runId: input.runId,
      },
    });
    if (!current) {
      throw new Error("Approval not found.");
    }
    if (current.status !== "pending") {
      throw new Error(`Approval already ${current.status}.`);
    }
    const now = new Date();
    const result = await prisma.agentApproval.updateMany({
      where: {
        id: input.approvalId,
        runId: input.runId,
        status: "pending",
      },
      data: {
        status: input.action === "approve" ? "approved" : "rejected",
        decisionNote: input.note ?? null,
        decider: input.decider ?? "user",
        decidedAt: now,
      },
    });
    if (result.count === 0) {
      throw new Error("Approval conflict: already processed.");
    }
    const row = await prisma.agentApproval.findUnique({
      where: { id: input.approvalId },
    });
    if (!row) {
      throw new Error("Approval not found after resolve.");
    }
    return toAgentApproval(row);
  }

  async expirePendingApprovals(runId: string, now = new Date()): Promise<number> {
    const result = await prisma.agentApproval.updateMany({
      where: {
        runId,
        status: "pending",
        expiresAt: {
          not: null,
          lte: now,
        },
      },
      data: {
        status: "expired",
        decisionNote: "Approval expired.",
        decidedAt: now,
      },
    });
    return result.count;
  }

  async findPendingApproval(runId: string, approvalId: string): Promise<AgentApproval | null> {
    const row = await prisma.agentApproval.findFirst({
      where: {
        runId,
        id: approvalId,
        status: "pending",
      },
    });
    return row ? toAgentApproval(row) : null;
  }

  async expireAllPendingApprovals(runId: string, note: string): Promise<number> {
    const now = new Date();
    const result = await prisma.agentApproval.updateMany({
      where: {
        runId,
        status: "pending",
      },
      data: {
        status: "expired",
        decisionNote: note,
        decidedAt: now,
      },
    });
    return result.count;
  }

  async listStepsAfter(runId: string, fromSeq: number): Promise<AgentStep[]> {
    const rows = await prisma.agentStep.findMany({
      where: {
        runId,
        seq: { gt: fromSeq },
      },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((item) => toAgentStep(item));
  }

  private computeMetrics(
    steps: AgentStep[],
    approvals: AgentApproval[],
    row: { startedAt: Date | null; finishedAt: Date | null },
  ): AgentRunMetrics {
    const stepCount = steps.length;
    const successCount = steps.filter((item) => item.status === "succeeded").length;
    const failureCount = steps.filter((item) => item.status === "failed").length;
    const approvalCount = approvals.length;
    const pendingApprovalCount = approvals.filter((item) => item.status === "pending").length;
    const totalDurationMs = row.startedAt && row.finishedAt
      ? Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime())
      : steps.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
    const avgStepDurationMs = stepCount > 0
      ? Math.round(steps.reduce((sum, item) => sum + (item.durationMs ?? 0), 0) / stepCount)
      : 0;
    const totalCostUsd = steps.reduce((sum, item) => sum + (item.costUsd ?? 0), 0);
    const toolFailureByCode = steps.reduce<Partial<Record<AgentToolErrorCode, number>>>((acc, item) => {
      if (item.status !== "failed" || !item.errorCode) {
        return acc;
      }
      const prev = acc[item.errorCode] ?? 0;
      acc[item.errorCode] = prev + 1;
      return acc;
    }, {});
    return {
      stepCount,
      successCount,
      failureCount,
      approvalCount,
      pendingApprovalCount,
      totalDurationMs,
      avgStepDurationMs,
      totalCostUsd,
      toolFailureByCode,
    };
  }
}
