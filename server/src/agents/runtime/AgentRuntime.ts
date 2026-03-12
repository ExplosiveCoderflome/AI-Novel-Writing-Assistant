import type { AgentRunDetail, ReplayRequest } from "@ai-novel/shared/types/agent";
import { createStructuredPlan } from "../orchestrator";
import { AgentTraceStore } from "../traceStore";
import type {
  AgentApprovalDecisionInput,
  AgentRuntimeCallbacks,
  AgentRuntimeResult,
  AgentRunStartInput,
  PlannedAction,
  StructuredIntent,
  ToolCall,
} from "../types";
import { RunExecutionService } from "./RunExecutionService";
import { normalizeAgent, parseRunMetadata, safeJson, TERMINAL_STATUSES, isRecord, asObject, type RunMetadata } from "./runtimeHelpers";

export class AgentRuntime {
  private readonly store = new AgentTraceStore();

  private readonly executor = new RunExecutionService(this.store);

  private readonly runLocks = new Map<string, Promise<void>>();

  private async reconcileWaitingApprovalRun(runId: string): Promise<void> {
    const run = await this.store.getRun(runId);
    if (!run || run.status !== "waiting_approval") {
      return;
    }

    await this.store.expirePendingApprovals(runId);
    const detail = await this.store.getRunDetail(runId);
    if (!detail || detail.run.status !== "waiting_approval") {
      return;
    }

    const pendingApprovals = detail.approvals.filter((item) => item.status === "pending");
    if (pendingApprovals.length > 0) {
      return;
    }

    const latestApproval = detail.approvals[detail.approvals.length - 1];
    const errorMessage = latestApproval?.status === "expired"
      ? "审批已过期，运行已停止。"
      : "审批状态异常，运行已停止。";

    await this.store.updateRun(runId, {
      status: "failed",
      currentStep: latestApproval?.status === "expired" ? "approval_expired" : "approval_inconsistent",
      currentAgent: detail.run.currentAgent ?? "Planner",
      error: errorMessage,
      finishedAt: new Date(),
    });
  }

  private markApprovedContinuation(actions: PlannedAction[]): PlannedAction[] {
    return actions.map((action, index) => {
      if (index !== 0 || action.calls.length === 0) {
        return action;
      }
      const [firstCall, ...restCalls] = action.calls;
      return {
        ...action,
        calls: [
          {
            ...firstCall,
            approvalSatisfied: true,
          },
          ...restCalls,
        ],
      };
    });
  }

  private async withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.runLocks.get(runId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.runLocks.set(runId, chained);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.runLocks.get(runId) === chained) {
        this.runLocks.delete(runId);
      }
    }
  }

  private async failRun(
    runId: string,
    message: string,
    agentName: string,
    callbacks?: AgentRuntimeCallbacks,
  ): Promise<void> {
    await this.store.updateRun(runId, {
      status: "failed",
      currentStep: "failed",
      currentAgent: agentName,
      error: message,
      finishedAt: new Date(),
    });
    callbacks?.onRunStatus?.({
      runId,
      status: "failed",
      message,
    });
  }

  private async createRunFromInput(input: AgentRunStartInput, metadataPatch?: Partial<RunMetadata>) {
    const metadata: RunMetadata = {
      contextMode: input.contextMode,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      messages: input.messages?.slice(-30),
      ...metadataPatch,
    };
    return this.store.createRun({
      sessionId: input.sessionId,
      goal: input.goal,
      novelId: input.novelId,
      entryAgent: "Planner",
      metadataJson: safeJson(metadata),
    });
  }

  private async updateRunMetadata(runId: string, input: AgentRunStartInput, plannerIntent?: StructuredIntent): Promise<void> {
    const metadata: RunMetadata = {
      contextMode: input.contextMode,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      messages: input.messages?.slice(-30),
      plannerIntent,
    };
    await this.store.updateRun(runId, {
      metadataJson: safeJson(metadata),
    });
  }

  async start(input: AgentRunStartInput, callbacks?: AgentRuntimeCallbacks): Promise<AgentRuntimeResult> {
    if (input.contextMode === "novel" && !input.novelId) {
      throw new Error("novel mode requires novelId.");
    }

    const activeRuns = await this.store.listRuns({
      sessionId: input.sessionId,
      novelId: input.novelId,
      limit: 10,
    });
    const blockingRun = activeRuns.find((item) => item.status === "running" || item.status === "waiting_approval");
    if (blockingRun && blockingRun.id !== input.runId) {
      const message = blockingRun.status === "waiting_approval"
        ? "当前已有运行在等待审批，请先处理审批。"
        : "当前已有运行仍在执行中。";
      return this.executor.getRunDetailOrThrow(blockingRun.id, message);
    }

    if (input.runId) {
      await this.reconcileWaitingApprovalRun(input.runId);
      const existing = await this.store.getRun(input.runId);
      if (existing && !TERMINAL_STATUSES.has(existing.status)) {
        if (existing.status === "waiting_approval") {
          return this.executor.getRunDetailOrThrow(existing.id, "当前运行正等待审批，请先处理审批。");
        }
        return this.executor.getRunDetailOrThrow(existing.id, "当前运行仍在执行中。");
      }
    }

    const run = await this.createRunFromInput(input);
    callbacks?.onRunStatus?.({
      runId: run.id,
      status: "queued",
      message: "已创建运行",
    });

    return this.withRunLock(run.id, async () => {
      await this.store.updateRun(run.id, {
        status: "running",
        startedAt: new Date(),
        currentStep: "planning",
        currentAgent: "Planner",
      });
      callbacks?.onRunStatus?.({
        runId: run.id,
        status: "running",
        message: "开始规划",
      });

      const planningStep = await this.store.addStep({
        runId: run.id,
        agentName: "Planner",
        stepType: "planning",
        status: "running",
        inputJson: safeJson({
          goal: input.goal,
          contextMode: input.contextMode,
          novelId: input.novelId,
        }),
        provider: input.provider,
        model: input.model,
      });

      const planner = await createStructuredPlan({
        goal: input.goal,
        messages: input.messages ?? [],
        contextMode: input.contextMode,
        novelId: input.novelId,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        currentRunStatus: "running",
        currentStep: "planning",
      });
      await this.updateRunMetadata(run.id, input, planner.structuredIntent);

      await this.store.addStep({
        runId: run.id,
        agentName: "Planner",
        parentStepId: planningStep.id,
        stepType: "planning",
        status: "succeeded",
        inputJson: safeJson({
          source: planner.source,
          warnings: planner.validationWarnings,
          structuredIntent: planner.structuredIntent,
          plan: planner.plan,
        }),
        provider: input.provider,
        model: input.model,
      });
      if (planner.validationWarnings.length > 0) {
        await this.store.addStep({
          runId: run.id,
          agentName: "Planner",
          stepType: "reasoning",
          status: "succeeded",
          inputJson: safeJson({
            warnings: planner.validationWarnings,
          }),
          provider: input.provider,
          model: input.model,
        });
      }

      return this.executor.runActionPlan(
        run.id,
        input.goal,
        planner.actions,
        {
          contextMode: input.contextMode,
          novelId: input.novelId,
          provider: input.provider,
          model: input.model,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        },
        planner.structuredIntent,
        this.failRun.bind(this),
        callbacks,
      );
    });
  }

  async resolveApproval(input: AgentApprovalDecisionInput, callbacks?: AgentRuntimeCallbacks): Promise<AgentRuntimeResult> {
    return this.withRunLock(input.runId, async () => {
      await this.reconcileWaitingApprovalRun(input.runId);
      const detail = await this.store.getRunDetail(input.runId);
      if (!detail) {
        throw new Error("Run not found.");
      }
      if (detail.run.status === "cancelled") {
        throw new Error("Run is cancelled.");
      }
      await this.store.expirePendingApprovals(input.runId);
      const pending = await this.store.findPendingApproval(input.runId, input.approvalId);
      if (!pending) {
        const latest = await this.store.getRunDetail(input.runId);
        const target = latest?.approvals.find((item) => item.id === input.approvalId);
        throw new Error(target ? `Approval already ${target.status}.` : "Approval not found.");
      }

      const approval = await this.store.resolveApproval({
        runId: input.runId,
        approvalId: input.approvalId,
        action: input.action,
        note: input.note,
      });
      callbacks?.onApprovalResolved?.({
        runId: input.runId,
        approvalId: input.approvalId,
        action: input.action === "approve" ? "approved" : "rejected",
        note: input.note,
      });

      const payload = this.executor.parseApprovalPayload(approval.payloadJson);
      if (!payload) {
        await this.failRun(input.runId, "审批续跑数据损坏，无法继续执行。", "Planner", callbacks);
        return this.executor.getRunDetailOrThrow(input.runId, "审批续跑数据损坏，运行已终止。");
      }

      if (input.action === "reject") {
        const alternatives = this.executor.buildAlternativePathFromRejectedApproval(payload, input.note);
        if (alternatives.length === 0) {
          await this.failRun(
            input.runId,
            input.note?.trim() || "用户拒绝高影响写入，且没有可执行替代路径。",
            "Planner",
            callbacks,
          );
          return this.executor.getRunDetailOrThrow(input.runId, "已拒绝该高影响写入，运行已停止。");
        }
        await this.store.updateRun(input.runId, {
          status: "running",
          currentStep: "executing",
          currentAgent: alternatives[0].agent,
          error: null,
          finishedAt: null,
        });
        callbacks?.onRunStatus?.({
          runId: input.runId,
          status: "running",
          message: "审批拒绝，改走替代路径",
        });
        return this.executor.runActionPlan(
          input.runId,
          payload.goal,
          alternatives,
          payload.context,
          payload.structuredIntent,
          this.failRun.bind(this),
          callbacks,
        );
      }

      await this.store.updateRun(input.runId, {
        status: "running",
        currentStep: "executing",
        currentAgent: payload.plannedActions[0]?.agent ?? "Planner",
        error: null,
        finishedAt: null,
      });
      callbacks?.onRunStatus?.({
        runId: input.runId,
        status: "running",
        message: "审批通过，继续执行",
      });
      const approvedActions = this.markApprovedContinuation(payload.plannedActions);
      return this.executor.runActionPlan(
        input.runId,
        payload.goal,
        approvedActions,
        payload.context,
        payload.structuredIntent,
        this.failRun.bind(this),
        callbacks,
      );
    });
  }

  async replayFromStep(runId: string, request: ReplayRequest): Promise<AgentRuntimeResult> {
    const detail = await this.store.getRunDetail(runId);
    if (!detail) {
      throw new Error("Run not found.");
    }
    const fromStep = detail.steps.find((item) => item.id === request.fromStepId);
    if (!fromStep) {
      throw new Error("Replay source step not found.");
    }
    const afterSteps = detail.steps
      .filter((item) => item.seq > fromStep.seq && item.stepType === "tool_call")
      .sort((a, b) => a.seq - b.seq);
    const replayActions: PlannedAction[] = [];
    for (const step of afterSteps) {
      const payload = asObject(step.inputJson);
      const tool = payload.tool;
      if (typeof tool !== "string") {
        continue;
      }
      const input = isRecord(payload.input) ? payload.input : {};
      const call: ToolCall = {
        tool: tool as ToolCall["tool"],
        reason: typeof payload.reason === "string" ? payload.reason : "replay",
        idempotencyKey: `${typeof step.idempotencyKey === "string" ? step.idempotencyKey : `replay_${Date.now()}`}_replay`,
        input: request.mode === "dry_run"
          ? { ...input, dryRun: true }
          : input,
        dryRun: request.mode === "dry_run",
      };
      replayActions.push({
        agent: normalizeAgent(step.agentName),
        reasoning: "从历史步骤重放",
        calls: [call],
      });
    }
    if (replayActions.length === 0) {
      throw new Error("No replayable tool steps after source step.");
    }
    const metadata = parseRunMetadata(detail.run.metadataJson);
    const run = await this.store.createRun({
      sessionId: detail.run.sessionId,
      goal: detail.run.goal,
      novelId: detail.run.novelId ?? undefined,
      entryAgent: "Planner",
      metadataJson: safeJson({
        ...metadata,
        parentRunId: detail.run.id,
        replayFromStepId: request.fromStepId,
      }),
    });
    return this.withRunLock(run.id, async () => {
      await this.store.updateRun(run.id, {
        status: "running",
        startedAt: new Date(),
        currentStep: "executing",
        currentAgent: replayActions[0].agent,
      });
      return this.executor.runActionPlan(
        run.id,
        detail.run.goal,
        replayActions,
        {
          contextMode: metadata.contextMode,
          novelId: detail.run.novelId ?? undefined,
          provider: metadata.provider,
          model: metadata.model,
          temperature: metadata.temperature,
          maxTokens: metadata.maxTokens,
        },
        metadata.plannerIntent,
        this.failRun.bind(this),
      );
    });
  }

  async getRunDetail(runId: string): Promise<AgentRunDetail | null> {
    await this.reconcileWaitingApprovalRun(runId);
    return this.store.getRunDetail(runId);
  }

  async listRuns(filters: {
    status?: AgentRunDetail["run"]["status"];
    novelId?: string;
    chapterId?: string;
    sessionId?: string;
    limit?: number;
  }) {
    const runs = await this.store.listRuns(filters);
    await Promise.all(
      runs
        .filter((item) => item.status === "waiting_approval")
        .map((item) => this.reconcileWaitingApprovalRun(item.id)),
    );
    return this.store.listRuns(filters);
  }

  async cancelRun(runId: string): Promise<void> {
    await this.withRunLock(runId, async () => {
      await this.store.expireAllPendingApprovals(runId, "Run cancelled.");
      await this.store.updateRun(runId, {
        status: "cancelled",
        error: null,
        finishedAt: new Date(),
        currentStep: "cancelled",
      });
    });
  }

  async retryRun(runId: string): Promise<AgentRuntimeResult> {
    const detail = await this.store.getRunDetail(runId);
    if (!detail) {
      throw new Error("Run not found.");
    }
    const metadata = parseRunMetadata(detail.run.metadataJson);
    return this.start({
      sessionId: detail.run.sessionId,
      goal: detail.run.goal,
      messages: metadata.messages,
      contextMode: metadata.contextMode,
      novelId: detail.run.novelId ?? undefined,
      provider: metadata.provider,
      model: metadata.model,
      temperature: metadata.temperature,
      maxTokens: metadata.maxTokens,
    });
  }

  /** 创建章节生成轨迹 run，用于章节编辑页展示 */
  async createChapterGenRun(novelId: string, chapterId: string, chapterOrder: number): Promise<string> {
    const run = await this.store.createRun({
      sessionId: `chapter-gen-${chapterId}-${Date.now()}`,
      goal: `章节 ${chapterOrder} 生成`,
      novelId,
      chapterId,
      entryAgent: "Writer",
    });
    await this.store.updateRun(run.id, { status: "running", startedAt: new Date() });
    return run.id;
  }

  /** 章节生成完成后更新 run 并记录一条步骤 */
  async finishChapterGenRun(runId: string, summary: string, durationMs?: number): Promise<void> {
    await this.store.updateRun(runId, {
      status: "succeeded",
      finishedAt: new Date(),
      currentStep: "章节生成完成",
    });
    await this.store.addStep({
      runId,
      agentName: "Writer",
      stepType: "tool_result",
      outputJson: JSON.stringify({ summary }),
      durationMs,
    });
  }
}

export const agentRuntime = new AgentRuntime();
