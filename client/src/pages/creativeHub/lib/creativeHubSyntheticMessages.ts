import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type { CreativeHubInterrupt } from "@ai-novel/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";
import type { LangChainMessage } from "@assistant-ui/react-langgraph";
import { getIntentDisplayLabel, getPlannerSourceDisplayLabel } from "./plannerLabels";

function compactArgs(record: Record<string, string | null | undefined>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string | null] => entry[1] !== undefined),
  );
}

export function mergeDisplayMessages(
  baseMessages: LangChainMessage[],
  syntheticToolMessages: LangChainMessage[],
  inlineStateMessages: LangChainMessage[],
  syntheticRunMessages: LangChainMessage[],
): LangChainMessage[] {
  if (
    syntheticToolMessages.length === 0
    && inlineStateMessages.length === 0
    && syntheticRunMessages.length === 0
  ) {
    return baseMessages;
  }
  const lastMessage = baseMessages[baseMessages.length - 1];
  if (lastMessage?.type === "ai") {
    return [
      ...baseMessages.slice(0, -1),
      ...syntheticToolMessages,
      lastMessage,
      ...inlineStateMessages,
      ...syntheticRunMessages,
    ];
  }
  return [...baseMessages, ...syntheticToolMessages, ...inlineStateMessages, ...syntheticRunMessages];
}

export function createSyntheticRunMessage(
  frame: CreativeHubStreamFrame,
  sequence: number,
): LangChainMessage | null {
  if (frame.event === "creative_hub/run_status") {
    return {
      id: `assistant_run_status_${sequence}`,
      type: "ai",
      content: `**运行状态**\n${frame.data.message || "当前状态已更新。"}`
        + `\n\n状态：${frame.data.status}`,
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "run_status",
          status: frame.data.status,
          runId: frame.data.runId ?? null,
        },
      },
    };
  }
  if (frame.event === "creative_hub/approval_resolved") {
    return {
      id: `assistant_approval_${sequence}`,
      type: "ai",
      content: `**${frame.data.action === "approved" ? "审批已通过" : "审批已拒绝"}**\n${frame.data.note?.trim() || "审批结果已记录。"}`,
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "approval_resolved",
          approvalId: frame.data.approvalId ?? null,
        },
      },
    };
  }
  if (frame.event === "creative_hub/error" || frame.event === "error") {
    return {
      id: `assistant_error_${sequence}`,
      type: "ai",
      content: `**运行异常**\n${frame.data.message}`,
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "error",
        },
      },
    };
  }
  if (frame.event === "metadata" && typeof frame.data.reasoning === "string") {
    return {
      id: `assistant_reasoning_${sequence}`,
      type: "ai",
      content: `**推理更新**\n${frame.data.reasoning}`,
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "reasoning",
        },
      },
    };
  }
  if (frame.event === "metadata" && typeof frame.data.planner === "object" && frame.data.planner) {
    const planner = frame.data.planner as Record<string, unknown>;
    return {
      id: `assistant_planner_${sequence}`,
      type: "ai",
      content: `**意图识别**\n来源：${getPlannerSourceDisplayLabel(planner.source)}\n意图：${getIntentDisplayLabel(planner.intent)}`
        + ("confidence" in planner ? `\n置信度：${String(planner.confidence ?? "-")}` : ""),
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "planner",
        },
      },
    };
  }
  if (frame.event === "metadata" && typeof frame.data.checkpointId === "string") {
    return {
      id: `assistant_checkpoint_${sequence}`,
      type: "ai",
      content: `**检查点已保存**\nCheckpoint ${frame.data.checkpointId.slice(0, 8)} 已写回线程历史。`,
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "checkpoint",
          checkpointId: frame.data.checkpointId,
        },
      },
    };
  }
  return null;
}

export function createSyntheticToolCallMessage(
  frame: Extract<CreativeHubStreamFrame, { event: "creative_hub/tool_call" }>,
  toolCallId: string,
): LangChainMessage {
  return {
    id: `assistant_${toolCallId}`,
    type: "ai",
    content: "",
    tool_calls: [{
      id: toolCallId,
      name: frame.data.toolName,
      args: {
        inputSummary: frame.data.inputSummary,
      },
      partial_json: JSON.stringify({
        inputSummary: frame.data.inputSummary,
      }),
    }],
    additional_kwargs: {
      metadata: {
        synthetic: true,
        event: frame.event,
        runId: frame.data.runId,
        stepId: frame.data.stepId,
      },
    },
  };
}

export function createSyntheticToolResultMessage(
  frame: Extract<CreativeHubStreamFrame, { event: "creative_hub/tool_result" }>,
  toolCallId: string,
): LangChainMessage {
  return {
    id: `tool_${toolCallId}`,
    type: "tool",
    tool_call_id: toolCallId,
    name: frame.data.toolName,
    content: frame.data.outputSummary,
    artifact: {
      summary: frame.data.outputSummary,
      output: frame.data.output,
      success: frame.data.success,
      errorCode: frame.data.errorCode,
    },
    status: frame.data.success ? "success" : "error",
  };
}

export function buildInlineStateMessages(
  interrupt: CreativeHubInterrupt | undefined,
  diagnostics: FailureDiagnostic | undefined,
): LangChainMessage[] {
  const messages: LangChainMessage[] = [];

  if (interrupt?.id) {
    messages.push({
      id: `assistant_interrupt_${interrupt.id}`,
      type: "ai",
      content: "",
      tool_calls: [{
        id: `approval_gate_${interrupt.id}`,
        name: "approval_gate",
        args: compactArgs({
          title: interrupt.title,
          summary: interrupt.summary,
          targetType: interrupt.targetType ?? null,
          targetId: interrupt.targetId ?? null,
          approvalId: interrupt.approvalId ?? interrupt.id,
        }),
        partial_json: JSON.stringify(compactArgs({
          title: interrupt.title,
          summary: interrupt.summary,
          targetType: interrupt.targetType ?? null,
          targetId: interrupt.targetId ?? null,
          approvalId: interrupt.approvalId ?? interrupt.id,
        })),
      }],
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "interrupt",
        },
      },
    });
  }

  if (diagnostics?.failureSummary) {
    const toolCallId = "failure_diagnostic_current";
    messages.push({
      id: "assistant_failure_diagnostic",
      type: "ai",
      content: "",
      tool_calls: [{
        id: toolCallId,
        name: "failure_diagnostic",
        args: compactArgs({
          failureCode: diagnostics.failureCode ?? null,
          failureSummary: diagnostics.failureSummary,
          failureDetails: diagnostics.failureDetails ?? null,
          recoveryHint: diagnostics.recoveryHint ?? null,
        }),
        partial_json: JSON.stringify(compactArgs({
          failureCode: diagnostics.failureCode ?? null,
          failureSummary: diagnostics.failureSummary,
          failureDetails: diagnostics.failureDetails ?? null,
          recoveryHint: diagnostics.recoveryHint ?? null,
        })),
      }],
      additional_kwargs: {
        metadata: {
          synthetic: true,
          kind: "diagnostic",
        },
      },
    });
    messages.push({
      id: "tool_failure_diagnostic",
      type: "tool",
      tool_call_id: toolCallId,
      name: "failure_diagnostic",
      content: diagnostics.failureSummary,
      artifact: {
        summary: diagnostics.failureSummary,
        output: diagnostics,
        success: false,
        errorCode: diagnostics.failureCode ?? undefined,
      },
      status: "error",
    });
  }

  return messages;
}
