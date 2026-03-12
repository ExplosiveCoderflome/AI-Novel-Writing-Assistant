import type { AgentRuntimeCallbacks, AgentRuntimeResult, PlannedAction, StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import { canAgentUseTool, evaluateApprovalRequirement } from "../approvalPolicy";
import { AgentTraceStore } from "../traceStore";
import { getAgentToolDefinition } from "../toolRegistry";
import {
  APPROVAL_TTL_MS,
  MAX_TOOL_RETRIES,
  asObject,
  buildAlternativePathFromRejectedApproval,
  buildFinalMessage,
  canRetry,
  composeAssistantMessage,
  extractErrorCode,
  parseApprovalPayload,
  safeJson,
  shouldUseDryRunPreview,
  summarizeFailure,
  summarizeOutput,
  type SerializedContinuationPayload,
  type ToolExecutionResult,
} from "./runtimeHelpers";

export class RunExecutionService {
  constructor(private readonly store: AgentTraceStore) {}

  parseApprovalPayload(payloadJson: string | null | undefined): SerializedContinuationPayload | null {
    return parseApprovalPayload(payloadJson);
  }

  buildAlternativePathFromRejectedApproval(
    approvalPayload: SerializedContinuationPayload | null,
    note?: string,
  ): PlannedAction[] {
    return buildAlternativePathFromRejectedApproval(approvalPayload, note);
  }

  async getRunDetailOrThrow(runId: string, fallbackOutput: string): Promise<AgentRuntimeResult> {
    const detail = await this.store.getRunDetail(runId);
    if (!detail) {
      throw new Error("Run not found.");
    }
    return {
      run: detail.run,
      steps: detail.steps,
      approvals: detail.approvals,
      assistantOutput: fallbackOutput,
    };
  }

  private async executeToolCall(
    context: ToolExecutionContext,
    call: ToolCall,
    callbacks?: AgentRuntimeCallbacks,
    options?: {
      parentStepId?: string;
      ignoreFailedCache?: boolean;
    },
  ): Promise<ToolExecutionResult> {
    const dedupeKey = `${call.tool}:${call.idempotencyKey}`;
    const cached = await this.store.findToolResultByIdempotencyKey(context.runId, dedupeKey);
    if (cached) {
      if (!(cached.status === "failed" && options?.ignoreFailedCache)) {
        const output = asObject(cached.outputJson);
        const summary = cached.status === "succeeded"
          ? summarizeOutput(call.tool, output)
          : summarizeFailure(call.tool, cached.error ?? "cached failed");
        callbacks?.onToolResult?.({
          runId: context.runId,
          stepId: cached.id,
          toolName: call.tool,
          outputSummary: summary,
          success: cached.status === "succeeded",
        });
        return {
          tool: call.tool,
          success: cached.status === "succeeded",
          summary,
          output,
          errorCode: cached.errorCode ?? undefined,
          stepId: cached.id,
        };
      }
    }

    const start = Date.now();
    const callStep = await this.store.addStep({
      runId: context.runId,
      agentName: context.agentName,
      parentStepId: options?.parentStepId,
      stepType: "tool_call",
      status: "running",
      idempotencyKey: dedupeKey,
      inputJson: safeJson({
        tool: call.tool,
        reason: call.reason,
        input: call.input,
        dryRun: call.dryRun ?? false,
      }),
      provider: context.provider,
      model: context.model,
    });
    callbacks?.onToolCall?.({
      runId: context.runId,
      stepId: callStep.id,
      toolName: call.tool,
      inputSummary: call.reason,
    });
    const definition = getAgentToolDefinition(call.tool);

    try {
      const parsedInput = definition.inputSchema.parse(call.input);
      const rawOutput = await definition.execute(
        {
          ...context,
          dryRun: call.dryRun ?? false,
        },
        parsedInput,
      );
      const parsedOutput = definition.outputSchema.parse(rawOutput);
      const summary = summarizeOutput(call.tool, parsedOutput);
      const resultStep = await this.store.addStep({
        runId: context.runId,
        agentName: context.agentName,
        parentStepId: callStep.id,
        stepType: "tool_result",
        status: "succeeded",
        idempotencyKey: dedupeKey,
        inputJson: safeJson({
          tool: call.tool,
          input: call.input,
          dryRun: call.dryRun ?? false,
        }),
        outputJson: safeJson(parsedOutput),
        durationMs: Date.now() - start,
        provider: context.provider,
        model: context.model,
      });
      callbacks?.onToolResult?.({
        runId: context.runId,
        stepId: resultStep.id,
        toolName: call.tool,
        outputSummary: summary,
        success: true,
      });
      return {
        tool: call.tool,
        success: true,
        summary,
        output: parsedOutput,
        stepId: resultStep.id,
      };
    } catch (error) {
      const code = extractErrorCode(error);
      const message = summarizeFailure(call.tool, error);
      const resultStep = await this.store.addStep({
        runId: context.runId,
        agentName: context.agentName,
        parentStepId: callStep.id,
        stepType: "tool_result",
        status: "failed",
        idempotencyKey: dedupeKey,
        inputJson: safeJson({
          tool: call.tool,
          input: call.input,
          dryRun: call.dryRun ?? false,
        }),
        error: error instanceof Error ? error.message : "unknown error",
        errorCode: code,
        durationMs: Date.now() - start,
        provider: context.provider,
        model: context.model,
      });
      callbacks?.onToolResult?.({
        runId: context.runId,
        stepId: resultStep.id,
        toolName: call.tool,
        outputSummary: message,
        success: false,
      });
      return {
        tool: call.tool,
        success: false,
        summary: message,
        errorCode: code,
        stepId: resultStep.id,
      };
    }
  }

  private async executeToolWithRetry(
    context: ToolExecutionContext,
    call: ToolCall,
    callbacks?: AgentRuntimeCallbacks,
    parentStepId?: string,
  ): Promise<ToolExecutionResult> {
    let finalResult: ToolExecutionResult | null = null;
    for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt += 1) {
      const result = await this.executeToolCall(
        context,
        call,
        callbacks,
        {
          parentStepId,
          ignoreFailedCache: attempt > 0,
        },
      );
      finalResult = result;
      if (result.success) {
        return result;
      }
      if (!result.errorCode || !canRetry(result.errorCode) || attempt >= MAX_TOOL_RETRIES) {
        break;
      }
      await this.store.addStep({
        runId: context.runId,
        agentName: context.agentName,
        parentStepId: result.stepId,
        stepType: "reasoning",
        status: "succeeded",
        inputJson: safeJson({
          message: `工具 ${call.tool} 第 ${attempt + 1} 次失败，准备重试。`,
          errorCode: result.errorCode,
        }),
      });
    }
    return finalResult ?? {
      tool: call.tool,
      success: false,
      summary: `${call.tool} 执行失败：unknown`,
      errorCode: "INTERNAL",
    };
  }

  private buildApprovalPayload(
    goal: string,
    context: Omit<ToolExecutionContext, "runId" | "agentName">,
    plannedActions: PlannedAction[],
    structuredIntent?: StructuredIntent,
  ): string {
    const payload: SerializedContinuationPayload = {
      goal,
      structuredIntent,
      context,
      plannedActions,
    };
    return safeJson(payload);
  }

  async runActionPlan(
    runId: string,
    goal: string,
    plannedActions: PlannedAction[],
    context: Omit<ToolExecutionContext, "runId" | "agentName">,
    structuredIntent: StructuredIntent | undefined,
    failRun: (runId: string, message: string, agentName: string, callbacks?: AgentRuntimeCallbacks) => Promise<void>,
    callbacks?: AgentRuntimeCallbacks,
  ): Promise<AgentRuntimeResult> {
    const allResults: ToolExecutionResult[] = [];
    let waitingForApproval = false;
    for (let actionIndex = 0; actionIndex < plannedActions.length; actionIndex += 1) {
      const action = plannedActions[actionIndex];
      await this.store.updateRun(runId, {
        status: "running",
        currentStep: "executing",
        currentAgent: action.agent,
      });
      await this.store.addStep({
        runId,
        agentName: action.agent,
        stepType: "reasoning",
        status: "succeeded",
        inputJson: safeJson({
          reasoning: action.reasoning,
          toolCount: action.calls.length,
        }),
        provider: context.provider,
        model: context.model,
      });
      callbacks?.onReasoning?.(action.reasoning);

      for (let callIndex = 0; callIndex < action.calls.length; callIndex += 1) {
        const call = action.calls[callIndex];
        if (!canAgentUseTool(action.agent, call.tool)) {
          const message = `权限拒绝：${action.agent} 不允许调用 ${call.tool}。`;
          await this.store.addStep({
            runId,
            agentName: action.agent,
            stepType: "tool_result",
            status: "failed",
            inputJson: safeJson({
              tool: call.tool,
              reason: call.reason,
            }),
            error: message,
            errorCode: "PERMISSION_DENIED",
            provider: context.provider,
            model: context.model,
          });
          await failRun(runId, message, action.agent, callbacks);
          return this.getRunDetailOrThrow(runId, message);
        }

        const approvalDecision = call.approvalSatisfied
          ? { required: false }
          : evaluateApprovalRequirement(call.tool, call.input);
        if (approvalDecision.required) {
          let diffSummary = approvalDecision.summary ?? "高影响写入操作待确认。";
          if (shouldUseDryRunPreview(call)) {
            const previewCall: ToolCall = {
              ...call,
              idempotencyKey: `${call.idempotencyKey}:preview`,
              dryRun: true,
              input: {
                ...call.input,
                dryRun: true,
              },
            };
            const previewResult = await this.executeToolWithRetry(
              {
                ...context,
                runId,
                agentName: action.agent,
              },
              previewCall,
              callbacks,
            );
            allResults.push(previewResult);
            if (!previewResult.success) {
              await failRun(runId, previewResult.summary, action.agent, callbacks);
              return this.getRunDetailOrThrow(runId, previewResult.summary);
            }
            diffSummary = previewResult.summary;
          }

          const currentCallAfterApproval: ToolCall = {
            ...call,
            approvalSatisfied: true,
            dryRun: false,
            input: {
              ...call.input,
              dryRun: false,
            },
          };
          const continuationActions: PlannedAction[] = [
            {
              agent: action.agent,
              reasoning: `审批通过后继续执行 ${action.agent} 任务`,
              calls: [currentCallAfterApproval, ...action.calls.slice(callIndex + 1)],
            },
            ...plannedActions.slice(actionIndex + 1),
          ];
          const approvalStep = await this.store.addStep({
            runId,
            agentName: action.agent,
            stepType: "approval",
            status: "pending",
            inputJson: safeJson({
              summary: diffSummary,
            targetType: approvalDecision.targetType,
            targetId: approvalDecision.targetId,
            tool: call.tool,
          }),
            provider: context.provider,
            model: context.model,
          });
          const approval = await this.store.addApproval({
            runId,
            stepId: approvalStep.id,
            approvalType: "high_impact_write",
            targetType: approvalDecision.targetType ?? "unknown",
            targetId: approvalDecision.targetId ?? "unknown",
            diffSummary,
            expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
            payloadJson: this.buildApprovalPayload(goal, context, continuationActions, structuredIntent),
          });
          await this.store.updateRun(runId, {
            status: "waiting_approval",
            currentStep: "waiting_approval",
            currentAgent: action.agent,
          });
          callbacks?.onRunStatus?.({
            runId,
            status: "waiting_approval",
            message: diffSummary,
          });
          callbacks?.onApprovalRequired?.({
            runId,
            approvalId: approval.id,
            summary: diffSummary,
            targetType: approval.targetType,
            targetId: approval.targetId,
          });
          waitingForApproval = true;
          break;
        }

        const result = await this.executeToolWithRetry(
          {
            ...context,
            runId,
            agentName: action.agent,
          },
          call,
          callbacks,
        );
        allResults.push(result);
        if (!result.success) {
          await failRun(runId, result.summary, action.agent, callbacks);
          return this.getRunDetailOrThrow(runId, result.summary);
        }
      }

      if (waitingForApproval) {
        break;
      }
    }

    if (!waitingForApproval) {
      await this.store.updateRun(runId, {
        status: "succeeded",
        currentStep: "completed",
        currentAgent: "Planner",
        finishedAt: new Date(),
        error: null,
      });
      callbacks?.onRunStatus?.({
        runId,
        status: "succeeded",
        message: "执行完成",
      });
    }

    const summary = buildFinalMessage(allResults, waitingForApproval);
    const assistantOutput = await composeAssistantMessage(goal, summary, allResults, waitingForApproval, context, structuredIntent);
    const detail = await this.store.getRunDetail(runId);
    if (!detail) {
      throw new Error("Run not found after execution.");
    }
    return {
      run: detail.run,
      steps: detail.steps,
      approvals: detail.approvals,
      assistantOutput,
    };
  }
}
