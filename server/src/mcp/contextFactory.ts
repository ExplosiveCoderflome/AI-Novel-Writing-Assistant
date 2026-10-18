import { randomUUID } from "node:crypto";
import type { ToolExecutionContext } from "../agents/types";

/**
 * 为 MCP 外部调用构造 ToolExecutionContext。
 * 内部 planner 用的 context 只是纯数据接口，不依赖 HTTP 请求状态，
 * 所以外部可以直接构造，无需改动现有类型（沿用 "Planner" 身份）。
 */
export function createMcpToolContext(input: {
  novelId?: string;
  worldId?: string;
}): ToolExecutionContext {
  return {
    runId: `mcp-${randomUUID()}`,
    agentName: "Planner",
    contextMode: input.novelId ? "novel" : "global",
    novelId: input.novelId,
    worldId: input.worldId,
  };
}

/** 从 MCP 工具参数里提取上下文相关的字段（novelId / worldId）。 */
export function extractContextFields(
  args: Record<string, unknown>,
): { novelId?: string; worldId?: string } {
  const novelId = typeof args["novelId"] === "string" ? args["novelId"] : undefined;
  const worldId = typeof args["worldId"] === "string" ? args["worldId"] : undefined;
  return { novelId, worldId };
}
