import crypto from "node:crypto";
import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentTraceStore } from "../agents/traceStore";
import { ApprovalContinuationService } from "../agents/runtime/ApprovalContinuationService";
import { RunExecutionService } from "../agents/runtime/RunExecutionService";
import type { AgentRuntimeCallbacks } from "../agents/types";
import { sanitizeCreativeHubToolOutput } from "./toolEventPayloads";
import { creativeHubService } from "./CreativeHubService";
import {
  appendAssistantMessage,
  buildInterrupt,
  deriveNextBindingsFromRunSteps,
  deriveThreadStatusFromRunStatus,
  toBindings,
} from "./creativeHubRuntimeHelpers";
import { type CreativeHubGraphResult } from "./langgraphState";
import { CreativeHubInterruptGraphState, type CreativeHubInterruptGraphStateValue } from "./creativeHubInterruptState";
import type { CreativeHubInterrupt, CreativeHubThread } from "@ai-novel/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";

interface CreativeHubInterruptInvocation {
  emitFrame: (frame: CreativeHubStreamFrame) => void;
}

interface ResolveInterruptInput {
  threadId: string;
  interruptId: string;
  action: "approve" | "reject";
  note?: string;
}

function toRunStatusContext(status: CreativeHubThread["status"], latestError: string | null) {
  return {
    threadStatus: status,
    latestError,
  };
}

export class CreativeHubInterruptLangGraph {
  private readonly store = new AgentTraceStore();

  private readonly executor = new RunExecutionService(this.store);

  private readonly approvals = new ApprovalContinuationService(this.store, this.executor);

  private readonly invocations = new Map<string, CreativeHubInterruptInvocation>();

  private readonly graph = new StateGraph(CreativeHubInterruptGraphState)
    .addNode("load_resume_context", this.loadResumeContextNode.bind(this))
    .addNode("resolve_approval", this.resolveApprovalNode.bind(this))
    .addNode("answer_finalize", this.answerFinalizeNode.bind(this))
    .addNode("task_sync", this.taskSyncNode.bind(this))
    .addEdge(START, "load_resume_context")
    .addEdge("load_resume_context", "resolve_approval")
    .addEdge("resolve_approval", "answer_finalize")
    .addEdge("answer_finalize", "task_sync")
    .addEdge("task_sync", END)
    .compile({
      name: "creative_hub_interrupt_graph",
      description: "Creative Hub interrupt resume graph",
    });

  private getInvocation(state: CreativeHubInterruptGraphStateValue): CreativeHubInterruptInvocation {
    const invocation = this.invocations.get(state.invocationId);
    if (!invocation) {
      throw new Error("创作中枢中断恢复上下文不存在。");
    }
    return invocation;
  }

  private emitFrame(state: CreativeHubInterruptGraphStateValue, frame: CreativeHubStreamFrame): void {
    this.getInvocation(state).emitFrame(frame);
  }

  private async failRun(
    runId: string,
    message: string,
    agentName: string,
    state: CreativeHubInterruptGraphStateValue,
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

  private async loadResumeContextNode(state: CreativeHubInterruptGraphStateValue) {
    const threadState = await creativeHubService.getThreadState(state.threadId);
    const runId = threadState.thread.latestRunId;
    if (!runId) {
      throw new Error("当前线程没有可恢复的运行。");
    }
    const resourceBindings = toBindings(threadState.thread.resourceBindings);
    return {
      runId,
      parentCheckpointId: threadState.currentCheckpointId ?? null,
      messages: threadState.messages,
      resourceBindings,
      finalMessages: threadState.messages,
      nextBindings: resourceBindings,
      interrupts: [],
      checkpoint: null,
      ...toRunStatusContext(threadState.thread.status, threadState.thread.latestError ?? null),
      diagnostics: threadState.diagnostics,
    };
  }

  private async resolveApprovalNode(state: CreativeHubInterruptGraphStateValue) {
    if (!state.runId) {
      throw new Error("创作中枢缺少待恢复的 runId。");
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
        latestError = payload.status === "failed" ? payload.message ?? "审批后续执行失败。" : null;
        this.emitFrame(state, {
          event: "creative_hub/run_status",
          data: payload,
        });
      },
    };

    const executionResult = await this.approvals.resolve(
      {
        runId: state.runId,
        approvalId: state.interruptId,
        action: state.action,
        note: state.note,
      },
      callbacks,
      (runId, message, agentName, innerCallbacks) => this.failRun(runId, message, agentName, state, innerCallbacks),
    );

    return {
      executionResult,
      interrupts,
      ...toRunStatusContext(threadStatus, latestError),
    };
  }

  private async answerFinalizeNode(state: CreativeHubInterruptGraphStateValue) {
    if (!state.executionResult) {
      throw new Error("创作中枢审批恢复缺少执行结果。");
    }
    return {
      finalMessages: appendAssistantMessage(
        state.messages,
        state.executionResult.assistantOutput,
        state.runId,
      ),
      nextBindings: deriveNextBindingsFromRunSteps(
        state.resourceBindings,
        state.executionResult.steps,
      ),
    };
  }

  private async taskSyncNode(state: CreativeHubInterruptGraphStateValue) {
    const checkpoint = await creativeHubService.saveCheckpoint(state.threadId, {
      checkpointId: crypto.randomUUID(),
      parentCheckpointId: state.parentCheckpointId ?? null,
      runId: state.runId ?? null,
      status: state.threadStatus,
      latestError: state.latestError,
      messages: state.finalMessages,
      interrupts: state.interrupts,
      resourceBindings: state.nextBindings,
      metadata: {
        source: "creative_hub_interrupt_langgraph",
        interruptId: state.interruptId,
        action: state.action,
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
        resourceBindings: state.nextBindings,
      },
    });

    return {
      checkpoint,
    };
  }

  async resolveInterrupt(
    input: ResolveInterruptInput,
    emitFrame: (frame: CreativeHubStreamFrame) => void,
  ): Promise<CreativeHubGraphResult> {
    const invocationId = crypto.randomUUID();
    this.invocations.set(invocationId, { emitFrame });
    try {
      const result = await this.graph.invoke({
        invocationId,
        threadId: input.threadId,
        interruptId: input.interruptId,
        action: input.action,
        note: input.note,
        runId: null,
        parentCheckpointId: null,
        messages: [],
        resourceBindings: toBindings({}),
        executionResult: null,
        interrupts: [],
        finalMessages: [],
        nextBindings: toBindings({}),
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

export const creativeHubInterruptLangGraph = new CreativeHubInterruptLangGraph();
