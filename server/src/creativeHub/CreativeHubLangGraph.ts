import crypto from "node:crypto";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { AgentRuntimeCallbacks, PlannerInput } from "../agents/types";
import { createStructuredPlan } from "../agents/orchestrator";
import { AgentTraceStore } from "../agents/traceStore";
import { RunExecutionService } from "../agents/runtime/RunExecutionService";
import { safeJson } from "../agents/runtime/runtimeHelpers";
import { novelProductionService } from "../services/novel/NovelProductionService";
import { sanitizeCreativeHubToolOutput } from "./toolEventPayloads";
import { creativeHubService } from "./CreativeHubService";
import { latestHumanGoal, toRunStatusContext } from "./creativeHubGraphHelpers";
import {
  appendAssistantMessage,
  buildInterrupt,
  deriveNextBindingsFromRunSteps,
  deriveThreadStatusFromRunStatus,
  prependBindingMessage,
  toBindings,
  toChatMessages,
} from "./creativeHubRuntimeHelpers";
import {
  CreativeHubGraphState,
  type CreativeHubGraphResult,
  type CreativeHubGraphStateValue,
  type CreativeHubRunSettings,
} from "./langgraphState";
import type { CreativeHubInterrupt, CreativeHubMessage, CreativeHubResourceBinding, CreativeHubThread } from "@ai-novel/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";

interface CreativeHubGraphInvocation {
  emitFrame: (frame: CreativeHubStreamFrame) => void;
}

interface RunThreadInput {
  threadId: string;
  messages: CreativeHubMessage[];
  resourceBindings: CreativeHubResourceBinding;
  parentCheckpointId?: string | null;
  runSettings: CreativeHubRunSettings;
}

export class CreativeHubLangGraph {
  private readonly store = new AgentTraceStore();

  private readonly executor = new RunExecutionService(this.store);

  private readonly invocations = new Map<string, CreativeHubGraphInvocation>();

  private readonly graph = new StateGraph(CreativeHubGraphState)
    .addNode("bind_context", this.bindContextNode.bind(this))
    .addNode("coordinator_plan", this.coordinatorPlanNode.bind(this))
    .addNode("tool_execute", this.toolExecuteNode.bind(this))
    .addNode("approval_gate", this.approvalGateNode.bind(this))
    .addNode("answer_finalize", this.answerFinalizeNode.bind(this))
    .addNode("task_sync", this.taskSyncNode.bind(this))
    .addEdge(START, "bind_context")
    .addEdge("bind_context", "coordinator_plan")
    .addEdge("coordinator_plan", "tool_execute")
    .addEdge("tool_execute", "approval_gate")
    .addEdge("approval_gate", "answer_finalize")
    .addEdge("answer_finalize", "task_sync")
    .addEdge("task_sync", END)
    .compile({
      name: "creative_hub_server_graph",
      description: "Creative Hub server-side LangGraph execution flow",
    });

  private getInvocation(state: CreativeHubGraphStateValue): CreativeHubGraphInvocation {
    const invocation = this.invocations.get(state.invocationId);
    if (!invocation) {
      throw new Error("创作中枢图调用上下文不存在。");
    }
    return invocation;
  }

  private emitFrame(state: CreativeHubGraphStateValue, frame: CreativeHubStreamFrame): void {
    this.getInvocation(state).emitFrame(frame);
  }

  private async failRun(
    runId: string,
    message: string,
    agentName: string,
    state: CreativeHubGraphStateValue,
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
    this.emitFrame(state, {
      event: "creative_hub/run_status",
      data: {
        runId,
        status: "failed",
        message,
      },
    });
  }

  private async bindContextNode(state: CreativeHubGraphStateValue) {
    const bindings = toBindings(state.resourceBindings);
    const messages = state.messages ?? [];
    const runtimeMessages = prependBindingMessage(messages, bindings);
    return {
      resourceBindings: bindings,
      messages,
      runtimeMessages: toChatMessages(runtimeMessages),
      goal: latestHumanGoal(messages),
      finalMessages: messages,
      nextBindings: bindings,
    };
  }

  private async coordinatorPlanNode(state: CreativeHubGraphStateValue) {
    const run = await this.store.createRun({
      sessionId: state.sessionId,
      goal: state.goal,
      novelId: state.resourceBindings.novelId ?? undefined,
      entryAgent: "Planner",
      metadataJson: safeJson({
        contextMode: state.resourceBindings.novelId ? "novel" : "global",
        provider: state.runSettings.provider,
        model: state.runSettings.model,
        temperature: state.runSettings.temperature,
        maxTokens: state.runSettings.maxTokens,
        worldId: state.resourceBindings.worldId ?? undefined,
        messages: state.runtimeMessages,
      }),
    });

    await this.store.updateRun(run.id, {
      status: "running",
      startedAt: new Date(),
      currentStep: "planning",
      currentAgent: "Planner",
    });

    this.emitFrame(state, {
      event: "creative_hub/run_status",
      data: {
        runId: run.id,
        status: "running",
        message: "开始规划",
      },
    });

    const planningStep = await this.store.addStep({
      runId: run.id,
      agentName: "Planner",
      stepType: "planning",
      status: "running",
      inputJson: safeJson({
        goal: state.goal,
        contextMode: state.resourceBindings.novelId ? "novel" : "global",
        novelId: state.resourceBindings.novelId ?? undefined,
      }),
      provider: state.runSettings.provider,
      model: state.runSettings.model,
    });

    const plannerInput: PlannerInput = {
      goal: state.goal,
      messages: state.runtimeMessages,
      contextMode: state.resourceBindings.novelId ? "novel" : "global",
      novelId: state.resourceBindings.novelId ?? undefined,
      worldId: state.resourceBindings.worldId ?? undefined,
      provider: state.runSettings.provider,
      model: state.runSettings.model,
      temperature: state.runSettings.temperature,
      maxTokens: state.runSettings.maxTokens,
      currentRunId: run.id,
      currentRunStatus: "running",
      currentStep: "planning",
    };
    let plannerResult;
    try {
      plannerResult = await createStructuredPlan(plannerInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM 意图识别失败。";
      await this.store.addStep({
        runId: run.id,
        agentName: "Planner",
        parentStepId: planningStep.id,
        stepType: "planning",
        status: "failed",
        error: message,
        provider: state.runSettings.provider,
        model: state.runSettings.model,
      });
      await this.failRun(run.id, message, "Planner", state);
      throw error;
    }

    await this.store.updateRun(run.id, {
      metadataJson: safeJson({
        contextMode: plannerInput.contextMode,
        provider: plannerInput.provider,
        model: plannerInput.model,
        temperature: plannerInput.temperature,
        maxTokens: plannerInput.maxTokens,
        worldId: plannerInput.worldId,
        messages: plannerInput.messages,
        plannerIntent: plannerResult.structuredIntent,
        plannerSource: plannerResult.source,
      }),
    });

    await this.store.addStep({
      runId: run.id,
      agentName: "Planner",
      parentStepId: planningStep.id,
      stepType: "planning",
      status: "succeeded",
      inputJson: safeJson({
        source: plannerResult.source,
        warnings: plannerResult.validationWarnings,
        structuredIntent: plannerResult.structuredIntent,
        plan: plannerResult.plan,
      }),
      provider: state.runSettings.provider,
      model: state.runSettings.model,
    });

    if (plannerResult.validationWarnings.length > 0) {
      await this.store.addStep({
        runId: run.id,
        agentName: "Planner",
        stepType: "reasoning",
        status: "succeeded",
        inputJson: safeJson({
          warnings: plannerResult.validationWarnings,
        }),
        provider: state.runSettings.provider,
        model: state.runSettings.model,
      });
    }

    this.emitFrame(state, {
      event: "metadata",
      data: {
        planner: {
          source: plannerResult.source,
          confidence: plannerResult.structuredIntent.confidence,
          intent: plannerResult.structuredIntent.intent,
          note: plannerResult.structuredIntent.note,
          warnings: plannerResult.validationWarnings,
        },
      },
    });

    return {
      runId: run.id,
      plannerResult,
      ...toRunStatusContext("busy", null),
    };
  }

  private async toolExecuteNode(state: CreativeHubGraphStateValue) {
    if (!state.runId || !state.plannerResult) {
      throw new Error("创作中枢图缺少 runId 或 plannerResult。");
    }

    const interrupts: CreativeHubInterrupt[] = [];
    let threadStatus: CreativeHubThread["status"] = "busy";
    let latestError: string | null = null;

    const callbacks: AgentRuntimeCallbacks = {
      onReasoning: (content) => {
        this.emitFrame(state, {
          event: "metadata",
          data: { reasoning: content },
        });
      },
      onToolCall: (payload) => {
        this.emitFrame(state, {
          event: "creative_hub/tool_call",
          data: payload,
        });
      },
      onToolResult: (payload) => {
        this.emitFrame(state, {
          event: "creative_hub/tool_result",
          data: {
            ...payload,
            output: sanitizeCreativeHubToolOutput(payload.toolName, payload.output),
          },
        });
      },
      onApprovalRequired: (payload) => {
        const interrupt = buildInterrupt(payload);
        interrupts.push(interrupt);
        threadStatus = "interrupted";
        this.emitFrame(state, {
          event: "creative_hub/interrupt",
          data: interrupt,
        });
      },
      onApprovalResolved: (payload) => {
        this.emitFrame(state, {
          event: "creative_hub/approval_resolved",
          data: {
            approvalId: payload.approvalId,
            action: payload.action,
            note: payload.note,
          },
        });
      },
      onRunStatus: (payload) => {
        threadStatus = deriveThreadStatusFromRunStatus(payload.status);
        latestError = payload.status === "failed" ? payload.message ?? "创作中枢运行失败。" : null;
        this.emitFrame(state, {
          event: "creative_hub/run_status",
          data: payload,
        });
      },
    };

    const executionResult = await this.executor.runActionPlan(
      state.runId,
      state.goal,
      state.plannerResult.actions,
      {
        contextMode: state.resourceBindings.novelId ? "novel" : "global",
        novelId: state.resourceBindings.novelId ?? undefined,
        worldId: state.resourceBindings.worldId ?? undefined,
        provider: state.runSettings.provider,
        model: state.runSettings.model,
        temperature: state.runSettings.temperature,
        maxTokens: state.runSettings.maxTokens,
      },
      state.plannerResult.structuredIntent,
      (runId, message, agentName, innerCallbacks) => this.failRun(runId, message, agentName, state, innerCallbacks),
      callbacks,
    );

    return {
      executionResult,
      interrupts,
      ...toRunStatusContext(threadStatus, latestError),
    };
  }

  private async approvalGateNode(state: CreativeHubGraphStateValue) {
    if (!state.executionResult) {
      throw new Error("创作中枢图缺少 executionResult。");
    }
    return {
      interrupts: state.interrupts,
      ...toRunStatusContext(
        state.interrupts.length > 0 ? "interrupted" : state.threadStatus,
        state.latestError,
      ),
    };
  }

  private async answerFinalizeNode(state: CreativeHubGraphStateValue) {
    if (!state.executionResult) {
      throw new Error("创作中枢图缺少 executionResult。");
    }
    const finalMessages = appendAssistantMessage(
      state.messages,
      state.executionResult.assistantOutput,
      state.runId,
    );
    const nextBindings = deriveNextBindingsFromRunSteps(
      state.resourceBindings,
      state.executionResult.steps,
    );
    return {
      finalMessages,
      nextBindings,
    };
  }

  private async taskSyncNode(state: CreativeHubGraphStateValue) {
    let productionStatus: Record<string, unknown> | undefined;
    let nextBindings = state.nextBindings;
    if (state.nextBindings.novelId) {
      try {
        const status = await novelProductionService.getNovelProductionStatus({
          novelId: state.nextBindings.novelId,
        });
        productionStatus = status as unknown as Record<string, unknown>;
        if (!nextBindings.worldId && status.worldId) {
          nextBindings = {
            ...nextBindings,
            worldId: status.worldId,
          };
        }
      } catch {
        productionStatus = undefined;
      }
    }
    const checkpoint = await creativeHubService.saveCheckpoint(state.threadId, {
      checkpointId: crypto.randomUUID(),
      parentCheckpointId: state.parentCheckpointId ?? null,
      runId: state.runId ?? null,
      status: state.threadStatus,
      latestError: state.latestError,
      messages: state.finalMessages,
      interrupts: state.interrupts,
      resourceBindings: nextBindings,
      metadata: {
        source: "creative_hub_langgraph",
        runStatus: state.threadStatus,
        resourceBindings: nextBindings,
        productionStatus: productionStatus ?? null,
        planner: state.plannerResult
          ? {
            source: state.plannerResult.source,
            validationWarnings: state.plannerResult.validationWarnings,
            structuredIntent: state.plannerResult.structuredIntent,
          }
          : undefined,
      },
    });

    this.emitFrame(state, {
      event: "messages/complete",
      data: state.finalMessages,
    });
    this.emitFrame(state, {
      event: "metadata",
      data: {
        threadId: state.threadId,
        checkpointId: checkpoint.checkpointId,
        runId: state.runId,
        resourceBindings: nextBindings,
        productionStatus: productionStatus ?? null,
      },
    });

    return {
      checkpoint,
      nextBindings,
    };
  }

  async runThread(input: RunThreadInput, emitFrame: (frame: CreativeHubStreamFrame) => void): Promise<CreativeHubGraphResult> {
    const resourceBindings = toBindings(input.resourceBindings);
    const activeRuns = await this.store.listRuns({
      sessionId: `creative_hub_${input.threadId}`,
      novelId: resourceBindings.novelId ?? undefined,
      limit: 10,
    });
    const blockingRun = activeRuns.find((item) => item.status === "running" || item.status === "waiting_approval");
    if (blockingRun) {
      throw new Error(
        blockingRun.status === "waiting_approval"
          ? "当前已有运行在等待审批，请先处理审批。"
          : "当前已有运行仍在执行中。",
      );
    }

    const invocationId = crypto.randomUUID();
    this.invocations.set(invocationId, { emitFrame });
    try {
      const result = await this.graph.invoke({
        invocationId,
        threadId: input.threadId,
        sessionId: `creative_hub_${input.threadId}`,
        messages: input.messages,
        runtimeMessages: [],
        goal: "",
        resourceBindings,
        runSettings: input.runSettings,
        parentCheckpointId: input.parentCheckpointId ?? null,
        runId: null,
        plannerResult: null,
        executionResult: null,
        interrupts: [],
        finalMessages: input.messages,
        nextBindings: resourceBindings,
        checkpoint: null,
        threadStatus: "idle",
        latestError: null,
        diagnostics: undefined,
      });

      return {
        runId: result.runId,
        assistantOutput: result.executionResult?.assistantOutput ?? "",
        checkpoint: result.checkpoint,
        interrupts: result.interrupts,
        status: result.threadStatus,
        latestError: result.latestError,
        messages: result.finalMessages,
        resourceBindings: result.nextBindings,
        diagnostics: result.diagnostics,
      };
    } finally {
      this.invocations.delete(invocationId);
    }
  }
}

export const creativeHubLangGraph = new CreativeHubLangGraph();
