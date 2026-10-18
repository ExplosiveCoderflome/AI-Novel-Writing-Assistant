# MCP Server：外部 Agent 调用接口

## Background

项目内部已经有一套 agent 工具系统（`server/src/agents/toolRegistry.ts`），60 个工具、
每个都有 zod 定义的 input/output schema 和 `riskLevel` / `approvalRequired` 元数据，
原本只服务于内置的 planner。当外部 agent（例如独立运行的 AI 助手）需要驱动项目时，
需要的不是面向前端的 REST API，而是一个 agent 友好的工具调用接口。

## Decision

新增 `server/src/mcp/`，实现一个 MCP Server（stdio 传输），把内部工具的一个策展子集
（21 个）以 MCP tool 形式暴露出去。选型理由：

- `AgentToolDefinition` 到 MCP tool 是机械映射（name / description / zod schema / execute），
  MCP 是最薄的一层皮；
- 内部工具的 `execute` 都是直接调 prisma / service 的纯函数，不依赖 HTTP 请求状态，
  换调用入口无侵入；
- 现有的 `configureAgentToolEntryBoundary` 钩子就是为"application composition"设计的，
  MCP Server 用它配置自己的白名单边界，无需改动现有代码。

## Current Rule

- 只做加法：`server/src/mcp/` 下四个文件（`index.ts` 入口、`curatedTools.ts` 白名单、
  `toolAdapter.ts` 适配、`contextFactory.ts` 上下文构造），不改现有路由、服务、UI。
- 白名单策展原则：读多写少；写操作只保留建小说、存草稿等低风险项；
  `apply_chapter_patch` / `diff_chapter_patch` / `queue_pipeline_run` 等暂不暴露。
- `ToolExecutionContext` 是纯数据接口，外部直接构造（`runId: mcp-<uuid>`，`agentName: "Planner"`），
  不需要给 `AgentName` 联合类型加新成员。
- `approvalRequired` 的工具通过 MCP `_meta` 透出，由调用方做人工确认；服务端纵深防御
  （白名单 + `assertExecutionAllowed`）。
- stdio 传输下 stdout 是协议通道，所有日志走 stderr。
- 启动命令：`pnpm --filter @ai-novel/server mcp`（先 `pnpm build`）。
- MCP Server 与 API Server 是两个独立进程，共享同一个数据库（本地单用户场景）。

## Examples

- 外部 agent 建书并查状态：`create_novel` → `get_novel_production_status`。
- 驱动导演：`start_full_novel_pipeline` → 轮询 `get_director_run_status` →
  `run_director_until_gate`，卡住时 `explain_generation_blocker` 诊断。

## Failure Modes

- MCP SDK 大版本对 `inputSchema` 的要求不同（如 1.32 只接受 Zod schema / raw shape，
  不接受纯 JSON Schema 对象）：适配层直接透传内部 zod schema，让 SDK 自己做校验和转换。
- 构建内存：server 全量 `tsc` 在小内存机器上可能 OOM，
  用 `NODE_OPTIONS="--max-old-space-size=6144" pnpm build`。

## Related Modules

- `server/src/agents/toolRegistry.ts`（工具注册表、安全边界钩子）
- `server/src/agents/tools/*`（工具实现）
- `server/src/agents/types.ts`（`ToolExecutionContext`、`AgentToolName`）
