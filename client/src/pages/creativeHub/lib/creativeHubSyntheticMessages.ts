import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type { CreativeHubInterrupt, CreativeHubTurnSummary } from "@ai-novel/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";
import type { LangChainMessage } from "@assistant-ui/react-langgraph";
import type { CreativeHubDebugTraceEntry } from "../components/CreativeHubDebugTraceCard";
import { getIntentDisplayLabel, getPlannerSourceDisplayLabel } from "./plannerLabels";

function compactArgs(record: Record<string, string | boolean | null | undefined>) {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string | boolean | null] => entry[1] !== undefined),
  );
}

function toStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "queued":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "waiting_approval":
      return "Waiting for approval";
    case "succeeded":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "failed":
      return "fail";
    case "cancelled":
      return "Canceled";
    case "interrupted":
      return "To be confirmed";
    default:
      return status;
  }
}

function createTurnSummaryMessage(summary: CreativeHubTurnSummary): LangChainMessage {
  const payload = JSON.parse(JSON.stringify(summary)) as any;
  return {
    id: `assistant_turn_summary_${summary.runId}`,
    type: "ai",
    content: "",
    tool_calls: [{
      id: `turn_summary_${summary.runId}`,
      name: "creative_hub_turn_summary",
      args: payload,
      partial_json: JSON.stringify(summary),
    }],
    additional_kwargs: {
      metadata: {
        synthetic: true,
        kind: "turn_summary",
        runId: summary.runId,
      },
    },
  };
}

function createDebugTraceMessage(
  runId: string,
  entries: CreativeHubDebugTraceEntry[],
  defaultCollapsed: boolean,
): LangChainMessage {
  const payload = {
    runId,
    entries,
    defaultCollapsed,
  } as any;
  return {
    id: `assistant_debug_trace_${runId}`,
    type: "ai",
    content: "",
    tool_calls: [{
      id: `debug_trace_${runId}`,
      name: "creative_hub_debug_trace",
      args: payload,
      partial_json: JSON.stringify(payload),
    }],
    additional_kwargs: {
      metadata: {
        synthetic: true,
        kind: "debug_trace",
        runId,
      },
    },
  };
}

export interface CreativeHubRunArtifacts {
  runId: string;
  turnSummary?: CreativeHubTurnSummary;
  debugEntries: CreativeHubDebugTraceEntry[];
}

function hasMeaningfulDebugEntries(entries: CreativeHubDebugTraceEntry[]): boolean {
  return entries.some((entry) => (
    entry.id.startsWith("tool_call_")
    || entry.id.startsWith("tool_result_")
    || entry.id.startsWith("approval_")
    || entry.id.startsWith("error_")
  ));
}

export function buildRunArtifactMessages(
  runArtifacts: CreativeHubRunArtifacts[],
  defaultCollapsed: boolean,
): LangChainMessage[][] {
  return runArtifacts
    .filter((artifact) => artifact.turnSummary || hasMeaningfulDebugEntries(artifact.debugEntries))
    .map((artifact) => {
      const messages: LangChainMessage[] = [];
      if (artifact.turnSummary) {
        messages.push(createTurnSummaryMessage(artifact.turnSummary));
      }
      if (hasMeaningfulDebugEntries(artifact.debugEntries)) {
        messages.push(createDebugTraceMessage(artifact.runId, artifact.debugEntries, defaultCollapsed));
      }
      return messages;
    });
}

export function mergeDisplayMessages(
  baseMessages: LangChainMessage[],
  inlineStateMessages: LangChainMessage[],
  runArtifactMessages: LangChainMessage[][],
): LangChainMessage[] {
  if (runArtifactMessages.length === 0 && inlineStateMessages.length === 0) {
    return baseMessages;
  }

  const aiIndices = baseMessages.reduce<number[]>((result, message, index) => {
    if (message.type === "ai") {
      result.push(index);
    }
    return result;
  }, []);

  const artifactStartIndex = Math.max(0, aiIndices.length - runArtifactMessages.length);
  const artifactTargetIndices = aiIndices.slice(artifactStartIndex);
  const artifactMap = new Map<number, LangChainMessage[]>();
  artifactTargetIndices.forEach((targetIndex, index) => {
    const artifactGroup = runArtifactMessages[index];
    if (artifactGroup?.length) {
      artifactMap.set(targetIndex, artifactGroup);
    }
  });

  const merged: LangChainMessage[] = [];
  baseMessages.forEach((message, index) => {
    merged.push(message);
    const artifactGroup = artifactMap.get(index);
    if (artifactGroup?.length) {
      merged.push(...artifactGroup);
    }
  });

  return [...merged, ...inlineStateMessages];
}

function buildDebugTraceEntry(
  frame: CreativeHubStreamFrame,
  fallbackRunId: string | null,
  sequence: number,
): { runId: string; entry: CreativeHubDebugTraceEntry } | null {
  if (frame.event === "creative_hub/turn_summary" || frame.event === "creative_hub/interrupt") {
    return null;
  }

  if (frame.event === "creative_hub/run_status") {
    const runId = frame.data.runId ?? fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `run_status_${sequence}`,
        kind: "Running status",
        title: "Running status",
        summary: frame.data.message || `当前状态：${toStatusLabel(frame.data.status)}`,
        meta: [toStatusLabel(frame.data.status), `Run ${runId.slice(0, 8)}`],
        tone: frame.data.status === "failed" || frame.data.status === "cancelled"
          ? "destructive"
          : frame.data.status === "waiting_approval"
            ? "secondary"
            : "default",
      },
    };
  }

  if (frame.event === "creative_hub/tool_call") {
    const runId = frame.data.runId ?? fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `tool_call_${sequence}`,
        kind: "Tool call",
        title: frame.data.toolName,
        summary: frame.data.inputSummary || "Preparing tool input.",
        meta: [
          `Run ${runId.slice(0, 8)}`,
          frame.data.stepId ? `Step ${frame.data.stepId.slice(0, 8)}` : "",
        ].filter(Boolean),
      },
    };
  }

  if (frame.event === "creative_hub/tool_result") {
    const runId = frame.data.runId ?? fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `tool_result_${sequence}`,
        kind: frame.data.success ? "Tool complete" : "Tool failed",
        title: frame.data.toolName,
        summary: frame.data.outputSummary || "The tool returned empty results.",
        meta: [
          frame.data.success ? "success" : "fail",
          `Run ${runId.slice(0, 8)}`,
        ],
        tone: frame.data.success ? "default" : "destructive",
      },
    };
  }

  if (frame.event === "creative_hub/approval_resolved") {
    const runId = fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `approval_${sequence}`,
        kind: "Approval results",
        title: frame.data.action === "approved" ? "Approval passed" : "Approval rejected",
        summary: frame.data.note?.trim() || "The current approval action has been recorded.",
        meta: [
          `Approval ${frame.data.approvalId.slice(0, 8)}`,
        ],
        tone: frame.data.action === "approved" ? "secondary" : "destructive",
      },
    };
  }

  if (frame.event === "creative_hub/error" || frame.event === "error") {
    const runId = fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `error_${sequence}`,
        kind: "Abnormal operation",
        title: "Abnormal operation",
        summary: frame.data.message,
        meta: [`Run ${runId.slice(0, 8)}`],
        tone: "destructive",
      },
    };
  }

  if (frame.event === "metadata" && typeof frame.data.reasoning === "string") {
    const runId = fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `reasoning_${sequence}`,
        kind: "Reasoning update",
        title: "Reasoning update",
        summary: frame.data.reasoning,
        meta: [`Run ${runId.slice(0, 8)}`],
      },
    };
  }

  if (frame.event === "metadata" && typeof frame.data.planner === "object" && frame.data.planner) {
    const runId = fallbackRunId;
    if (!runId) {
      return null;
    }
    const planner = frame.data.planner as Record<string, unknown>;
    return {
      runId,
      entry: {
        id: `planner_${sequence}`,
        kind: "Intent recognition",
        title: "Intent recognition",
        summary: `来源：${getPlannerSourceDisplayLabel(planner.source)}；意图：${getIntentDisplayLabel(planner.intent)}`,
        meta: [
          "confidence" in planner ? `置信度 ${String(planner.confidence ?? "-")}` : "",
          `Run ${runId.slice(0, 8)}`,
        ].filter(Boolean),
      },
    };
  }

  if (frame.event === "metadata" && typeof frame.data.checkpointId === "string") {
    const runId = typeof frame.data.runId === "string" && frame.data.runId.trim()
      ? frame.data.runId
      : fallbackRunId;
    if (!runId) {
      return null;
    }
    return {
      runId,
      entry: {
        id: `checkpoint_${sequence}`,
        kind: "Checkpoint",
        title: "Checkpoint has been written back",
        summary: `Checkpoint ${frame.data.checkpointId.slice(0, 8)} 已写回线程历史。`,
        meta: [`Run ${runId.slice(0, 8)}`],
      },
    };
  }

  return null;
}

export function createRunArtifactEvent(
  frame: CreativeHubStreamFrame,
  fallbackRunId: string | null,
  sequence: number,
) {
  return buildDebugTraceEntry(frame, fallbackRunId, sequence);
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
