const test = require("node:test");
const assert = require("node:assert/strict");
const { listAgentToolDefinitions } = require("../dist/agents/toolRegistry.js");

test("tool registry exposes chapter range and cross-domain tools", () => {
  const tools = listAgentToolDefinitions().map((item) => item.name);
  assert.ok(tools.includes("list_novels"));
  assert.ok(tools.includes("create_novel"));
  assert.ok(tools.includes("select_novel_workspace"));
  assert.ok(tools.includes("list_chapters"));
  assert.ok(tools.includes("get_chapter_by_order"));
  assert.ok(tools.includes("get_chapter_content_by_order"));
  assert.ok(tools.includes("summarize_chapter_range"));
  assert.ok(tools.includes("list_book_analyses"));
  assert.ok(tools.includes("list_knowledge_documents"));
  assert.ok(tools.includes("list_worlds"));
  assert.ok(tools.includes("bind_world_to_novel"));
  assert.ok(tools.includes("list_writing_formulas"));
  assert.ok(tools.includes("list_base_characters"));
  assert.ok(tools.includes("list_tasks"));
  assert.ok(tools.includes("get_run_failure_reason"));
  assert.ok(tools.includes("explain_generation_blocker"));
});
