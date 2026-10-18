#!/usr/bin/env node
/**
 * AI-Novel-Writing-Assistant MCP Server（MVP）。
 *
 * 把内部 agent 工具系统（server/src/agents/toolRegistry）的一个策展子集，
 * 以 MCP tool 的形式暴露给外部 agent 调用。只做加法：不修改现有路由、
 * 服务、UI；工具本身是直接调 prisma/service 的纯函数。
 *
 * 启动：pnpm --filter @ai-novel/server mcp  （stdio 传输，供本地 agent 接入）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  configureAgentToolEntryBoundary,
  getAgentToolDefinition,
} from "../agents/toolRegistry";
import { MCP_CURATED_TOOLS } from "./curatedTools";
import { adaptToolDefinition, toMcpResultText } from "./toolAdapter";
import { createMcpToolContext, extractContextFields } from "./contextFactory";

const SERVER_NAME = "ai-novel-writing-assistant";
const SERVER_VERSION = "0.5.13";

async function main(): Promise<void> {
  // 安全边界：只允许白名单里的工具走 MCP；阻断名单外的（纵深防御，
  // 即使之后有人误注册了新工具也不会自动暴露）。
  configureAgentToolEntryBoundary({
    unavailableTools: [],
    assertExecutionAllowed: async (name, _context, _input) => {
      if (!MCP_CURATED_TOOLS.includes(name)) {
        throw new Error(`[mcp] tool "${name}" is not exposed via MCP.`);
      }
    },
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  let registered = 0;
  for (const toolName of MCP_CURATED_TOOLS) {
    const def = getAgentToolDefinition(toolName);
    if (!def) {
      console.error(`[mcp] tool definition not found: ${toolName}, skipped`);
      continue;
    }
    const spec = adaptToolDefinition(def);
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        annotations: spec.annotations,
        _meta: spec.meta,
      },
      async (args: Record<string, unknown>) => {
        const context = createMcpToolContext(extractContextFields(args));
        const result = await def.execute(context, args);
        return {
          content: [{ type: "text" as const, text: toMcpResultText(result) }],
        };
      },
    );
    registered += 1;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 注意：stdio 传输下 stdout 是协议通道，日志只能走 stderr。
  console.error(`[mcp] ${SERVER_NAME} v${SERVER_VERSION} running on stdio, ${registered} tools registered`);
}

main().catch((err) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
