import type { z } from "zod";
import type { AgentToolDefinition } from "../agents/tools/toolTypes";
import type { AgentToolName, ToolExecutionContext } from "../agents/types";

/**
 * 把内部 AgentToolDefinition 适配成 MCP tool 注册所需的形状。
 * - inputSchema：内部已经是 zod v4 schema，直接透传给 MCP SDK（SDK 自己做校验和 JSON Schema 转换）。
 * - annotations：从 category / riskLevel 映射成 MCP 的 hints（只读 / 破坏性）。
 * - approvalRequired 等元数据放到 _meta 里，供调用方做人工确认。
 */
export interface McpToolSpec {
  name: AgentToolName;
  title: string;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  meta: {
    title: string;
    category: string;
    riskLevel: string;
    domainAgent: string;
    approvalRequired: boolean;
  };
}

export function adaptToolDefinition(
  def: AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>,
): McpToolSpec {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema as z.ZodType<Record<string, unknown>>,
    annotations: {
      readOnlyHint: def.category === "read",
      destructiveHint: def.riskLevel === "high",
      idempotentHint: def.category === "read",
      openWorldHint: false,
    },
    meta: {
      title: def.title,
      category: def.category,
      riskLevel: def.riskLevel,
      domainAgent: def.domainAgent,
      approvalRequired: def.approvalRequired ?? false,
    },
  };
}

/** 把工具执行结果包成 MCP 的 content 格式。 */
export function toMcpResultText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

export type { ToolExecutionContext };
