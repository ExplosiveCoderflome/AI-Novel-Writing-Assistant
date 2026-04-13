import { AgentTraceStore } from "../traceStore";
import type { AgentApprovalDecisionInput, AgentRuntimeCallbacks, AgentRuntimeResult, PlannedAction } from "../types";
import { RunExecutionService } from "./RunExecutionService";
import { withSharedRunLock } from "./runLocks";

type FailRunFn = (
  runId: string,
  message: string,
  agentName: string,
  callbacks?: AgentRuntimeCallbacks,
) => Promise<void>;

export class ApprovalContinuationService {
  constructor(
    private readonly store: AgentTraceStore,
    private readonly executor: RunExecutionService,
  ) {}

  async reconcileWaitingApprovalRun(runId: string): Promise<void> {
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

  async resolve(
    input: AgentApprovalDecisionInput,
    callbacks: AgentRuntimeCallbacks | undefined,
    failRun: FailRunFn,
  ): Promise<AgentRuntimeResult> {
    return withSharedRunLock(input.runId, async () => {
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
        await failRun(input.runId, "审批续跑数据损坏，无法继续执行。", "Planner", callbacks);
        return this.executor.getRunDetailOrThrow(input.runId, "审批续跑数据损坏，运行已终止。");
      }

      if (input.action === "reject") {
        const alternatives = this.executor.buildAlternativePathFromRejectedApproval(payload, input.note);
        if (alternatives.length === 0) {
          await failRun(
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
          failRun,
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
        failRun,
        callbacks,
      );
    });
  }
}
