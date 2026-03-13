import type { ToolCall, ToolExecutionContext } from "../types";

export function resolveToolInput(
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const nextInput = { ...input };
  if (typeof nextInput.novelId !== "string" && context.novelId) {
    nextInput.novelId = context.novelId;
  }
  if (typeof nextInput.worldId !== "string" && context.worldId) {
    nextInput.worldId = context.worldId;
  }
  return nextInput;
}

export function applyToolResultContext(
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  call: ToolCall,
  output?: Record<string, unknown>,
): Omit<ToolExecutionContext, "runId" | "agentName"> {
  if (!output) {
    return context;
  }
  const nextContext = { ...context };
  if ((call.tool === "create_novel" || call.tool === "select_novel_workspace")
    && typeof output.novelId === "string"
    && output.novelId.trim()) {
    nextContext.novelId = output.novelId.trim();
    nextContext.contextMode = "novel";
  }
  if ((call.tool === "generate_world_for_novel" || call.tool === "bind_world_to_novel")
    && typeof output.worldId === "string"
    && output.worldId.trim()) {
    nextContext.worldId = output.worldId.trim();
  }
  if (call.tool === "bind_world_to_novel"
    && typeof output.novelId === "string"
    && output.novelId.trim()) {
    nextContext.novelId = output.novelId.trim();
    nextContext.contextMode = "novel";
  }
  return nextContext;
}
