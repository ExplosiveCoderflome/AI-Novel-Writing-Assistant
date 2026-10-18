# MCP Server

把内部 agent 工具系统（`server/src/agents/`）的一个策展子集，以 MCP tool 形式
暴露给外部 agent 调用。只做加法，不改现有代码。

## 启动

```bash
# 先构建
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build

# 启动（stdio 传输）
pnpm --filter @ai-novel/server mcp
```

需要 `DATABASE_URL`（默认走开发库配置）。stdio 下 stdout 是协议通道，日志只走 stderr。

## 客户端接入示例（Claude Desktop）

```json
{
  "mcpServers": {
    "ai-novel": {
      "command": "node",
      "args": ["/path/to/AI-Novel-Writing-Assistant/server/dist/mcp/index.js"],
      "env": { "DATABASE_URL": "file:/path/to/dev.db" }
    }
  }
}
```

## 工具清单（21 个）

| 工具 | 说明 | 风险 | 需审批 |
|---|---|---|---|
| list_novels | 列出小说 | 低 | 否 |
| create_novel | 创建小说 | 中 | 否 |
| get_novel_context | 小说上下文总览 | 低 | 否 |
| get_novel_production_status | 生产状态 | 低 | 否 |
| start_full_novel_pipeline | 启动整本写作流水线 | 高 | 是 |
| get_director_run_status | 导演运行状态 | 低 | 否 |
| run_director_next_step | 执行导演下一步 | 高 | 是 |
| run_director_until_gate | 执行到审批门 | 高 | 是 |
| explain_director_next_action | 解释下一步动作 | 低 | 否 |
| generate_world_for_novel | 生成世界观 | 中 | 否 |
| generate_novel_characters | 生成角色 | 中 | 否 |
| generate_novel_outline | 生成大纲 | 中 | 否 |
| generate_story_bible | 生成设定集 | 中 | 否 |
| list_chapters | 章节列表 | 低 | 否 |
| get_chapter_content | 读取章节内容 | 低 | 否 |
| save_chapter_draft | 保存章节草稿 | 中 | 否 |
| list_worlds | 世界观列表 | 低 | 否 |
| get_world_detail | 世界观详情 | 低 | 否 |
| list_base_characters | 基础角色列表 | 低 | 否 |
| retry_task | 重试任务 | 中 | 否 |
| explain_generation_blocker | 生成卡住诊断 | 低 | 否 |

需审批的工具通过 MCP `_meta.approvalRequired` 透出，由调用方做人工确认。

白名单在 `curatedTools.ts` 里改；改完重新 `pnpm build` 即可。
